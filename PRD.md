# Cookie Exchange - Product Requirement Document (PRD)

## 1. Executive Summary & Product Vision
*   **Mission & Objectives:** A full-stack, simulated single-commodity financial exchange web application.
*   **Target Audience:** Algorithmic Traders, Students, Hobbyists.
*   **Economic Parameters:** 
    * Commodity: "Cookie"
    * Starting Price: $10.00
    * Total Float: 1,000,000,000 units
    * Starting User Capital: $100,000 USD, 0 Cookies
    * Target Daily Volume: 1,000,000 to 5,000,000 units
*   **Core Constraints:** 100% Free-Tier Infrastructure.

## Master Table of Contents
1. Executive Summary & Product Vision
2. System Architecture & Infrastructure (Session 1)
3. Data Persistence & State Management (Session 2)
4. API Gateway, Authentication & Networking (Session 3)
5. Autonomous Internal Liquidity Engine (Session 4)
6. User Experience & Frontend UI
7. Roadmap & Launch Phasing

---

## 2. System Architecture & Infrastructure (Persistent Free-Tier Hosting)

This section evaluates the infrastructure required to host the Cookie Exchange's core backend: the Central Limit Order Book (CLOB), WebSocket gateway, and autonomous bots. Because a CLOB requires continuous execution and an in-memory state tree, ephemeral serverless functions (like AWS Lambda or Vercel Edge Functions) are categorically disqualified. We must utilize a persistent containerized environment.

### 2.1 Platform Comparison: 2026 Free-Tier Persistent Hosting

We evaluated the current landscape of Platform-as-a-Service (PaaS) providers offering persistent Docker/container hosting on their free tiers.

| Platform | Compute Capacity | Free-Tier Inactivity Rules | Pros | Cons |
| :--- | :--- | :--- | :--- | :--- |
| **Render** | 512 MB RAM, 0.1 vCPU | Sleeps after 15 mins of no inbound HTTP traffic. | Extremely simple CI/CD, stable, 750 free hours/month. | Hard sleep mechanism. Requires external pings if bot traffic isn't routed via HTTP. |
| **Fly.io** | 256 MB RAM, Shared vCPU (Up to 3 micro VMs) | Always-on by default, auto-stop can be disabled. | Exceptional global anycast network, low-latency WebSocket routing. | Strict RAM limits (256MB), requires credit card verification for the free tier. |
| **Koyeb** | 512 MB RAM, 0.1 vCPU (Eco Instance) | Always-on. No forced sleep. | Native continuous execution, no CC required, great edge proxying. | Single region on the free tier (usually Frankfurt or Washington D.C.). |
| **SnapDeploy** | 512 MB RAM, 0.25 vCPU | Sleeps after 30 mins. | Modern interface, fast builds. | Aggressive connection culling on the proxy layer. |

### 2.2 Resource Boundaries & Memory Consumption Analysis

Our hard constraint is operating within a maximum of **512 MB RAM** and roughly **0.1 to 0.25 vCPU**. 

**1. Memory (RAM) Budgeting for the In-Memory CLOB:**
The execution engine must hold the entire active order book in memory for microsecond-level matching. In Python, an optimized order book using `collections.deque` for FIFO time-priority queues at each price level, combined with a `sortedcontainers.SortedDict` for price level traversal, is highly memory efficient.
*   **Order Object Size:** Utilizing Python `__slots__` or `dataclasses` with slots, a single Order (ID, side, price, size, timestamp, user_id) consumes ~120 bytes.
*   **Capacity:** At 100,000 active open orders, the raw order data consumes ~12 MB. Structural overhead (dicts, deques, websocket state) adds another ~30-40 MB. 
*   **Total Engine Footprint:** The Python interpreter, FastAPI/Uvicorn framework, and the CLOB will consume approximately **85 MB - 120 MB RAM** at resting state, leaving over 350 MB for the 10 internal bots and WebSocket connections.

**2. CPU Throttling:**
Providers strictly throttle CPU to a fractional share (e.g., 0.1x). Python’s Global Interpreter Lock (GIL) actually works in our favor here: we will run a single-threaded asynchronous event loop (using `asyncio` and `uvloop`). 0.1 vCPU is sufficient for processing 1,000 to 2,500 order matches per second, which easily accommodates our 10 bots and user traffic.

**3. Bandwidth:**
Free tiers typically cap outbound bandwidth at 100 GB/month. With a heavy WebSocket tape (streaming L2 data), we must implement delta-updates (only sending price level changes) rather than broadcasting the full order book snapshot every tick.

### 2.3 WebSocket Connection Handling & Proxy Limitations

Running real-time financial sockets on free-tier proxies (Envoy/Nginx frontends managed by the PaaS) presents unique challenges:

*   **Proxy Timeouts (Idle Drops):** Most free proxies will forcibly terminate any TCP/WebSocket connection that remains idle for 60 seconds (Fly.io) or 100 seconds (Render). 
    *   *Solution:* We must implement a strict **Ping/Pong heartbeat mechanism**. The server will broadcast an explicit `{"type": "ping"}` JSON payload every 30 seconds. If the client Python script does not respond with a `pong` within 10 seconds, the server will terminate the connection to free up RAM.
*   **Concurrent Connection Limits:** Free tiers do not typically hard-cap connection counts, but RAM limits act as a soft cap. A single `websockets` connection state in Uvicorn consumes roughly 30 KB.
    *   *Capacity limit:* 2,000 simultaneous connections = ~60 MB RAM. This is well within our 512 MB budget. We will artificially cap concurrent external connections to 1,000 via a semaphore to prevent Out-Of-Memory (OOM) cascading failures.

### 2.4 Deployment Architecture Recommendation

**Recommendation: Koyeb** (Primary) or **Render** (Secondary Fallback).

For the Python Backend (CLOB + Bots + WebSockets), **Koyeb** is the mathematically superior choice because it offers an explicit **Always-On** 512MB Eco Instance without the aggressive sleep mechanics found on Render. 

However, assuming we might need to deploy on **Render** (the most popular fallback), here is the architectural setup to bypass limitations:

**1. The "Ouroboros" Keep-Alive Architecture (If using Render):**
To prevent the container from sleeping after 15 minutes, we won't rely on flaky external cron-job pingers (like UptimeRobot). Instead, our 10 internal autonomous bots—which are running concurrently in `asyncio` background tasks within the *same* process—will execute their trades by sending actual HTTP/REST requests to `localhost:10000` or the external `.onrender.com` URL. By routing the internal bots through the platform's external gateway (or keeping a constant stream of internal HTTP traffic that the PaaS proxy registers), we trick the infrastructure into registering constant active usage, completely neutralizing the sleep timer.

**2. Container Optimization (Dockerfile):**
To prevent OOM kills and ensure fast cold starts (if the platform reboots our node for maintenance):
*   We will use `python:3.11-alpine` or `3.11-slim` to keep the Docker image under 150 MB.
*   We will swap the standard asyncio loop for `uvloop` (a Cython wrapper around libuv) to maximize performance on fractional CPUs.
*   We will set `WEB_CONCURRENCY=1` and run only a single Uvicorn worker. Spawning multiple gunicorn workers will duplicate the in-memory order book, fragmenting the state and instantly triggering an OOM kill.

**3. Frontend Deployment:**
The React/Next.js frontend UI will be deployed to **Vercel** (Free Tier). Vercel is stateless and serverless, making it perfect for hosting the static UI assets and interacting directly with our persistent backend API via standard HTTPS/WSS calls.

---

## 3. Data Persistence & State Management (Supabase)

This section details how the in-memory execution engine safely and asynchronously persists state to a PostgreSQL database hosted on Supabase's free tier without bottlenecking matching performance or exceeding storage limits.

### 3.1 In-Memory vs. Disk Strategy

To ensure ultra-low latency execution on constrained CPUs, the database is strictly used as an asynchronous ledger, never as a synchronous dependency for trade matching.

*   **In-Memory (Python Server):**
    *   The complete Central Limit Order Book (CLOB).
    *   All active, unexecuted limit orders.
    *   Current WebSocket connections and active user sessions.
*   **Disk (Supabase PostgreSQL):**
    *   User accounts and API credentials.
    *   Hardened wallet balances (USD and Cookies).
    *   Historical executed trades (the `executions` ledger).
    *   Aggregated market data (`daily_candles`, `minute_candles`).

If the server crashes, all open orders in memory are inherently canceled (which is standard behavior for high-frequency trading APIs). Wallet balances are restored from the database on reboot.

### 3.2 Database Schema (PostgreSQL DDL)

To maximize query performance within shared-CPU database limits, we utilize specific indexing on time-series and relationship queries.

```sql
-- 1. Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. API Keys Table
CREATE TABLE api_keys (
    key_hash VARCHAR(255) PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used TIMESTAMPTZ
);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);

-- 3. Wallets Table
CREATE TABLE wallets (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    usd_balance NUMERIC(15, 2) DEFAULT 100000.00,
    cookie_balance NUMERIC(15, 4) DEFAULT 0.0000,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Executions (Trades) Table
CREATE TABLE executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    buyer_id UUID REFERENCES users(id),
    seller_id UUID REFERENCES users(id),
    price NUMERIC(10, 2) NOT NULL,
    quantity NUMERIC(15, 4) NOT NULL,
    executed_at TIMESTAMPTZ DEFAULT NOW()
);
-- Crucial indices for pulling historical charts and user trade histories
CREATE INDEX idx_executions_time ON executions(executed_at DESC);
CREATE INDEX idx_executions_buyer ON executions(buyer_id);
CREATE INDEX idx_executions_seller ON executions(seller_id);

-- 5. Candlesticks (OHLCV) Aggregations
CREATE TABLE daily_candles (
    date DATE PRIMARY KEY,
    open NUMERIC(10, 2) NOT NULL,
    high NUMERIC(10, 2) NOT NULL,
    low NUMERIC(10, 2) NOT NULL,
    close NUMERIC(10, 2) NOT NULL,
    volume NUMERIC(15, 4) NOT NULL
);
```

### 3.3 Batching & Queue System (Python Architecture)

Supabase restricts concurrent direct connections on the free tier (typically to ~60 connections). A naive approach of writing every trade directly to the database will exhaust the connection pool and freeze the event loop. 

Instead, we use an in-memory batching pipeline. When the matching engine crosses an order, it immediately updates the in-memory wallet state and pushes the trade record to a `collections.deque`. A background asyncio task drains this queue every few seconds, executing a single bulk insert transaction.

**Asynchronous Pipeline Implementation:**

```python
import asyncio
from collections import deque

# 1. In-memory asynchronous queues
trade_queue = deque()
wallet_update_queue = dict() # Maps user_id -> latest balance state

async def db_persistence_worker():
    """Background task running continuously alongside the Uvicorn server."""
    while True:
        await asyncio.sleep(2.0)  # Drain queue every 2 seconds
        
        if not trade_queue and not wallet_update_queue:
            continue
            
        # Atomically extract data to prevent race conditions during matching
        trades_to_insert = list(trade_queue)
        trade_queue.clear()
        
        wallets_to_update = wallet_update_queue.copy()
        wallet_update_queue.clear()
        
        try:
            # Execute a single Supabase RPC call or asyncpg bulk transaction
            # This uses exactly ONE database connection for potentially thousands of trades
            await execute_bulk_transaction(trades_to_insert, wallets_to_update)
            
        except Exception as e:
            # On network failure, re-queue the items to ensure zero data loss
            print(f"Database write failed, retrying on next tick: {e}")
            trade_queue.extendleft(trades_to_insert)
            
            # Re-merge wallet updates (keeping the newest state)
            for uid, state in wallets_to_update.items():
                if uid not in wallet_update_queue:
                    wallet_update_queue[uid] = state
```

### 3.4 Storage Optimization (Respecting the 500MB DB Limit)

A highly active exchange with 10 internal bots will generate millions of execution rows per month. At ~100 bytes per row, we will breach the 500MB Supabase free limit within 60 days.

**Data Lifecycle & Retention Rules:**
1.  **Ephemeral Executions:** The `executions` table is treated as a short-term ledger. We only retain execution rows for **7 days**.
2.  **Aggregation:** Every night at 00:00 UTC, a Supabase `pg_cron` background job aggregates the previous day's execution rows into the `daily_candles` (and `minute_candles` if desired) tables.
3.  **Truncation:** After aggregation, raw executions older than 7 days are hard-deleted. 
4.  **Balance Integrity:** Because we store canonical `usd_balance` and `cookie_balance` values directly on the `wallets` table via our batch worker, we do not need to sum raw `executions` to calculate user portfolios. We can safely destroy old trade data.

**Supabase pg_cron Job Implementation:**
```sql
-- Schedule this to run daily at 1:00 AM UTC
SELECT cron.schedule('cleanup_old_trades', '0 1 * * *', $$
    DELETE FROM executions WHERE executed_at < NOW() - INTERVAL '7 days';
    VACUUM (ANALYZE) executions;
$$);
```

---

## 4. API Gateway, Authentication & Networking

The Cookie Exchange relies on an API-First architecture, requiring low-latency and highly secure REST and WebSocket interfaces for users executing automated algorithmic trading strategies from their local machines.

### 4.1 API Authentication Strategy

To balance security and high-frequency performance constraints:
1.  **Secure Generation:** Users generate API keys via the web interface. A cryptographically secure random string (e.g., `kx_live_8a9b...`) is generated and shown only once.
2.  **Hashed Storage:** We use SHA-256 to hash the key before writing it to the Supabase `api_keys` table. The raw key is never stored.
3.  **Fast In-Memory Validation:** Database queries for authentication on every REST call will introduce unacceptable latency (50-150ms). When the Python engine boots, it caches all valid SHA-256 hashes in an in-memory `set`. When a client passes the `X-API-KEY` header, the server hashes it and performs an O(1) in-memory lookup, bypassing the database entirely.

### 4.2 REST Endpoint Specification (OpenAPI/Swagger)

Below is the OpenAPI specification for the core trading endpoints:

```yaml
openapi: 3.0.0
info:
  title: Cookie Exchange API
  version: 1.0.0
paths:
  /v1/orders:
    post:
      summary: Place a new Limit or Market order
      security:
        - ApiKeyAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [side, type, quantity]
              properties:
                side: { type: string, enum: [buy, sell] }
                type: { type: string, enum: [limit, market] }
                price: { type: number, description: "Required for limit orders" }
                quantity: { type: number }
      responses:
        '200':
          description: Order placed successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  order_id: { type: string, format: uuid }
                  status: { type: string, example: "open" }
                  message: { type: string }
  
  /v1/orders/{id}:
    delete:
      summary: Cancel an open order
      security:
        - ApiKeyAuth: []
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string, format: uuid }
      responses:
        '200':
          description: Order canceled successfully
  
  /v1/orderbook:
    get:
      summary: Get the current L2 Orderbook snapshot
      responses:
        '200':
          description: Orderbook levels
          content:
            application/json:
              schema:
                type: object
                properties:
                  bids: 
                    type: array
                    items: { type: array, items: { type: number }, description: "[price, size]" }
                  asks: 
                    type: array
                    items: { type: array, items: { type: number }, description: "[price, size]" }

components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-KEY
```

### 4.3 WebSocket Streaming Protocol

Real-time data feeds are streamed via WebSockets to minimize latency overhead from HTTP headers and connections.

**1. Level 2 Order Book Updates (`channel: l2_book`)**
Broadcasts delta changes publicly without requiring authentication. It utilizes a `sequence` number. If a client receives sequence `10452` followed by `10454`, they know they dropped a packet and must hit `GET /v1/orderbook` to resynchronize their local state.
```json
{
  "type": "l2_update",
  "sequence": 10452,
  "changes": [
    ["buy", "10.05", "150.00"], // Added or updated liquidity at this price
    ["sell", "10.10", "0.00"]   // Size 0 implies the price level is now empty
  ]
}
```

**2. Private Executions (`channel: executions`)**
Requires authentication (passing `X-API-KEY` during the connection upgrade or as the first message payload). Pushes real-time fills to the client.
```json
{
  "type": "fill",
  "order_id": "a1b2c3d4-...",
  "side": "buy",
  "price": "10.02",
  "quantity": "50.00",
  "timestamp": "2026-07-29T16:15:30Z"
}
```

### 4.4 Rate Limiting (Token Bucket Algorithm)

Because the infrastructure is on a strict free-tier (0.1 vCPU), infinite `while True:` loops from beginner algorithmic traders can immediately crash the server via DDoS.

We implement an in-memory **Token Bucket algorithm** per API key:
*   **Limit:** 10 requests per second.
*   **Bucket Capacity:** 10 tokens.
*   **Refill Rate:** 10 tokens / second.
*   **Rejection:** If the bucket empties, the server drops the request instantly and returns HTTP `429 Too Many Requests`. This prevents the application layer from doing any heavy parsing.

### 4.5 Python Client-Side Integration Example

Below is the standard integration code that users will write on their local machines to interact with Cookie Exchange.

```python
import requests
import json
import websocket
import threading
import time

API_KEY = "kx_live_8a9b..."
BASE_URL = "https://api.cookieexchange.com/v1"
WS_URL = "wss://api.cookieexchange.com/ws"

headers = {
    "X-API-KEY": API_KEY, 
    "Content-Type": "application/json"
}

# 1. Place a limit order via REST
def place_order():
    payload = {
        "side": "buy",
        "type": "limit",
        "price": 9.95,
        "quantity": 100.0
    }
    res = requests.post(f"{BASE_URL}/orders", headers=headers, json=payload)
    if res.status_code == 200:
        print("Order placed:", res.json())
    elif res.status_code == 429:
        print("Rate limited! Backing off...")

# 2. Stream Real-Time L2 Book via WebSockets
def on_message(ws, message):
    data = json.loads(message)
    if data.get("type") == "l2_update":
        print(f"Seq {data['sequence']} -> {data['changes']}")

def start_socket():
    ws = websocket.WebSocketApp(WS_URL, on_message=on_message)
    ws.run_forever()

if __name__ == "__main__":
    # Start the WebSocket stream in a background thread
    threading.Thread(target=start_socket, daemon=True).start()
    
    # Wait a moment for connection, then place a trade
    time.sleep(1)
    place_order()
    
    # Keep main thread alive
    while True:
        time.sleep(1)
```

---

## 5. Autonomous Internal Liquidity Engine

To ensure the Cookie Exchange always feels "alive" and provides immediate counterparty liquidity to new users writing their first trading scripts, the backend natively hosts 10 autonomous bots directly inside the Python execution engine.

### 5.1 Event Loop Integration

Instead of running bots as separate container processes (which would consume precious RAM and incur HTTP network latency overhead), we run the bots as standard `asyncio.Task` coroutines within the same Uvicorn event loop as the REST/WebSocket API.

*   **No Network Overhead:** The bots bypass the HTTP/WebSocket gateways entirely, calling `engine.place_order(...)` directly in memory.
*   **Non-Blocking Scheduling:** Because they use `await asyncio.sleep()`, they yield CPU time back to the main thread, allowing the engine to process external user HTTP requests seamlessly. 

```python
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Schedule the 10 bots
    tasks = []
    for i in range(5):
        tasks.append(asyncio.create_task(market_maker_loop(f"mm_{i}")))
        tasks.append(asyncio.create_task(noise_trader_loop(f"nt_{i}")))
    
    yield # Engine is running
    
    # Shutdown: Cancel the bots
    for task in tasks:
        task.cancel()

app = FastAPI(lifespan=lifespan)
```

### 5.2 Systematic Market Maker (MM) Logic

The 5 Market Maker bots act as the backbone of the exchange. They calculate a theoretical fair value (anchored around our **$10.00** starting price) and continuously provide bid-ask spreads to capture the spread differential. 

*   **Theoretical Price Tracking:** They track the midpoint of the current book, bounded tightly around $10.00.
*   **Inventory Risk Management (Avellaneda-Stoikov variant):**
    *   If a bot accumulates too much Cookie (positive inventory), it lowers its bid price to stop buying, and lowers its ask price to encourage other participants to buy from it.
    *   If a bot has too little Cookie (negative inventory), it shifts its quotes upwards.

```python
async def market_maker_loop(bot_id: str):
    inventory_cookie = 0
    target_price = 10.00
    spread = 0.05
    
    while True:
        # 1. Adjust quotes based on inventory skew
        inventory_skew = inventory_cookie * 0.001 
        adjusted_mid = target_price - inventory_skew
        
        bid_price = round(adjusted_mid - (spread / 2), 2)
        ask_price = round(adjusted_mid + (spread / 2), 2)
        
        # 2. Cancel old orders & place new quotes directly in memory
        engine.cancel_all_orders_for_user(bot_id)
        engine.place_order(bot_id, side="buy", price=bid_price, quantity=1000)
        engine.place_order(bot_id, side="sell", price=ask_price, quantity=1000)
        
        # 3. Update local inventory state based on recent fills
        inventory_cookie = engine.get_wallet(bot_id).cookie_balance
        
        # 4. Yield control back to event loop
        await asyncio.sleep(1.0)
```

### 5.3 Noise Trader Logic

The 5 Noise Traders simulate retail and erratic institutional flow. They do not care about the bid-ask spread; they simply execute orders randomly to generate trading volume and price volatility.

*   **Arrival Times:** Modeled via a Poisson distribution (e.g., waiting `random.expovariate(lambda)`).
*   **Order Generation:** They use a random walk (Normal distribution) around the current midpoint to place limit orders, or they occasionally place market orders that cross the spread to generate instant volume.

```python
import random

async def noise_trader_loop(bot_id: str):
    while True:
        # Poisson arrival time (average 3 seconds between trades)
        wait_time = random.expovariate(1.0 / 3.0)
        await asyncio.sleep(wait_time)
        
        current_mid = engine.get_midpoint() or 10.00
        
        # 80% chance to place a limit order, 20% to place a market order
        if random.random() < 0.8:
            # Limit order randomly distributed around midpoint
            price = round(random.normalvariate(current_mid, 0.15), 2)
            side = "buy" if random.random() < 0.5 else "sell"
            engine.place_order(bot_id, side=side, price=price, quantity=random.randint(10, 500))
        else:
            # Market order crossing the spread
            side = "buy" if random.random() < 0.5 else "sell"
            engine.place_market_order(bot_id, side=side, quantity=random.randint(50, 200))
```

### 5.4 Risk Bounds & Bankruptcy Prevention

Because bots act randomly or pseudo-systematically, they risk accumulating 100% of the 1B float or going bankrupt in USD.

To mitigate this without writing complex database ledgers:
1.  **Native Hard Limits:** The `engine.place_order` internal method natively checks the `bot_id`. If `inventory_cookie > 50,000`, the bot is instantly blocked from placing `buy` orders until it offloads inventory.
2.  **Daily Mean-Reversion Reset:** At 00:00 UTC, a background task automatically resets all 10 bot wallets to their initial state ($100,000 USD, 0 Cookies) and resets the "fair value" anchor to $10.00. This ensures the market can never permanently trend to zero or infinity, providing a stable sandbox for users.
