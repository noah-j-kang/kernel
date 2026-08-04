import time
import uuid
from typing import List
from collections import deque
from backend.orderbook import Order, OrderBook

class Execution:
    def __init__(self, instrument_id: str, buyer_id: str, seller_id: str, price: float, quantity: float, executed_at: float):
        self.id = str(uuid.uuid4())
        self.instrument_id = instrument_id
        self.buyer_id = buyer_id
        self.seller_id = seller_id
        self.price = price
        self.quantity = quantity
        self.executed_at = executed_at

class Engine:
    def __init__(self):
        self.orderbooks: dict[str, OrderBook] = {"COOKIE-USD-SPOT": OrderBook()}
        self.trade_queue: deque[Execution] = deque()
        self.wallets = {} # {user_id: {"usd": 100000.0, "cookie": 0.0, "margin_usd": 0.0, "cookie_perp": 0.0}}
        self.wallet_updates = {}
        
    def get_wallet(self, user_id: str):
        if user_id not in self.wallets:
            self.wallets[user_id] = {"usd": 100000.0, "cookie": 0.0, "margin_usd": 0.0, "positions": {}}
        return self.wallets[user_id]
        
    def update_wallet(self, user_id: str, usd_delta: float, cookie_delta: float, margin_usd_delta: float = 0.0):
        w = self.get_wallet(user_id)
        w["usd"] += usd_delta
        w["cookie"] += cookie_delta
        w["margin_usd"] += margin_usd_delta
        self.wallet_updates[user_id] = w.copy()
        
    def update_derivative_position(self, user_id: str, instrument_id: str, trade_qty: float, exec_price: float, fee: float):
        w = self.get_wallet(user_id)
        pos = w["positions"].get(instrument_id, {"size": 0.0, "entry": 0.0})
        current_size = pos["size"]
        current_entry = pos["entry"]
        
        realized_pnl = 0.0
        
        # Determine if we are increasing or decreasing the position
        if (current_size >= 0 and trade_qty > 0) or (current_size <= 0 and trade_qty < 0):
            # Increasing position
            new_size = current_size + trade_qty
            if new_size != 0:
                new_entry = (abs(current_size) * current_entry + abs(trade_qty) * exec_price) / abs(new_size)
            else:
                new_entry = 0.0
            w["positions"][instrument_id] = {"size": new_size, "entry": new_entry}
        else:
            # Closing position
            if abs(trade_qty) <= abs(current_size):
                # Partial or full close
                closed_qty = abs(trade_qty)
                pnl_per_contract = exec_price - current_entry if current_size > 0 else current_entry - exec_price
                realized_pnl = closed_qty * pnl_per_contract
                
                new_size = current_size + trade_qty
                if new_size == 0:
                    w["positions"].pop(instrument_id, None)
                else:
                    w["positions"][instrument_id] = {"size": new_size, "entry": current_entry}
            else:
                # Close and reverse
                closed_qty = abs(current_size)
                pnl_per_contract = exec_price - current_entry if current_size > 0 else current_entry - exec_price
                realized_pnl = closed_qty * pnl_per_contract
                
                new_size = current_size + trade_qty
                w["positions"][instrument_id] = {"size": new_size, "entry": exec_price}
                
        # Add realized PnL and subtract fees from margin_usd
        w["margin_usd"] += realized_pnl - fee
        self.wallet_updates[user_id] = w.copy()
        
    def get_orderbook(self, instrument_id: str):
        if instrument_id not in self.orderbooks:
            self.orderbooks[instrument_id] = OrderBook()
        return self.orderbooks[instrument_id]
        
    def cancel_order(self, order_id: str, instrument_id: str = "COOKIE-USD-SPOT") -> bool:
        # TODO: implement proper balance un-locking if we pre-deduct balances
        return self.get_orderbook(instrument_id).cancel_order(order_id)
        
    def cancel_all_orders_for_user(self, user_id: str):
        for ob in self.orderbooks.values():
            to_cancel = [oid for oid, order in ob.orders_by_id.items() if order.user_id == user_id]
            for oid in to_cancel:
                ob.cancel_order(oid)

    def process_limit_order(self, order: Order) -> List[Execution]:
        executions = []
        remaining_qty = order.quantity
        orderbook = self.get_orderbook(order.instrument_id)
        
        if order.side == "buy":
            while remaining_qty > 0 and orderbook.asks:
                best_ask_price, best_ask_level = orderbook.asks.peekitem(0)
                if best_ask_price > order.price:
                    break
                
                while remaining_qty > 0 and best_ask_level.orders:
                    resting_order = best_ask_level.orders[0]
                    trade_qty = min(remaining_qty, resting_order.quantity)
                    
                    exec_price = resting_order.price
                    executions.append(Execution(order.instrument_id, order.user_id, resting_order.user_id, exec_price, trade_qty, time.time()))
                    
                    # Apply market friction (fees)
                    trade_value = exec_price * trade_qty
                    fee_taker = trade_value * 0.0010  # 10 bps taker fee
                    fee_maker = trade_value * 0.0005  # 5 bps maker fee
                    
                    if order.instrument_id == "COOKIE-USD-SPOT":
                        self.update_wallet(order.user_id, -trade_value - fee_taker, trade_qty)
                        self.update_wallet(resting_order.user_id, trade_value - fee_maker, -trade_qty)
                    else:
                        self.update_derivative_position(order.user_id, order.instrument_id, trade_qty, exec_price, fee_taker)
                        self.update_derivative_position(resting_order.user_id, order.instrument_id, -trade_qty, exec_price, fee_maker)
                    
                    remaining_qty -= trade_qty
                    resting_order.quantity -= trade_qty
                    best_ask_level.volume -= trade_qty
                    
                    if resting_order.quantity == 0:
                        best_ask_level.orders.popleft()
                        del orderbook.orders_by_id[resting_order.order_id]
                        
                if best_ask_level.volume <= 0:
                    del orderbook.asks[best_ask_price]
        else:
            while remaining_qty > 0 and orderbook.bids:
                best_bid_price, best_bid_level = orderbook.bids.peekitem(0)
                if best_bid_price < order.price:
                    break
                    
                while remaining_qty > 0 and best_bid_level.orders:
                    resting_order = best_bid_level.orders[0]
                    trade_qty = min(remaining_qty, resting_order.quantity)
                    
                    exec_price = resting_order.price
                    executions.append(Execution(order.instrument_id, resting_order.user_id, order.user_id, exec_price, trade_qty, time.time()))
                    
                    # Apply market friction (fees)
                    trade_value = exec_price * trade_qty
                    fee_taker = trade_value * 0.0010  # 10 bps taker fee
                    fee_maker = trade_value * 0.0005  # 5 bps maker fee
                    
                    if order.instrument_id == "COOKIE-USD-SPOT":
                        self.update_wallet(resting_order.user_id, -trade_value - fee_maker, trade_qty)
                        self.update_wallet(order.user_id, trade_value - fee_taker, -trade_qty)
                    else:
                        self.update_derivative_position(resting_order.user_id, order.instrument_id, trade_qty, exec_price, fee_maker)
                        self.update_derivative_position(order.user_id, order.instrument_id, -trade_qty, exec_price, fee_taker)
                    
                    remaining_qty -= trade_qty
                    resting_order.quantity -= trade_qty
                    best_bid_level.volume -= trade_qty
                    
                    if resting_order.quantity == 0:
                        best_bid_level.orders.popleft()
                        del orderbook.orders_by_id[resting_order.order_id]
                        
                if best_bid_level.volume <= 0:
                    del orderbook.bids[best_bid_price]
                    
        if remaining_qty > 0:
            order.quantity = remaining_qty
            orderbook.add_order(order)
            
        self.trade_queue.extend(executions)
        return executions
        
    def get_midpoint(self, instrument_id: str = "COOKIE-USD-SPOT"):
        ob = self.get_orderbook(instrument_id)
        if ob.bids and ob.asks:
            return (ob.bids.peekitem(0)[0] + ob.asks.peekitem(0)[0]) / 2.0
        return None
