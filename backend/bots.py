import asyncio
import random
import time
import uuid
from backend.engine import Engine
from backend.orderbook import Order
from backend.websocket_manager import ws_manager

async def market_maker_loop(bot_id: str, engine: Engine):
    target_price = 10.00
    spread = 0.05
    
    # Pre-fund bot for the session
    engine.update_wallet(bot_id, 100000.0, 0.0)
    
    while True:
        try:
            # Adjust quotes based on inventory skew (Avellaneda-Stoikov variant)
            inventory_kernel = engine.get_wallet(bot_id)["kernel"]
            inventory_skew = inventory_kernel * 0.001 
            adjusted_mid = target_price - inventory_skew
            
            bid_price = round(adjusted_mid - (spread / 2), 2)
            ask_price = round(adjusted_mid + (spread / 2), 2)
            
            # Cancel old quotes
            engine.cancel_all_orders_for_user(bot_id)
            
            # Place new quotes
            if inventory_kernel < 50000:
                buy_order = Order(
                    order_id=str(uuid.uuid4()), user_id=bot_id, side="buy", type="limit",
                    price=bid_price, quantity=1000.0, timestamp=time.time()
                )
                engine.process_limit_order(buy_order)
                
            if inventory_kernel > -50000:
                sell_order = Order(
                    order_id=str(uuid.uuid4()), user_id=bot_id, side="sell", type="limit",
                    price=ask_price, quantity=1000.0, timestamp=time.time()
                )
                engine.process_limit_order(sell_order)
                
            # Broadcast updated L2 book
            await ws_manager.broadcast_l2({
                "type": "l2_update",
                "book": engine.orderbook.get_snapshot()
            })
            
        except Exception as e:
            print(f"MM Bot Error {bot_id}: {e}")
            
        await asyncio.sleep(1.0)


async def noise_trader_loop(bot_id: str, engine: Engine):
    engine.update_wallet(bot_id, 100000.0, 0.0)
    
    while True:
        try:
            # Poisson arrival time (average 3 seconds)
            wait_time = random.expovariate(1.0 / 3.0)
            await asyncio.sleep(wait_time)
            
            current_mid = engine.get_midpoint() or 10.00
            inventory_kernel = engine.get_wallet(bot_id)["kernel"]
            
            # Prevent runaway inventory bounds for NT bots
            if inventory_kernel > 10000: side = "sell"
            elif inventory_kernel < -10000: side = "buy"
            else: side = "buy" if random.random() < 0.5 else "sell"
            
            if random.random() < 0.8:
                # Limit order randomly distributed around midpoint
                price = round(random.normalvariate(current_mid, 0.15), 2)
                quantity = random.randint(10, 500)
                order = Order(
                    order_id=str(uuid.uuid4()), user_id=bot_id, side=side, type="limit",
                    price=price, quantity=float(quantity), timestamp=time.time()
                )
                engine.process_limit_order(order)
            else:
                # Simulated Market order (a deep limit order for our simple engine structure)
                price = 99999.0 if side == "buy" else 0.01
                quantity = random.randint(50, 200)
                order = Order(
                    order_id=str(uuid.uuid4()), user_id=bot_id, side=side, type="limit",
                    price=price, quantity=float(quantity), timestamp=time.time()
                )
                engine.process_limit_order(order)
                
            await ws_manager.broadcast_l2({
                "type": "l2_update",
                "book": engine.orderbook.get_snapshot()
            })
                
        except Exception as e:
            print(f"NT Bot Error {bot_id}: {e}")
