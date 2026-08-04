import asyncio
import aiohttp
import json
import uuid

class CookieExchangeAPI:
    def __init__(self, api_key: str, base_url: str = "http://localhost:8000"):
        self.api_key = api_key
        self.base_url = base_url
        self.ws_url = base_url.replace("http://", "ws://").replace("https://", "wss://") + "/ws"
        
        self.headers = {
            "X-API-KEY": self.api_key,
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        self.session = None
        self.ws = None
        self.callbacks = []

    async def connect(self):
        self.session = aiohttp.ClientSession(headers=self.headers)
        self.ws = await self.session.ws_connect(self.ws_url)
        # Authenticate WS
        await self.ws.send_json({"type": "auth", "api_key": self.api_key})
        
        # Start listener loop
        asyncio.create_task(self._listen())
        print("Connected to Cookie Exchange WebSocket!")

    async def disconnect(self):
        if self.ws:
            await self.ws.close()
        if self.session:
            await self.session.close()

    def on_message(self, callback):
        """Register a callback for websocket messages."""
        self.callbacks.append(callback)

    async def _listen(self):
        try:
            async for msg in self.ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    data = msg.json()
                    for cb in self.callbacks:
                        await cb(data)
                elif msg.type == aiohttp.WSMsgType.ERROR:
                    print('WebSocket connection closed with exception %s' % self.ws.exception())
        except Exception as e:
            print(f"WS Listener error: {e}")

    async def get_wallet(self):
        async with self.session.get(f"{self.base_url}/v1/wallet") as resp:
            return await resp.json()

    async def place_order(self, instrument_id: str, side: str, quantity: float, price: float, order_type: str = "limit"):
        payload = {
            "instrument_id": instrument_id,
            "side": side,
            "type": order_type,
            "quantity": quantity,
            "price": price
        }
        async with self.session.post(f"{self.base_url}/v1/orders", json=payload) as resp:
            return await resp.json()

    async def cancel_order(self, order_id: str, instrument_id: str = "COOKIE-USD-SPOT"):
        async with self.session.delete(f"{self.base_url}/v1/orders/{order_id}?instrument_id={instrument_id}") as resp:
            return await resp.json()

    async def get_orderbook(self, instrument_id: str = "COOKIE-USD-SPOT"):
        async with self.session.get(f"{self.base_url}/v1/orderbook?instrument_id={instrument_id}") as resp:
            return await resp.json()
