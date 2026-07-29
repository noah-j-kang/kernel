'use client';

import { useState, useEffect } from 'react';

export default function Dashboard() {
  const [orderbook, setOrderbook] = useState({ bids: [], asks: [] });
  const [wallet, setWallet] = useState({ usd: 100000.0, kernel: 0.0 });
  const [connected, setConnected] = useState(false);
  const [tradeQuantity, setTradeQuantity] = useState(1);
  
  const API_KEY = 'local_user_123';

  const getOrderPreview = (side, qty) => {
    const parsedQty = parseInt(qty, 10);
    let remaining = isNaN(parsedQty) || parsedQty < 0 ? 0 : parsedQty;
    let totalValue = 0;
    const bookSide = side === 'buy' ? orderbook.asks : orderbook.bids;
    
    for (const level of bookSide) {
      const price = level[0];
      const volume = level[1];
      const fillQty = Math.min(remaining, volume);
      totalValue += fillQty * price;
      remaining -= fillQty;
      if (remaining <= 0) break;
    }
    
    const fee = totalValue * 0.0010; // 0.1% taker fee
    const netTotal = side === 'buy' ? totalValue + fee : totalValue - fee;
    
    return {
      filled: remaining <= 0 && (qty > 0),
      baseCost: totalValue,
      fee,
      netTotal
    };
  };

  const fetchWallet = async () => {
    try {
      const res = await fetch('http://localhost:8000/v1/wallet', {
        headers: { 'X-API-KEY': API_KEY }
      });
      if (res.ok) {
        const data = await res.json();
        setWallet(data);
      }
    } catch (e) {
      console.error('Failed to fetch wallet', e);
    }
  };

  useEffect(() => {
    fetchWallet();

    const ws = new WebSocket('ws://localhost:8000/ws');
    
    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: 'auth', api_key: API_KEY }));
    };
    ws.onclose = () => setConnected(false);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'l2_update') {
          setOrderbook(data.book);
        } else if (data.type === 'fill') {
          fetchWallet();
        }
      } catch (e) {}
    };

    return () => ws.close();
  }, []);

  const handleMarketOrder = async (side, qty) => {
    const parsedQty = parseFloat(qty) || 1;
    if (side === 'sell' && wallet.kernel < parsedQty) {
      alert("Insufficient Kernel balance to sell!");
      return;
    }
    
    if (side === 'buy') {
      const preview = getOrderPreview('buy', parsedQty);
      if (!preview.filled && preview.baseCost === 0) {
        alert("No liquidity to buy from!");
        return;
      }
      if (wallet.usd < preview.netTotal) {
        alert("Insufficient USD balance to buy!");
        return;
      }
    }

    try {
      const res = await fetch('http://localhost:8000/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': API_KEY
        },
        body: JSON.stringify({
          side,
          type: 'market',
          quantity: parsedQty,
          price: side === 'buy' ? 99999.0 : 0.01 // simulating market order with deep limits
        })
      });
      if (res.ok) {
        fetchWallet();
      } else {
        const err = await res.json();
        alert("Order failed: " + (err.detail || "Unknown error"));
      }
    } catch (e) {
      console.error("Order error", e);
    }
  };

  const calculateMaxVolume = (levels) => {
    return Math.max(...levels.map(l => l[1]), 1);
  };

  const maxBidVol = calculateMaxVolume(orderbook.bids);
  const maxAskVol = calculateMaxVolume(orderbook.asks);

  const buyPreview = getOrderPreview('buy', tradeQuantity || 0);
  const sellPreview = getOrderPreview('sell', tradeQuantity || 0);

  return (
    <div className="dashboard-grid">
      <section className="glass-panel" style={{ padding: '1.5rem' }}>
        <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Portfolio</h2>
        <div style={{ marginBottom: '1rem' }}>
          <div className="text-muted" style={{ fontSize: '0.875rem' }}>USD Balance</div>
          <div style={{ fontSize: '2rem', fontWeight: 600 }}>
            ${wallet.usd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div style={{ marginBottom: '2rem' }}>
          <div className="text-muted" style={{ fontSize: '0.875rem' }}>Kernel Balance</div>
          <div style={{ fontSize: '2rem', fontWeight: 600 }}>
            {wallet.kernel.toLocaleString(undefined, { minimumFractionDigits: 4 })}
          </div>
        </div>
        
        <h2 style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '1rem' }}>Manual Trade</h2>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Quantity (Kernels)</label>
          <input 
            type="number" 
            min="1" 
            step="1" 
            value={tradeQuantity} 
            onChange={(e) => setTradeQuantity(e.target.value)}
            onBlur={(e) => {
              const parsed = parseInt(tradeQuantity, 10);
              if (isNaN(parsed) || parsed < 1) {
                setTradeQuantity(1);
              } else {
                setTradeQuantity(parsed);
              }
            }}
            className="input-field"
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: '#fff' }}
          />
        </div>
        
        <div style={{ marginBottom: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="text-muted">Buy Preview:</span>
            <span>
              ${buyPreview.baseCost.toFixed(2)} <span className="text-muted">+ ${buyPreview.fee.toFixed(2)} fee</span> = <strong className="text-green">${buyPreview.netTotal.toFixed(2)}</strong>
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="text-muted">Sell Preview:</span>
            <span>
              ${sellPreview.baseCost.toFixed(2)} <span className="text-muted">- ${sellPreview.fee.toFixed(2)} fee</span> = <strong className="text-red">${sellPreview.netTotal.toFixed(2)}</strong>
            </span>
          </div>
          {(!buyPreview.filled || !sellPreview.filled) && tradeQuantity > 0 && (
            <div className="text-red" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Warning: Order size exceeds current book liquidity</div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <button onClick={() => handleMarketOrder('buy', tradeQuantity || 1)} className="btn" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', borderColor: 'var(--success)' }}>Buy</button>
          <button onClick={() => handleMarketOrder('sell', tradeQuantity || 1)} className="btn" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderColor: 'var(--danger)' }}>Sell</button>
        </div>
      </section>

      <section className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2>Execution Tape</h2>
          <span className="text-muted" style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {connected ? (
              <><div className="live-indicator"></div> Live</>
            ) : (
              'Connecting...'
            )}
          </span>
        </div>
        
        <div style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
          [TradingView Integration Placeholder]
        </div>
      </section>

      <section className="glass-panel" style={{ padding: '1.5rem' }}>
        <h2 style={{ marginBottom: '1.5rem' }}>L2 Order Book</h2>
        
        <div className="book-row book-header">
          <div>Price</div>
          <div style={{ textAlign: 'right' }}>Size</div>
          <div style={{ textAlign: 'right' }}>Total</div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '1rem' }}>
          {orderbook.asks.slice().reverse().map((ask, i) => (
            <div key={i} className="book-row depth-bar-container text-red">
              <div className="depth-bar ask" style={{ width: `${(ask[1] / maxAskVol) * 100}%` }}></div>
              <div>{ask[0].toFixed(2)}</div>
              <div style={{ textAlign: 'right' }}>{ask[1].toFixed(2)}</div>
              <div style={{ textAlign: 'right' }}>{(ask[0] * ask[1]).toLocaleString()}</div>
            </div>
          ))}
          {orderbook.asks.length === 0 && (
             <div className="text-muted" style={{ textAlign: 'center', padding: '1rem' }}>Awaiting Asks...</div>
          )}
        </div>
        
        <div style={{ textAlign: 'center', padding: '0.5rem 0', fontSize: '1.25rem', fontWeight: 600, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: '1rem' }}>
          {orderbook.bids.length > 0 ? orderbook.bids[0][0].toFixed(2) : '---'}
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {orderbook.bids.map((bid, i) => (
            <div key={i} className="book-row depth-bar-container text-green">
              <div className="depth-bar" style={{ width: `${(bid[1] / maxBidVol) * 100}%` }}></div>
              <div>{bid[0].toFixed(2)}</div>
              <div style={{ textAlign: 'right' }}>{bid[1].toFixed(2)}</div>
              <div style={{ textAlign: 'right' }}>{(bid[0] * bid[1]).toLocaleString()}</div>
            </div>
          ))}
          {orderbook.bids.length === 0 && (
             <div className="text-muted" style={{ textAlign: 'center', padding: '1rem' }}>Awaiting Bids...</div>
          )}
        </div>
      </section>
    </div>
  );
}
