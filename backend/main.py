from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect
from contextlib import asynccontextmanager
import asyncio
import time
import uuid

from backend.database import db
from backend.engine import Engine
from backend.orderbook import Order
from backend.api_models import OrderRequest
from backend.auth import validate_auth_and_rate_limit
from backend.websocket_manager import ws_manager
from backend.bots import market_maker_loop, noise_trader_loop

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

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Kernel Exchange Engine Starting...")
    await db.connect()
    persistence_task = asyncio.create_task(persistence_worker())
    
    bot_tasks = []
    for i in range(5):
        bot_tasks.append(asyncio.create_task(market_maker_loop(f"mm_{i}", engine)))
        bot_tasks.append(asyncio.create_task(noise_trader_loop(f"nt_{i}", engine)))
    
    yield
    
    print("Kernel Exchange Engine Shutting Down...")
    for task in bot_tasks:
        task.cancel()
    persistence_task.cancel()
    await db.disconnect()

app = FastAPI(title="Kernel Exchange API", version="1.0.0", lifespan=lifespan)

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "kernel-exchange-engine"}

@app.post("/v1/orders")
async def place_order(req: OrderRequest, user_id: str = Depends(validate_auth_and_rate_limit)):
    order = Order(
        order_id=str(uuid.uuid4()),
        user_id=user_id,
        side=req.side,
        type=req.type,
        price=req.price or 0.0,
        quantity=req.quantity,
        timestamp=time.time()
    )
    
    executions = engine.process_limit_order(order)
    
    asyncio.create_task(ws_manager.broadcast_l2({
        "type": "l2_update",
        "book": engine.orderbook.get_snapshot()
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
async def cancel_order(order_id: str, user_id: str = Depends(validate_auth_and_rate_limit)):
    success = engine.cancel_order(order_id)
    return {"success": success}

@app.get("/v1/orderbook")
async def get_orderbook():
    return engine.orderbook.get_snapshot()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
