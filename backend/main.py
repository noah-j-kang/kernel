from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import time
import uuid
import json

from backend.database import db
from backend.engine import Engine
from backend.orderbook import Order
from backend.api_models import OrderRequest
from backend.auth import validate_auth_and_rate_limit
from backend.websocket_manager import ws_manager
from backend.bots import (
    market_maker_loop, 
    noise_trader_loop, 
    momentum_trader_loop, 
    fundamental_trader_loop, 
    arbitrageur_loop, 
    options_market_maker_loop
)

engine = Engine()

async def persistence_worker():
    while True:
        await asyncio.sleep(2.0)
        
        if not engine.trade_queue and not engine.wallet_updates:
            continue
            
        trades = list(engine.trade_queue)
        engine.trade_queue.clear()
        
        wallets_to_update = engine.wallet_updates.copy()
        engine.wallet_updates.clear()
        
        if db.pool:
            try:
                trade_dicts = [
                    {
                        "id": t.id,
                        "buyer_id": t.buyer_id,
                        "seller_id": t.seller_id,
                        "instrument_id": t.instrument_id,
                        "price": t.price,
                        "quantity": t.quantity,
                        "executed_at": t.executed_at
                    } for t in trades
                ]
                await db.bulk_insert_executions(trade_dicts, wallets_to_update)
            except Exception as e:
                print(f"DB Write failed: {e}")
                engine.trade_queue.extendleft(trades)
                for uid, w in wallets_to_update.items():
                    if uid not in engine.wallet_updates:
                        engine.wallet_updates[uid] = w

async def funding_worker():
    while True:
        await asyncio.sleep(10.0) # run every 10 seconds for simulation
        index_price = engine.get_midpoint("COOKIE-USD-SPOT")
        mark_price = engine.get_midpoint("COOKIE-PERP")
        
        if index_price is None or mark_price is None:
            continue
            
        funding_rate = (mark_price - index_price) / index_price * 0.05 # 5% clamping factor for simulation
        
        for uid, w in list(engine.wallets.items()):
            size = w.get("positions", {}).get("COOKIE-PERP", {}).get("size", 0.0)
            if size != 0:
                payment = size * mark_price * funding_rate
                w["margin_usd"] -= payment
                engine.wallet_updates[uid] = w.copy()
                asyncio.create_task(ws_manager.send_personal_message({
                    "type": "funding_payment",
                    "amount": -payment,
                    "rate": funding_rate
                }, uid))

        asyncio.create_task(ws_manager.broadcast_l2({
            "type": "funding_rate",
            "rate": funding_rate,
            "mark_price": mark_price,
            "index_price": index_price
        }))

async def liquidation_worker():
    while True:
        await asyncio.sleep(2.0)
        
        for uid, w in list(engine.wallets.items()):
            account_value = w.get("margin_usd", 0.0)
            maintenance_margin = 0.0
            
            for inst, pos in w.get("positions", {}).items():
                size = pos["size"]
                entry = pos["entry"]
                if size == 0: continue
                
                inst_mark = engine.get_midpoint(inst)
                if not inst_mark:
                    if "C" in inst or "P" in inst:
                        try:
                            strike = float(inst.split("-")[1][:-1])
                            spot = engine.get_midpoint("COOKIE-USD-SPOT") or 10.0
                            if "C" in inst:
                                inst_mark = max(0, spot - strike)
                            else:
                                inst_mark = max(0, strike - spot)
                        except:
                            inst_mark = entry
                    else:
                        inst_mark = entry
                        
                unrealized_pnl = (inst_mark - entry) * size
                account_value += unrealized_pnl
                maintenance_margin += abs(size) * inst_mark * 0.05
                
            if maintenance_margin > 0 and account_value < maintenance_margin:
                print(f"Liquidating {uid} - Account Value: {account_value} < MMR: {maintenance_margin}")
                
                for inst, pos in list(w.get("positions", {}).items()):
                    size = pos["size"]
                    if size == 0: continue
                    side = "sell" if size > 0 else "buy"
                    price = 0.01 if size > 0 else 99999.0
                    liq_order = Order(
                        order_id=str(uuid.uuid4()),
                        user_id=uid,
                        instrument_id=inst,
                        side=side,
                        type="limit",
                        price=price,
                        quantity=abs(size),
                        timestamp=time.time()
                    )
                    engine.process_limit_order(liq_order)
                
                asyncio.create_task(ws_manager.send_personal_message({
                    "type": "liquidation",
                    "message": "Your positions were liquidated."
                }, uid))

async def options_settlement_worker():
    from backend.orderbook import OrderBook
    while True:
        await asyncio.sleep(60.0) # Settle every 60 seconds
        spot_price = engine.get_midpoint("COOKIE-USD-SPOT")
        if not spot_price: continue
        
        # We assume strikes are 9, 10, 11
        for strike in [9, 10, 11]:
            inst_c = f"COOKIE-{strike}C"
            inst_p = f"COOKIE-{strike}P"
            
            val_c = max(0, spot_price - strike)
            val_p = max(0, strike - spot_price)
            
            for uid, w in list(engine.wallets.items()):
                pos_c = w.get("positions", {}).pop(inst_c, None)
                if pos_c:
                    settlement_pnl = pos_c["size"] * (val_c - pos_c["entry"])
                    w["margin_usd"] += settlement_pnl
                    engine.wallet_updates[uid] = w.copy()
                    
                pos_p = w.get("positions", {}).pop(inst_p, None)
                if pos_p:
                    settlement_pnl = pos_p["size"] * (val_p - pos_p["entry"])
                    w["margin_usd"] += settlement_pnl
                    engine.wallet_updates[uid] = w.copy()
            
            if inst_c in engine.orderbooks:
                engine.orderbooks[inst_c] = OrderBook()
            if inst_p in engine.orderbooks:
                engine.orderbooks[inst_p] = OrderBook()
                
        asyncio.create_task(ws_manager.broadcast_l2({
            "type": "options_settlement",
            "spot_price": spot_price
        }))

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Cookie Exchange Engine Starting...")
    await db.connect()
    persistence_task = asyncio.create_task(persistence_worker())
    funding_task = asyncio.create_task(funding_worker())
    liquidation_task = asyncio.create_task(liquidation_worker())
    options_settlement_task = asyncio.create_task(options_settlement_worker())
    
    bot_tasks = []
    
    # 2 Market Makers
    for i in range(2):
        bot_tasks.append(asyncio.create_task(market_maker_loop(f"mm_{i}", engine, "COOKIE-USD-SPOT")))
        bot_tasks.append(asyncio.create_task(market_maker_loop(f"perp_mm_{i}", engine, "COOKIE-PERP")))
        
    # 8 Noise Traders
    for i in range(8):
        bot_tasks.append(asyncio.create_task(noise_trader_loop(f"nt_{i}", engine, "COOKIE-USD-SPOT")))
        bot_tasks.append(asyncio.create_task(noise_trader_loop(f"perp_nt_{i}", engine, "COOKIE-PERP")))
        
    # 4 Momentum Traders
    for i in range(4):
        bot_tasks.append(asyncio.create_task(momentum_trader_loop(f"mom_{i}", engine, "COOKIE-USD-SPOT")))
        
    # 4 Fundamental Traders
    for i in range(4):
        bot_tasks.append(asyncio.create_task(fundamental_trader_loop(f"fund_{i}", engine, "COOKIE-USD-SPOT")))
        
    # 2 Arbitrageurs
    for i in range(2):
        bot_tasks.append(asyncio.create_task(arbitrageur_loop(f"arb_{i}", engine)))
        
    # 1 Options MM
    bot_tasks.append(asyncio.create_task(options_market_maker_loop("opt_mm", engine)))
    
    yield
    
    print("Cookie Exchange Engine Shutting Down...")
    for task in bot_tasks:
        task.cancel()
    persistence_task.cancel()
    funding_task.cancel()
    liquidation_task.cancel()
    options_settlement_task.cancel()
    await db.disconnect()

from backend.routers.auth_router import router as auth_router

app = FastAPI(title="Cookie Exchange API", version="1.0.0", lifespan=lifespan)
app.include_router(auth_router, prefix="/v1/auth", tags=["auth"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "cookie-exchange-engine"}

@app.get("/v1/wallet")
async def get_wallet(user_id: str = Depends(validate_auth_and_rate_limit)):
    return engine.get_wallet(user_id)

@app.post("/v1/orders")
async def place_order(req: OrderRequest, user_id: str = Depends(validate_auth_and_rate_limit)):
    # Simulate market friction: network/processing latency
    await asyncio.sleep(0.15)
    
    order = Order(
        order_id=str(uuid.uuid4()),
        user_id=user_id,
        instrument_id=req.instrument_id,
        side=req.side,
        type=req.type,
        price=req.price or 0.0,
        quantity=req.quantity,
        timestamp=time.time()
    )
    
    executions = engine.process_limit_order(order)
    
    asyncio.create_task(ws_manager.broadcast_l2({
        "type": "l2_update",
        "instrument_id": req.instrument_id,
        "book": engine.get_orderbook(req.instrument_id).get_snapshot()
    }))
    
    for exc in executions:
        fill_msg = {
            "type": "fill",
            "price": exc.price,
            "quantity": exc.quantity
        }
        asyncio.create_task(ws_manager.send_personal_message(fill_msg, exc.buyer_id))
        asyncio.create_task(ws_manager.send_personal_message(fill_msg, exc.seller_id))

    return {"order_id": order.order_id, "status": "open"}

@app.delete("/v1/orders/{order_id}")
async def cancel_order(order_id: str, instrument_id: str = "COOKIE-USD-SPOT", user_id: str = Depends(validate_auth_and_rate_limit)):
    # Simulate market friction: network/processing latency
    await asyncio.sleep(0.15)
    
    success = engine.cancel_order(order_id, instrument_id)
    return {"success": success}

@app.get("/v1/orderbook")
async def get_orderbook(instrument_id: str = "COOKIE-USD-SPOT"):
    return engine.get_orderbook(instrument_id).get_snapshot()

@app.get("/v1/leaderboard")
async def get_leaderboard():
    spot_price = engine.get_midpoint("COOKIE-USD-SPOT") or 10.0
    
    leaderboard = []
    for uid, w in engine.wallets.items():
        total_capital = w.get("usd", 0.0) + w.get("margin_usd", 0.0)
        total_capital += w.get("cookie", 0.0) * spot_price
        
        for inst, pos in w.get("positions", {}).items():
            size = pos["size"]
            entry = pos["entry"]
            if size == 0: continue
            
            inst_mark = engine.get_midpoint(inst)
            if not inst_mark:
                if "C" in inst or "P" in inst:
                    try:
                        strike = float(inst.split("-")[1][:-1])
                        if "C" in inst:
                            inst_mark = max(0, spot_price - strike)
                        else:
                            inst_mark = max(0, strike - spot_price)
                    except:
                        inst_mark = entry
                else:
                    inst_mark = entry
                    
            unrealized_pnl = (inst_mark - entry) * size
            total_capital += unrealized_pnl

        name = uid
        if uid.startswith("mm_") or uid.startswith("perp_mm_"):
            name = f"Market Maker {uid.split('_')[-1]}"
        elif uid.startswith("nt_") or uid.startswith("perp_nt_"):
            name = f"Noise Trader {uid.split('_')[-1]}"
        elif uid.startswith("mom_"):
            name = f"Momentum Trader {uid.split('_')[-1]}"
        elif uid.startswith("fund_"):
            name = f"Value Investor {uid.split('_')[-1]}"
        elif uid.startswith("arb_"):
            name = f"Arbitrageur {uid.split('_')[-1]}"
        elif uid == "opt_mm":
            name = "Options Market Maker"

        leaderboard.append({"name": name, "capital": total_capital})

    leaderboard.sort(key=lambda x: x["capital"], reverse=True)
    
    # add ranking
    for i, entry in enumerate(leaderboard[:10]):
        entry["rank"] = i + 1
        
    return leaderboard[:10]

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    user_id = None
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
            else:
                try:
                    parsed = json.loads(data)
                    if parsed.get("type") == "auth":
                        token = parsed.get("api_key")
                        user_id = token
                        if token and len(token) > 100: # Heuristic for JWT
                            try:
                                import jwt
                                import os
                                unverified_header = jwt.get_unverified_header(token)
                                alg = unverified_header.get("alg")
                                
                                if alg == "RS256":
                                    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
                                    jwks_client = jwt.PyJWKClient(f"{supabase_url}/auth/v1/.well-known/jwks.json")
                                    signing_key = jwks_client.get_signing_key_from_jwt(token)
                                    secret_or_key = signing_key.key
                                else:
                                    secret_or_key = os.getenv("SUPABASE_JWT_SECRET", "")
                                    
                                payload = jwt.decode(token, secret_or_key, algorithms=["HS256", "RS256"], audience="authenticated")
                                user_id = payload.get("sub") or token
                            except Exception:
                                pass
                        
                        if user_id:
                            ws_manager.user_connections[user_id] = websocket
                except:
                    pass
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, user_id)
