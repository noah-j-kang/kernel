import asyncio
import random
import time
import uuid
import math
from backend.engine import Engine
from backend.orderbook import Order
from backend.websocket_manager import ws_manager

async def market_maker_loop(bot_id: str, engine: Engine, instrument_id: str = "COOKIE-USD-SPOT"):
    """Avellaneda-Stoikov Inventory Model"""
    target_price = 10.00
    spread = 0.05
    gamma = random.uniform(0.0001, 0.001) # Risk aversion parameter
    
    engine.update_wallet(bot_id, 200000.0, 0.0)
    
    while True:
        try:
            inventory_cookie = engine.get_wallet(bot_id)["cookie"]
            # Inventory skew based on gamma
            inventory_skew = inventory_cookie * gamma 
            current_mid = engine.get_midpoint(instrument_id) or target_price
            adjusted_mid = current_mid - inventory_skew
            
            # Small jitter in spread
            jitter = random.uniform(0.0, 0.02)
            bid_price = round(adjusted_mid - (spread / 2) - jitter, 2)
            ask_price = round(adjusted_mid + (spread / 2) + jitter, 2)
            
            engine.cancel_all_orders_for_user(bot_id)
            
            if inventory_cookie < 100000:
                buy_order = Order(
                    order_id=str(uuid.uuid4()), user_id=bot_id, instrument_id=instrument_id, side="buy", type="limit",
                    price=bid_price, quantity=random.uniform(500, 1500), timestamp=time.time()
                )
                engine.process_limit_order(buy_order)
                
            if inventory_cookie > -100000:
                sell_order = Order(
                    order_id=str(uuid.uuid4()), user_id=bot_id, instrument_id=instrument_id, side="sell", type="limit",
                    price=ask_price, quantity=random.uniform(500, 1500), timestamp=time.time()
                )
                engine.process_limit_order(sell_order)
                
            await ws_manager.broadcast_l2({
                "type": "l2_update",
                "instrument_id": instrument_id,
                "book": engine.get_orderbook(instrument_id).get_snapshot()
            })
            
        except Exception as e:
            print(f"MM Bot Error {bot_id}: {e}")
            
        await asyncio.sleep(random.uniform(0.5, 1.5))


async def noise_trader_loop(bot_id: str, engine: Engine, instrument_id: str = "COOKIE-USD-SPOT"):
    """Retail / Liquidity consumers - Poisson arrival, Pareto sizing"""
    engine.update_wallet(bot_id, 50000.0, 0.0)
    
    while True:
        try:
            # Poisson arrival time (average 3 seconds)
            wait_time = random.expovariate(1.0 / 3.0)
            await asyncio.sleep(wait_time)
            
            current_mid = engine.get_midpoint(instrument_id) or 10.00
            inventory_cookie = engine.get_wallet(bot_id)["cookie"]
            
            if inventory_cookie > 10000: side = "sell"
            elif inventory_cookie < -10000: side = "buy"
            else: side = "buy" if random.random() < 0.5 else "sell"
            
            # Power law distribution for size (alpha=2, typical for financial data)
            # This generates mostly small trades, with occasional massive ones
            pareto_val = random.paretovariate(2.0)
            quantity = min(round(10 * pareto_val), 1000) # cap at 1000 to prevent engine breaking instantly
            
            if random.random() < 0.8:
                # Limit order randomly distributed around midpoint
                price = round(random.normalvariate(current_mid, 0.15), 2)
                order = Order(
                    order_id=str(uuid.uuid4()), user_id=bot_id, instrument_id=instrument_id, side=side, type="limit",
                    price=price, quantity=float(quantity), timestamp=time.time()
                )
                engine.process_limit_order(order)
            else:
                # Simulated Market order
                price = 99999.0 if side == "buy" else 0.01
                order = Order(
                    order_id=str(uuid.uuid4()), user_id=bot_id, instrument_id=instrument_id, side=side, type="limit",
                    price=price, quantity=float(quantity), timestamp=time.time()
                )
                engine.process_limit_order(order)
                
            await ws_manager.broadcast_l2({
                "type": "l2_update",
                "instrument_id": instrument_id,
                "book": engine.get_orderbook(instrument_id).get_snapshot()
            })
                
        except Exception as e:
            print(f"NT Bot Error {bot_id}: {e}")


async def momentum_trader_loop(bot_id: str, engine: Engine, instrument_id: str = "COOKIE-USD-SPOT"):
    """Chartists / Trend Followers"""
    engine.update_wallet(bot_id, 100000.0, 0.0)
    
    # Heterogeneous lookbacks
    short_window = random.randint(3, 8)
    long_window = random.randint(15, 30)
    history = []
    
    while True:
        try:
            await asyncio.sleep(2.0) # Check every 2 seconds
            current_mid = engine.get_midpoint(instrument_id)
            if not current_mid: continue
            
            history.append(current_mid)
            if len(history) > long_window:
                history.pop(0)
                
            if len(history) == long_window:
                short_sma = sum(history[-short_window:]) / short_window
                long_sma = sum(history) / long_window
                
                # Crossover logic
                if short_sma > long_sma * 1.002: # 0.2% upward breakout
                    order = Order(order_id=str(uuid.uuid4()), user_id=bot_id, instrument_id=instrument_id, side="buy", type="limit", price=99999.0, quantity=random.uniform(50, 150), timestamp=time.time())
                    engine.process_limit_order(order)
                    # Clear history slightly to avoid buying every tick in an uptrend
                    history = history[short_window:] 
                elif short_sma < long_sma * 0.998: # 0.2% downward breakdown
                    order = Order(order_id=str(uuid.uuid4()), user_id=bot_id, instrument_id=instrument_id, side="sell", type="limit", price=0.01, quantity=random.uniform(50, 150), timestamp=time.time())
                    engine.process_limit_order(order)
                    history = history[short_window:]
                    
        except Exception as e:
            print(f"Momentum Bot Error {bot_id}: {e}")


async def fundamental_trader_loop(bot_id: str, engine: Engine, instrument_id: str = "COOKIE-USD-SPOT"):
    """Value investors - Ornstein-Uhlenbeck fair value drift"""
    engine.update_wallet(bot_id, 250000.0, 0.0)
    
    true_mean = 10.00
    theta = 0.05 # Speed of mean reversion
    sigma = 0.1 # Volatility
    fair_value = true_mean
    
    while True:
        try:
            await asyncio.sleep(3.0)
            # O-U Process step
            dw = random.gauss(0, 1)
            fair_value += theta * (true_mean - fair_value) + sigma * dw
            
            current_mid = engine.get_midpoint(instrument_id)
            if not current_mid: continue
            
            deviation = current_mid - fair_value
            
            # If price deviates by more than 2% from their perceived fair value, fade it
            if deviation > (fair_value * 0.02):
                # Sell (price too high)
                order = Order(order_id=str(uuid.uuid4()), user_id=bot_id, instrument_id=instrument_id, side="sell", type="limit", price=current_mid - 0.01, quantity=100.0, timestamp=time.time())
                engine.process_limit_order(order)
            elif deviation < -(fair_value * 0.02):
                # Buy (price too low)
                order = Order(order_id=str(uuid.uuid4()), user_id=bot_id, instrument_id=instrument_id, side="buy", type="limit", price=current_mid + 0.01, quantity=100.0, timestamp=time.time())
                engine.process_limit_order(order)
                
        except Exception as e:
            print(f"Fundamental Bot Error {bot_id}: {e}")


async def arbitrageur_loop(bot_id: str, engine: Engine):
    """Statistical Arbitrage across Spot and Perp"""
    engine.update_wallet(bot_id, 500000.0, 0.0)
    
    while True:
        try:
            await asyncio.sleep(1.0)
            spot_mid = engine.get_midpoint("COOKIE-USD-SPOT")
            perp_mid = engine.get_midpoint("COOKIE-PERP")
            
            if not spot_mid or not perp_mid: continue
            
            spread = (perp_mid - spot_mid) / spot_mid
            
            if spread > 0.005: # Perp is expensive (>0.5% premium), short perp, long spot
                # Market Sell Perp
                o1 = Order(str(uuid.uuid4()), bot_id, "COOKIE-PERP", "sell", "limit", 0.01, 200, time.time())
                # Market Buy Spot
                o2 = Order(str(uuid.uuid4()), bot_id, "COOKIE-USD-SPOT", "buy", "limit", 99999.0, 200, time.time())
                engine.process_limit_order(o1)
                engine.process_limit_order(o2)
            elif spread < -0.005: # Perp is cheap, long perp, short spot
                o1 = Order(str(uuid.uuid4()), bot_id, "COOKIE-PERP", "buy", "limit", 99999.0, 200, time.time())
                o2 = Order(str(uuid.uuid4()), bot_id, "COOKIE-USD-SPOT", "sell", "limit", 0.01, 200, time.time())
                engine.process_limit_order(o1)
                engine.process_limit_order(o2)
                
        except Exception as e:
            print(f"Arb Bot Error {bot_id}: {e}")


async def options_market_maker_loop(bot_id: str, engine: Engine):
    """Simple options market maker keeping options liquid"""
    engine.update_wallet(bot_id, 1000000.0, 0.0) 
    strikes = [9, 10, 11]
    
    while True:
        try:
            spot_price = engine.get_midpoint("COOKIE-USD-SPOT") or 10.00
            time_value = 0.25 
            spread = 0.10
            
            engine.cancel_all_orders_for_user(bot_id)
            
            for strike in strikes:
                inst_c = f"COOKIE-{strike}C"
                intrinsic_c = max(0, spot_price - strike)
                fair_c = intrinsic_c + time_value
                
                inst_p = f"COOKIE-{strike}P"
                intrinsic_p = max(0, strike - spot_price)
                fair_p = intrinsic_p + time_value
                
                for inst, fair in [(inst_c, fair_c), (inst_p, fair_p)]:
                    bid = round(max(0.01, fair - spread / 2), 2)
                    ask = round(fair + spread / 2, 2)
                    
                    buy_order = Order(
                        order_id=str(uuid.uuid4()), user_id=bot_id, instrument_id=inst, side="buy", type="limit",
                        price=bid, quantity=500.0, timestamp=time.time()
                    )
                    engine.process_limit_order(buy_order)
                    
                    sell_order = Order(
                        order_id=str(uuid.uuid4()), user_id=bot_id, instrument_id=inst, side="sell", type="limit",
                        price=ask, quantity=500.0, timestamp=time.time()
                    )
                    engine.process_limit_order(sell_order)
                    
            await asyncio.sleep(2.0)
        except Exception as e:
            print(f"Options MM Error {bot_id}: {e}")
            await asyncio.sleep(2.0)
