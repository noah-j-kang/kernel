from typing import Dict, List, Optional
from collections import deque
from sortedcontainers import SortedDict
from pydantic import BaseModel
import time
import uuid

class Order(BaseModel):
    order_id: str
    user_id: str
    instrument_id: str = "COOKIE-USD-SPOT"
    side: str  # "buy" or "sell"
    type: str  # "limit" or "market"
    price: float
    quantity: float
    timestamp: float
    
class PriceLevel:
    def __init__(self, price: float):
        self.price = price
        self.orders: deque[Order] = deque()
        self.volume: float = 0.0

    def add_order(self, order: Order):
        self.orders.append(order)
        self.volume += order.quantity

    def remove_order(self, order_id: str) -> bool:
        for i, order in enumerate(self.orders):
            if order.order_id == order_id:
                self.volume -= order.quantity
                del self.orders[i]
                return True
        return False

class OrderBook:
    def __init__(self):
        # bids are sorted descending (highest bid first) - achieved by negative prices or reverse iteration
        self.bids = SortedDict(lambda x: -x) 
        self.asks = SortedDict()
        self.orders_by_id: Dict[str, Order] = {}
        
    def add_order(self, order: Order):
        self.orders_by_id[order.order_id] = order
        if order.side == "buy":
            if order.price not in self.bids:
                self.bids[order.price] = PriceLevel(order.price)
            self.bids[order.price].add_order(order)
        else:
            if order.price not in self.asks:
                self.asks[order.price] = PriceLevel(order.price)
            self.asks[order.price].add_order(order)
            
    def cancel_order(self, order_id: str):
        order = self.orders_by_id.pop(order_id, None)
        if not order:
            return False
            
        if order.side == "buy":
            level = self.bids.get(order.price)
            if level:
                level.remove_order(order_id)
                if level.volume <= 0:
                    del self.bids[order.price]
        else:
            level = self.asks.get(order.price)
            if level:
                level.remove_order(order_id)
                if level.volume <= 0:
                    del self.asks[order.price]
        return True

    def get_snapshot(self):
        return {
            "bids": [[price, level.volume] for price, level in self.bids.items()][:20],
            "asks": [[price, level.volume] for price, level in self.asks.items()][:20]
        }
