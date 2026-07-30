'use client';

import { useState, useEffect } from 'react';
import Chart from '../Chart';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

export default function Dashboard() {
  const [orderbooks, setOrderbooks] = useState({
    'KERNEL-USD-SPOT': { bids: [], asks: [] },
    'KERNEL-PERP': { bids: [], asks: [] }
  });
  const [tradeMode, setTradeMode] = useState('SPOT'); // SPOT, PERP, OPTIONS
  const [instrumentId, setInstrumentId] = useState('KERNEL-USD-SPOT');
  const [wallet, setWallet] = useState({ usd: 100000.0, kernel: 0.0, margin_usd: 0.0, positions: {} });
  const [connected, setConnected] = useState(false);
  const [tradeQuantity, setTradeQuantity] = useState(1);
  const [orderType, setOrderType] = useState('market');
  const [limitPrice, setLimitPrice] = useState('');
  
  const [fundingRate, setFundingRate] = useState(0);
  const [markPrice, setMarkPrice] = useState(0);
  const [indexPrice, setIndexPrice] = useState(0);
  
  const [sessionToken, setSessionToken] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    import('../../lib/supabaseClient').then(({ supabase }) => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setSessionToken(session.access_token);
        } else {
          window.location.href = '/login';
        }
        setIsLoadingAuth(false);
      });
    });
  }, []);

  const currentOrderbook = orderbooks[instrumentId] || { bids: [], asks: [] };

  const getOrderPreview = (side, qty, type, lPrice) => {
    const parsedQty = parseInt(qty, 10);
    let remaining = isNaN(parsedQty) || parsedQty < 0 ? 0 : parsedQty;
    
    if (type === 'limit') {
      const pPrice = parseFloat(lPrice);
      const price = isNaN(pPrice) || pPrice < 0 ? 0 : pPrice;
      const totalValue = remaining * price;
      // Assuming worst-case taker fee for preview
      const fee = totalValue * 0.0010;
      return {
        filled: true,
        baseCost: totalValue,
        fee,
        netTotal: side === 'buy' ? totalValue + fee : totalValue - fee
      };
    }

    let totalValue = 0;
    const bookSide = side === 'buy' ? currentOrderbook.asks : currentOrderbook.bids;
    
    for (const level of bookSide) {
      const price = level[0];
      const volume = level[1];
      const fillQty = Math.min(remaining, volume);
      totalValue += fillQty * price;
      remaining -= fillQty;
      if (remaining <= 0) break;
    }
    
    const isDeriv = instrumentId !== 'KERNEL-USD-SPOT';
    const fee = totalValue * 0.0010; // 0.1% taker fee
    
    let netTotal;
    if (isDeriv) {
        netTotal = fee; // Only fee is deducted from margin
    } else {
        netTotal = side === 'buy' ? totalValue + fee : totalValue - fee;
    }
    
    return {
      filled: remaining <= 0 && (qty > 0),
      baseCost: totalValue,
      fee,
      netTotal
    };
  };

  const fetchWallet = async () => {
    if (!sessionToken) return;
    try {
      const res = await fetch('http://localhost:8000/v1/wallet', {
        headers: { 
          'X-API-KEY': sessionToken,
          'Authorization': `Bearer ${sessionToken}`
        }
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
    if (!sessionToken) return;
    fetchWallet();

    const ws = new WebSocket('ws://localhost:8000/ws');
    
    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: 'auth', api_key: sessionToken }));
    };
    ws.onclose = () => setConnected(false);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'l2_update') {
          const inst = data.instrument_id || 'KERNEL-USD-SPOT';
          setOrderbooks(prev => ({
            ...prev,
            [inst]: data.book
          }));
        } else if (data.type === 'fill' || data.type === 'funding_payment' || data.type === 'liquidation' || data.type === 'options_settlement') {
          fetchWallet();
        } else if (data.type === 'funding_rate') {
          setFundingRate(data.rate);
          setMarkPrice(data.mark_price);
          setIndexPrice(data.index_price);
        }
      } catch (e) {}
    };

    return () => ws.close();
  }, [sessionToken]);

  const handleTrade = async (side) => {
    const parsedQty = parseFloat(tradeQuantity) || 1;
    if (instrumentId === 'KERNEL-USD-SPOT' && side === 'sell' && wallet.kernel < parsedQty) {
      alert("Insufficient Kernel balance to sell!");
      return;
    }
    
    let execPrice;
    if (orderType === 'market') {
      execPrice = side === 'buy' ? 99999.0 : 0.01;
      const preview = getOrderPreview('buy', parsedQty, 'market');
      if (side === 'buy' && !preview.filled && preview.baseCost === 0) {
        alert("No liquidity to buy from!");
        return;
      }
      if (instrumentId === 'KERNEL-USD-SPOT' && side === 'buy' && wallet.usd < preview.netTotal) {
        alert("Insufficient USD balance to buy!");
        return;
      }
    } else {
      execPrice = parseFloat(limitPrice);
      if (isNaN(execPrice) || execPrice <= 0) {
        alert("Please enter a valid limit price.");
        return;
      }
      if (instrumentId === 'KERNEL-USD-SPOT' && side === 'buy' && wallet.usd < (execPrice * parsedQty * 1.001)) {
        alert("Insufficient USD balance for this limit order!");
        return;
      }
    }

    try {
      const res = await fetch('http://localhost:8000/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': sessionToken,
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          instrument_id: instrumentId,
          side,
          type: 'limit', // Engine maps it to limit based on deep price
          quantity: parsedQty,
          price: execPrice
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

  const maxBidVol = calculateMaxVolume(currentOrderbook.bids);
  const maxAskVol = calculateMaxVolume(currentOrderbook.asks);

  const buyPreview = getOrderPreview('buy', tradeQuantity || 0, orderType, limitPrice);
  const sellPreview = getOrderPreview('sell', tradeQuantity || 0, orderType, limitPrice);

  const currentMid = currentOrderbook.bids.length > 0 ? currentOrderbook.bids[0][0] : 0;

  if (isLoadingAuth) {
    return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>Loading Authentication...</div>;
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2rem 2rem', marginBottom: '1rem' }}>
        <div style={{ flex: 1 }}></div> {/* Left spacer to ensure center alignment */}
        <Link href="/" style={{ textDecoration: 'none', color: 'inherit', textAlign: 'center' }}>
          <h1 style={{ fontSize: '3rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '-1px', margin: 0 }}>
            Kernel Exchange
          </h1>
        </Link>
        <div style={{ flex: 1, textAlign: 'right' }}>
          <button 
            onClick={handleLogout} 
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem' }}
            onMouseOver={(e) => e.target.style.color = 'var(--primary)'}
            onMouseOut={(e) => e.target.style.color = 'var(--text-secondary)'}
          >
            Logout
          </button>
        </div>
      </div>
      <div className="dashboard-grid">
      <section className="glass-panel" style={{ padding: '1.5rem' }}>
        <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Portfolio</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
          <div>
            <div className="text-muted" style={{ fontSize: '0.875rem' }}>USD Balance</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
              ${(wallet.usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: '0.875rem' }}>Kernel Token</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
              {(wallet.kernel || 0).toLocaleString(undefined, { minimumFractionDigits: 4 })}
            </div>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <div className="text-muted" style={{ fontSize: '0.875rem' }}>Margin Balance (Derivs)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
              ${(wallet.margin_usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
        
        {Object.entries(wallet.positions || {}).map(([inst, pos]) => {
          if (pos.size === 0) return null;
          const instMid = (orderbooks[inst] && orderbooks[inst].bids.length > 0) ? orderbooks[inst].bids[0][0] : 0;
          const unrealizedPnL = instMid > 0 ? (instMid - pos.entry) * pos.size : 0;
          
          return (
            <div key={inst} style={{ marginBottom: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Position: {inst}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.875rem' }}>
                <div>Size: <strong className={pos.size > 0 ? 'text-green' : 'text-red'}>{pos.size}</strong></div>
                <div>Entry: <strong>${pos.entry.toFixed(2)}</strong></div>
                <div>Unrealized PnL: <strong className={unrealizedPnL >= 0 ? 'text-green' : 'text-red'}>${unrealizedPnL.toFixed(2)}</strong></div>
              </div>
            </div>
          );
        })}
        
        <h2 style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '1rem', marginTop: '2rem' }}>Trade Controls</h2>
        
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button 
            onClick={() => { setTradeMode('SPOT'); setInstrumentId('KERNEL-USD-SPOT'); }} 
            className="btn" 
            style={{ flex: 1, padding: '0.5rem', background: tradeMode === 'SPOT' ? 'var(--primary)' : 'transparent', border: '1px solid var(--border)', color: '#fff' }}
          >SPOT</button>
          <button 
            onClick={() => { setTradeMode('PERP'); setInstrumentId('KERNEL-PERP'); }} 
            className="btn" 
            style={{ flex: 1, padding: '0.5rem', background: tradeMode === 'PERP' ? 'var(--primary)' : 'transparent', border: '1px solid var(--border)', color: '#fff' }}
          >PERP</button>
          <button 
            onClick={() => { setTradeMode('OPTIONS'); setInstrumentId('KERNEL-10C'); }} 
            className="btn" 
            style={{ flex: 1, padding: '0.5rem', background: tradeMode === 'OPTIONS' ? 'var(--primary)' : 'transparent', border: '1px solid var(--border)', color: '#fff' }}
          >OPTIONS</button>
        </div>
        
        {tradeMode === 'OPTIONS' && (
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Select Contract</label>
            <select 
              value={instrumentId} 
              onChange={(e) => setInstrumentId(e.target.value)}
              className="input-field"
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: '#fff' }}
            >
              {[9, 10, 11].map(strike => (
                <optgroup label={`Strike $${strike}`} key={strike}>
                  <option value={`KERNEL-${strike}C`}>${strike} Call</option>
                  <option value={`KERNEL-${strike}P`}>${strike} Put</option>
                </optgroup>
              ))}
            </select>
          </div>
        )}
        
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button 
            onClick={() => setOrderType('market')} 
            className="btn" 
            style={{ flex: 1, padding: '0.5rem', background: orderType === 'market' ? 'rgba(255,255,255,0.1)' : 'transparent', border: '1px solid var(--border)', color: '#fff' }}
          >Market</button>
          <button 
            onClick={() => setOrderType('limit')} 
            className="btn" 
            style={{ flex: 1, padding: '0.5rem', background: orderType === 'limit' ? 'rgba(255,255,255,0.1)' : 'transparent', border: '1px solid var(--border)', color: '#fff' }}
          >Limit</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: orderType === 'limit' ? '1fr 1fr' : '1fr', gap: '0.5rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Quantity (Contracts)</label>
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
          
          {orderType === 'limit' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Limit Price ($)</label>
              <input 
                type="number" 
                min="0.01" 
                step="0.01" 
                value={limitPrice} 
                onChange={(e) => setLimitPrice(e.target.value)}
                className="input-field"
                style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: '#fff' }}
              />
            </div>
          )}
        </div>
        
        <div style={{ marginBottom: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="text-muted">Buy Preview:</span>
            <span>
              Notional: ${buyPreview.baseCost.toFixed(2)} | Fee: <strong className="text-red">-${buyPreview.fee.toFixed(2)}</strong>
              {instrumentId === 'KERNEL-USD-SPOT' && <span> = Cost: <strong className="text-red">${buyPreview.netTotal.toFixed(2)}</strong></span>}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="text-muted">Sell Preview:</span>
            <span>
              Notional: ${sellPreview.baseCost.toFixed(2)} | Fee: <strong className="text-red">-${sellPreview.fee.toFixed(2)}</strong>
              {instrumentId === 'KERNEL-USD-SPOT' && <span> = Receive: <strong className="text-green">${sellPreview.netTotal.toFixed(2)}</strong></span>}
            </span>
          </div>
          {(!buyPreview.filled || !sellPreview.filled) && tradeQuantity > 0 && (
            <div className="text-red" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Warning: Order size exceeds current book liquidity</div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <button onClick={() => handleTrade('buy')} className="btn trade-buy-btn">
            {tradeMode === 'SPOT' ? 'Buy' : 'Long'}
          </button>
          <button onClick={() => handleTrade('sell')} className="btn trade-sell-btn">
            {tradeMode === 'SPOT' ? 'Sell' : 'Short'}
          </button>
        </div>
      </section>

      <section className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2>Market Data ({instrumentId})</h2>
          <span className="text-muted" style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {connected ? (
              <><div className="live-indicator"></div> Live</>
            ) : (
              'Connecting...'
            )}
          </span>
        </div>
        
        <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.5rem' }}>
          <Chart instrumentId={instrumentId} currentMid={currentMid} />
        </div>
        
        <div style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)', padding: '2rem', color: 'var(--text-secondary)' }}>
          <h3 style={{color: '#fff', marginBottom: '1rem'}}>Derivatives Engine</h3>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem'}}>
            <div style={{padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)'}}>
              <div className="text-muted" style={{fontSize: '0.875rem'}}>Index Price (Spot)</div>
              <div style={{fontSize: '1.5rem', color: '#fff'}}>${(indexPrice || 0).toFixed(2)}</div>
            </div>
            <div style={{padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)'}}>
              <div className="text-muted" style={{fontSize: '0.875rem'}}>Perp Mark Price</div>
              <div style={{fontSize: '1.5rem', color: '#fff'}}>${(markPrice || 0).toFixed(2)}</div>
            </div>
            <div style={{padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)'}}>
              <div className="text-muted" style={{fontSize: '0.875rem'}}>Funding Rate (8h)</div>
              <div style={{fontSize: '1.5rem', color: fundingRate >= 0 ? 'var(--success)' : 'var(--danger)'}}>
                {(fundingRate * 100).toFixed(4)}%
              </div>
            </div>
          </div>
          
          <div style={{marginTop: '2rem'}}>
             <p><strong>Options Engine Active:</strong> The clearing house settles European Options every 60 seconds. Contracts are cash-settled directly into your USD balance.</p>
             <p className="text-green" style={{marginTop: '0.5rem'}}>Pro tip: Shorting options or perps requires Margin. Liquidations occur at 5% MMR.</p>
          </div>
        </div>
      </section>

      <section className="glass-panel" style={{ padding: '1.5rem' }}>
        <h2 style={{ marginBottom: '1.5rem' }}>L2 Order Book ({instrumentId})</h2>
        
        <div className="book-row book-header">
          <div>Price</div>
          <div style={{ textAlign: 'right' }}>Size</div>
          <div style={{ textAlign: 'right' }}>Total</div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '1rem' }}>
          {currentOrderbook.asks.slice().reverse().map((ask, i) => (
            <div key={i} className="book-row depth-bar-container text-red">
              <div className="depth-bar ask" style={{ width: `${(ask[1] / maxAskVol) * 100}%` }}></div>
              <div>{ask[0].toFixed(2)}</div>
              <div style={{ textAlign: 'right' }}>{ask[1].toFixed(2)}</div>
              <div style={{ textAlign: 'right' }}>{(ask[0] * ask[1]).toLocaleString()}</div>
            </div>
          ))}
          {currentOrderbook.asks.length === 0 && (
             <div className="text-muted" style={{ textAlign: 'center', padding: '1rem' }}>Awaiting Asks...</div>
          )}
        </div>
        
        <div style={{ textAlign: 'center', padding: '0.5rem 0', fontSize: '1.25rem', fontWeight: 600, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: '1rem' }}>
          {currentOrderbook.bids.length > 0 ? currentOrderbook.bids[0][0].toFixed(2) : '---'}
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {currentOrderbook.bids.map((bid, i) => (
            <div key={i} className="book-row depth-bar-container text-green">
              <div className="depth-bar" style={{ width: `${(bid[1] / maxBidVol) * 100}%` }}></div>
              <div>{bid[0].toFixed(2)}</div>
              <div style={{ textAlign: 'right' }}>{bid[1].toFixed(2)}</div>
              <div style={{ textAlign: 'right' }}>{(bid[0] * bid[1]).toLocaleString()}</div>
            </div>
          ))}
          {currentOrderbook.bids.length === 0 && (
             <div className="text-muted" style={{ textAlign: 'center', padding: '1rem' }}>Awaiting Bids...</div>
          )}
        </div>
      </section>
    </div>
      {/* FOOTER */}
      <footer style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr 1fr', 
        borderTop: '1px solid #fff', 
        borderBottom: '1px solid #fff', 
        color: '#fff',
        textTransform: 'uppercase',
        fontSize: '0.875rem',
        letterSpacing: '1px',
        marginTop: '4rem'
      }}>
        <div style={{ padding: '2rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Link href="/about" style={{ textDecoration: 'none', color: 'inherit', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            About
          </Link>
        </div>
        <div style={{ padding: '2rem', textAlign: 'center', borderLeft: '1px solid #fff', borderRight: '1px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'inherit', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Kernel Exchange
          </Link>
        </div>
        <div style={{ padding: '2rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Link href="/about#disclaimer" style={{ textDecoration: 'none', color: 'inherit', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Disclaimer
          </Link>
        </div>
      </footer>
    </>
  );
}
