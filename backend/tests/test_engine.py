import pytest
import time
from backend.orderbook import Order
from backend.engine import Engine

def test_engine_basic_matching():
    engine = Engine()
    
    # Place a sell limit order
    sell_order = Order(
        order_id="sell_1",
        user_id="user_A",
        side="sell",
        type="limit",
        price=10.05,
        quantity=100.0,
        timestamp=time.time()
    )
    executions = engine.process_limit_order(sell_order)
    assert len(executions) == 0
    assert len(engine.orderbook.asks) == 1
    
    # Place a buy limit order that crosses the spread
    buy_order = Order(
        order_id="buy_1",
        user_id="user_B",
        side="buy",
        type="limit",
        price=10.05,
        quantity=50.0,
        timestamp=time.time()
    )
    executions = engine.process_limit_order(buy_order)
    
    assert len(executions) == 1
    assert executions[0].quantity == 50.0
    assert executions[0].price == 10.05
    
    # Check remaining orderbook
    assert engine.orderbook.asks[10.05].volume == 50.0
    
    # Check wallets
    user_a = engine.get_wallet("user_A")
    user_b = engine.get_wallet("user_B")
    
    # user A sold 50 units at 10.05 -> gained 502.5 USD, lost 50 cookie
    assert user_a["usd"] == 100000.0 + 502.5
    assert user_a["cookie"] == -50.0
    
    # user B bought 50 units at 10.05 -> lost 502.5 USD, gained 50 cookie
    assert user_b["usd"] == 100000.0 - 502.5
    assert user_b["cookie"] == 50.0
