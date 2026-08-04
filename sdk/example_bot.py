import asyncio
from cookie_exchange import CookieExchangeAPI

async def run_bot():
    # Replace with a real user UUID from the exchange, or any string for local testing
    api_key = "bot_user_1" 
    
    # Initialize the SDK
    exchange = CookieExchangeAPI(api_key=api_key)
    await exchange.connect()
    
    # Set up our market making state
    state = {
        "latest_midpoint": None,
    }

    # Define how we handle incoming WebSocket data
    async def handle_update(data):
        if data.get("type") == "l2_update":
            book = data.get("book")
            if book and book.get("bids") and book.get("asks"):
                best_bid = book["bids"][0][0]
                best_ask = book["asks"][0][0]
                state["latest_midpoint"] = (best_bid + best_ask) / 2
                print(f"Market Data -> Bid: ${best_bid:.2f} | Ask: ${best_ask:.2f} | Mid: ${state['latest_midpoint']:.2f}")
                
        elif data.get("type") == "fill":
            print(f"🔥 ORDER FILLED: {data['quantity']} @ ${data['price']}")
            
            # Print updated wallet after fill
            wallet = await exchange.get_wallet()
            print(f"Wallet -> USD: ${wallet.get('usd', 0):.2f} | Cookies: {wallet.get('cookie', 0):.2f}")

    exchange.on_message(handle_update)
    
    # Give it a second to fetch initial data
    await asyncio.sleep(2)
    
    print("Starting Market Maker Loop...")
    
    # Trading Loop
    try:
        while True:
            if state["latest_midpoint"]:
                mid = state["latest_midpoint"]
                spread = mid * 0.01 # 1% spread
                
                my_bid = mid - spread
                my_ask = mid + spread
                
                print(f"Placing Orders -> Buy @ ${my_bid:.2f} | Sell @ ${my_ask:.2f}")
                
                await exchange.place_order("COOKIE-USD-SPOT", "buy", 5, my_bid)
                await exchange.place_order("COOKIE-USD-SPOT", "sell", 5, my_ask)
                
            await asyncio.sleep(5) # Wait 5 seconds before refreshing orders
    except KeyboardInterrupt:
        print("Stopping Bot...")
    finally:
        await exchange.disconnect()

if __name__ == "__main__":
    asyncio.run(run_bot())
