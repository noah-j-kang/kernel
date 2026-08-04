'use client';

import Link from 'next/link';

export default function ApiDocsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '100vh', paddingTop: '4rem' }}>
      <style>{`
        .docs-section {
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          padding: 3rem 0;
        }
        .docs-section:first-of-type {
          border-top: 1px solid rgba(255, 255, 255, 0.2);
        }
        .docs-title {
          font-size: 2rem;
          font-weight: 700;
          text-transform: uppercase;
          margin-bottom: 1.5rem;
          color: #00ffaa;
        }
        .docs-subtitle {
          font-size: 1.5rem;
          font-weight: 600;
          margin-top: 2rem;
          margin-bottom: 1rem;
          color: #fff;
        }
        .docs-text {
          font-size: 1.125rem;
          line-height: 1.7;
          color: #ccc;
          margin-bottom: 1.5rem;
        }
        .code-block {
          background-color: rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 1.5rem;
          font-family: "Roboto Mono", monospace;
          font-size: 0.95rem;
          color: #fff;
          overflow-x: auto;
          margin-bottom: 2rem;
          white-space: pre;
        }
        .endpoint-pill {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          border-radius: 4px;
          font-weight: bold;
          font-size: 0.875rem;
          margin-right: 1rem;
        }
        .get { background-color: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid #3b82f6; }
        .post { background-color: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #10b981; }
        .delete { background-color: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; }
      `}</style>

      <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', padding: '0 2rem 4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4rem' }}>
          <h1 style={{ fontSize: '3rem', textTransform: 'uppercase', fontWeight: 900, letterSpacing: '-1px', margin: 0 }}>
            API & SDK Documentation
          </h1>
          <Link href="/about" style={{ color: '#00ffaa', textDecoration: 'none', border: '1px solid #00ffaa', padding: '8px 16px', borderRadius: '4px' }}>
            ← Back to About
          </Link>
        </div>

        <div className="docs-section">
          <div className="docs-title">Overview</div>
          <div className="docs-text">
            The Cookie Exchange offers robust, ultra-low latency REST and WebSocket APIs. We encourage developers to connect directly to our matching engine to run algorithmic trading strategies, market making bots, and customized trading dashboards.
          </div>
          <div className="docs-text">
            To make development as frictionless as possible, we provide a <strong>Python SDK</strong> that handles connections, asynchronous requests, and WebSocket subscriptions out of the box.
          </div>
        </div>

        <div className="docs-section">
          <div className="docs-title">Python SDK Quickstart</div>
          <div className="docs-text">
            The easiest way to interact with the exchange is using our official Python SDK. It utilizes <code>aiohttp</code> to deliver high-performance asynchronous execution.
          </div>
          
          <div className="docs-subtitle">1. Prerequisites</div>
          <div className="docs-text">
            You will need Python 3.8+ and <code>aiohttp</code> installed.
          </div>
          <div className="code-block">
pip install aiohttp
          </div>

          <div className="docs-subtitle">2. Implementing the SDK</div>
          <div className="docs-text">
            Copy the <code>CookieExchangeAPI</code> class into your project. Here is an example of how to initialize the client, fetch your wallet, and execute trades:
          </div>
          <div className="code-block">
{`import asyncio
from cookie_exchange import CookieExchangeAPI

async def run_bot():
    api_key = "your_api_key_here" 
    exchange = CookieExchangeAPI(api_key=api_key)
    
    # Connect to WebSockets
    await exchange.connect()
    
    # Define WebSocket callback
    async def handle_update(data):
        if data.get("type") == "l2_update":
            print("Orderbook Updated!")
        elif data.get("type") == "fill":
            print(f"Order Filled! {data['quantity']} @ \${data['price']}")

    exchange.on_message(handle_update)
    
    # Place a limit buy order
    order_res = await exchange.place_order(
        instrument_id="COOKIE-USD-SPOT",
        side="buy",
        quantity=10,
        price=15.50
    )
    print("Placed Order:", order_res)
    
    # Wait to listen for fills
    await asyncio.sleep(60)
    await exchange.disconnect()

asyncio.run(run_bot())`}
          </div>
        </div>

        <div className="docs-section">
          <div className="docs-title">REST API Reference</div>
          <div className="docs-text">
            All REST API requests must include your authentication token in the headers. Base URL is <code>http://localhost:8000</code>.
          </div>
          <div className="code-block">
{`Headers:
  X-API-KEY: <your_token>
  Authorization: Bearer <your_token>
  Content-Type: application/json`}
          </div>

          <div className="docs-subtitle">
            <span className="endpoint-pill get">GET</span> /v1/wallet
          </div>
          <div className="docs-text">
            Retrieves your current USD balance, Cookie balance, Margin balance, and open derivative positions.
          </div>

          <div className="docs-subtitle">
            <span className="endpoint-pill get">GET</span> /v1/orderbook
          </div>
          <div className="docs-text">
            Retrieves a snapshot of the current L2 Orderbook. Accepts a query parameter <code>?instrument_id=COOKIE-USD-SPOT</code>.
          </div>

          <div className="docs-subtitle">
            <span className="endpoint-pill post">POST</span> /v1/orders
          </div>
          <div className="docs-text">
            Submits a new order to the matching engine.
          </div>
          <div className="code-block">
{`// Request Body
{
  "instrument_id": "COOKIE-USD-SPOT",
  "side": "buy", // "buy" or "sell"
  "type": "limit", // "limit" or "market"
  "quantity": 10.5,
  "price": 100.25 // Required for limit orders
}`}
          </div>

          <div className="docs-subtitle">
            <span className="endpoint-pill delete">DELETE</span> /v1/orders/&#123;order_id&#125;
          </div>
          <div className="docs-text">
            Cancels an open order by its UUID.
          </div>
        </div>

        <div className="docs-section">
          <div className="docs-title">WebSocket API</div>
          <div className="docs-text">
            To receive live streaming data, connect to <code>ws://localhost:8000/ws</code>. Upon connection, you must authenticate.
          </div>
          <div className="code-block">
{`// 1. Send Authentication
{ "type": "auth", "api_key": "<your_token>" }`}
          </div>

          <div className="docs-subtitle">Incoming Message Types</div>
          <div className="docs-text">
            <ul style={{ paddingLeft: '1.5rem' }}>
              <li style={{ marginBottom: '1rem' }}><strong>l2_update</strong>: Broadcasts the entire orderbook snapshot (bids and asks) whenever liquidity changes.</li>
              <li style={{ marginBottom: '1rem' }}><strong>fill</strong>: Sent exclusively to you when your order executes. Contains <code>price</code> and <code>quantity</code>.</li>
              <li style={{ marginBottom: '1rem' }}><strong>funding_rate</strong>: Global broadcast updating the perp mark price and current 8-hour funding rate.</li>
              <li style={{ marginBottom: '1rem' }}><strong>funding_payment</strong>: Sent exclusively to you when funding is deducted/added to your margin balance.</li>
              <li style={{ marginBottom: '1rem' }}><strong>liquidation</strong>: Alert indicating your margin dropped below maintenance level and positions were closed.</li>
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
}
