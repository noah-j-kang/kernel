import time
import uuid
from typing import List
from collections import deque
from backend.orderbook import Order, OrderBook

class Execution:
    def __init__(self, buyer_id: str, seller_id: str, price: float, quantity: float, executed_at: float):
        self.id = str(uuid.uuid4())
        self.buyer_id = buyer_id
        self.seller_id = seller_id
        self.price = price
        self.quantity = quantity
        self.executed_at = executed_at

class Engine:
    def __init__(self):
        self.orderbook = OrderBook()
        self.trade_queue: deque[Execution] = deque()
        self.wallets = {} # {user_id: {"usd": 100000.0, "kernel": 0.0}}
        self.wallet_updates = {}
        
    def get_wallet(self, user_id: str):
        if user_id not in self.wallets:
            self.wallets[user_id] = {"usd": 100000.0, "kernel": 0.0}
        return self.wallets[user_id]
        
    def update_wallet(self, user_id: str, usd_delta: float, kernel_delta: float):
        w = self.get_wallet(user_id)
        w["usd"] += usd_delta
        w["kernel"] += kernel_delta
        self.wallet_updates[user_id] = w.copy()
        
    def cancel_order(self, order_id: str) -> bool:
        # TODO: implement proper balance un-locking if we pre-deduct balances
        return self.orderbook.cancel_order(order_id)
        
    def cancel_all_orders_for_user(self, user_id: str):
        to_cancel = [oid for oid, order in self.orderbook.orders_by_id.items() if order.user_id == user_id]
        for oid in to_cancel:
            self.cancel_order(oid)

    def process_limit_order(self, order: Order) -> List[Execution]:
        executions = []
        remaining_qty = order.quantity
        
        if order.side == "buy":
            while remaining_qty > 0 and self.orderbook.asks:
                best_ask_price, best_ask_level = self.orderbook.asks.peekitem(0)
                if best_ask_price > order.price:
                    break
                
                while remaining_qty > 0 and best_ask_level.orders:
                    resting_order = best_ask_level.orders[0]
                    trade_qty = min(remaining_qty, resting_order.quantity)
                    
                    exec_price = resting_order.price
                    executions.append(Execution(order.user_id, resting_order.user_id, exec_price, trade_qty, time.time()))
                    
                    # Apply market friction (fees)
                    trade_value = exec_price * trade_qty
                    fee_taker = trade_value * 0.0010  # 10 bps taker fee
                    fee_maker = trade_value * 0.0005  # 5 bps maker fee
                    
                    self.update_wallet(order.user_id, -trade_value - fee_taker, trade_qty)
                    self.update_wallet(resting_order.user_id, trade_value - fee_maker, -trade_qty)
                    
                    remaining_qty -= trade_qty
                    resting_order.quantity -= trade_qty
                    best_ask_level.volume -= trade_qty
                    
                    if resting_order.quantity == 0:
                        best_ask_level.orders.popleft()
                        del self.orderbook.orders_by_id[resting_order.order_id]
                        
                if best_ask_level.volume <= 0:
                    del self.orderbook.asks[best_ask_price]
        else:
            while remaining_qty > 0 and self.orderbook.bids:
                best_bid_price, best_bid_level = self.orderbook.bids.peekitem(0)
                if best_bid_price < order.price:
                    break
                    
                while remaining_qty > 0 and best_bid_level.orders:
                    resting_order = best_bid_level.orders[0]
                    trade_qty = min(remaining_qty, resting_order.quantity)
                    
                    exec_price = resting_order.price
                    executions.append(Execution(resting_order.user_id, order.user_id, exec_price, trade_qty, time.time()))
                    
                    # Apply market friction (fees)
                    trade_value = exec_price * trade_qty
                    fee_taker = trade_value * 0.0010  # 10 bps taker fee
                    fee_maker = trade_value * 0.0005  # 5 bps maker fee
                    
                    self.update_wallet(resting_order.user_id, -trade_value - fee_maker, trade_qty)
                    self.update_wallet(order.user_id, trade_value - fee_taker, -trade_qty)
                    
                    remaining_qty -= trade_qty
                    resting_order.quantity -= trade_qty
                    best_bid_level.volume -= trade_qty
                    
                    if resting_order.quantity == 0:
                        best_bid_level.orders.popleft()
                        del self.orderbook.orders_by_id[resting_order.order_id]
                        
                if best_bid_level.volume <= 0:
                    del self.orderbook.bids[best_bid_price]
                    
        if remaining_qty > 0:
            order.quantity = remaining_qty
            self.orderbook.add_order(order)
            
        self.trade_queue.extend(executions)
        return executions
        
    def get_midpoint(self):
        if self.orderbook.bids and self.orderbook.asks:
            return (self.orderbook.bids.peekitem(0)[0] + self.orderbook.asks.peekitem(0)[0]) / 2.0
        return None
