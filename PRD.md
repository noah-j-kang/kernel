# Kernel Exchange - Product Requirement Document (PRD)

## 1. Executive Summary & Product Vision
*   **Mission & Objectives:** A full-stack, simulated single-commodity financial exchange web application.
*   **Target Audience:** Algorithmic Traders, Students, Hobbyists.
*   **Economic Parameters:** 
    * Commodity: "Kernel"
    * Starting Price: $10.00
    * Total Float: 1,000,000,000 units
    * Starting User Capital: $100,000 USD, 0 Kernels
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

This section evaluates the infrastructure required to host the Kernel Exchange's core backend: the Central Limit Order Book (CLOB), WebSocket gateway, and autonomous bots. Because a CLOB requires continuous execution and an in-memory state tree, ephemeral serverless functions (like AWS Lambda or Vercel Edge Functions) are categorically disqualified. We must utilize a persistent containerized environment.

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
