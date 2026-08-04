'use client';

import Link from 'next/link';
import Chart from './Chart';
import { useEffect, useState } from 'react';

export default function LandingPage() {
  const [currentMid, setCurrentMid] = useState(0);
  const [orderbook, setOrderbook] = useState({ bids: [], asks: [] });
  
  const MAX_ROWS = 8;
  const maxAskVol = Math.max(...(orderbook.asks || []).map(a => a[1]), 1);
  const maxBidVol = Math.max(...(orderbook.bids || []).map(b => b[1]), 1);
  
  const displayAsks = orderbook.asks ? orderbook.asks.slice(0, MAX_ROWS) : [];
  const hasMoreAsks = orderbook.asks && orderbook.asks.length > MAX_ROWS;
  
  const displayBids = orderbook.bids ? orderbook.bids.slice(0, MAX_ROWS) : [];
  const hasMoreBids = orderbook.bids && orderbook.bids.length > MAX_ROWS;
  useEffect(() => {
    // Basic Intersection Observer for scroll animations if needed beyond the initial load
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-fade-up');
        }
      });
    }, { threshold: 0.1 });

    const hiddenElements = document.querySelectorAll('.scroll-hidden');
    hiddenElements.forEach((el) => observer.observe(el));

    return () => {
      hiddenElements.forEach((el) => observer.unobserve(el));
    };
  }, []);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws');
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', api_key: 'local_user_123' }));
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'l2_update' && (!data.instrument_id || data.instrument_id === 'COOKIE-USD-SPOT')) {
          if (data.book) {
            setOrderbook(data.book);
            if (data.book.bids && data.book.bids.length > 0) {
              setCurrentMid(data.book.bids[0][0]);
            }
          }
        }
      } catch (e) {}
    };
    return () => ws.close();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {/* HERO SECTION */}
      <section style={{ height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
        <h1 className="typewriter-text" style={{ fontSize: 'clamp(4rem, 8vw, 8rem)', textTransform: 'uppercase', fontWeight: 900, textAlign: 'center', lineHeight: 1.1 }}>
          Cookie Exchange
        </h1>
        <div className="animate-fade-up" style={{ animationDelay: '0.2s', marginTop: '3rem' }}>
          <Link href="/login" className="btn btn-primary" style={{ fontSize: '1.25rem', padding: '1rem 2rem', display: 'inline-flex', alignItems: 'center', gap: '1rem', border: '1px solid #fff' }}>
            Trade Cookie <span>→</span>
          </Link>
        </div>
      </section>

      {/* FEATURES & CHART SECTION */}
      <section style={{ padding: '8rem 2rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '4rem', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
        
        <div className="scroll-hidden" style={{ opacity: 0 }}>
          <h2 style={{ fontSize: '3rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '-1px' }}>The Market is Live</h2>
          <p style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', maxWidth: '600px' }}>
            Experience real-time candlestick charts, institutional-grade orderbooks, and zero-latency execution.
          </p>
        </div>

        <div className="scroll-hidden" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem', opacity: 0 }}>
          {/* Chart Box */}
          <div style={{ border: '1px solid var(--border)', padding: '2rem', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              COOKIE/USD
              <span style={{ fontSize: '0.875rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="live-indicator"></span> LIVE
              </span>
            </h3>
            <div style={{ flex: 1, minHeight: '400px', background: '#000' }}>
              <Chart instrumentId="COOKIE-USD-SPOT" currentMid={currentMid} />
            </div>
          </div>

          {/* Orderbook Box */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', border: '1px solid var(--border)', padding: '2rem', background: 'var(--surface)' }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
              L2 Order Book
            </h3>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="book-row book-header" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                <div>Price</div>
                <div style={{ textAlign: 'right' }}>Size</div>
                <div style={{ textAlign: 'right' }}>Total</div>
              </div>
              
              <div style={{ fontFamily: '"Roboto Mono", monospace', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Sell Orders</div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', height: '250px', gap: '0.25rem', marginBottom: '1rem', overflow: 'hidden' }}>
                {displayAsks.map((ask, i) => (
                  <div key={i} className="book-row depth-bar-container text-red" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: '0.875rem', position: 'relative' }}>
                    <div className="depth-bar ask" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, background: 'rgba(239, 68, 68, 0.1)', width: `${(ask[1] / maxAskVol) * 100}%`, zIndex: 0 }}></div>
                    <div style={{ zIndex: 1 }}>{ask[0].toFixed(2)}</div>
                    <div style={{ textAlign: 'right', zIndex: 1 }}>{ask[1].toFixed(2)}</div>
                    <div style={{ textAlign: 'right', zIndex: 1 }}>{(ask[0] * ask[1]).toLocaleString()}</div>
                  </div>
                ))}
                {(!orderbook.asks || orderbook.asks.length === 0) && (
                   <div className="text-muted" style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)' }}>Awaiting Asks...</div>
                )}
                {hasMoreAsks && <div className="text-muted" style={{ textAlign: 'center', fontSize: '1rem', color: 'var(--text-secondary)', paddingBottom: '0.5rem' }}>...</div>}
              </div>
              
              <div style={{ textAlign: 'center', padding: '0.5rem 0', fontSize: '1.25rem', fontWeight: 600, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: '1rem' }}>
                {orderbook.bids && orderbook.bids.length > 0 ? orderbook.bids[0][0].toFixed(2) : '---'}
              </div>
              
              <div style={{ fontFamily: '"Roboto Mono", monospace', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Buy Orders</div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', height: '250px', gap: '0.25rem', overflow: 'hidden' }}>
                {displayBids.map((bid, i) => (
                  <div key={i} className="book-row depth-bar-container text-green" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: '0.875rem', position: 'relative' }}>
                    <div className="depth-bar" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, background: 'rgba(16, 185, 129, 0.1)', width: `${(bid[1] / maxBidVol) * 100}%`, zIndex: 0 }}></div>
                    <div style={{ zIndex: 1 }}>{bid[0].toFixed(2)}</div>
                    <div style={{ textAlign: 'right', zIndex: 1 }}>{bid[1].toFixed(2)}</div>
                    <div style={{ textAlign: 'right', zIndex: 1 }}>{(bid[0] * bid[1]).toLocaleString()}</div>
                  </div>
                ))}
                {(!orderbook.bids || orderbook.bids.length === 0) && (
                   <div className="text-muted" style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)' }}>Awaiting Bids...</div>
                )}
                {hasMoreBids && <div className="text-muted" style={{ textAlign: 'center', fontSize: '1rem', color: 'var(--text-secondary)', paddingBottom: '0.5rem' }}>...</div>}
              </div>
            </div>
          </div>
        </div>

      </section>
      
    </div>
  );
}
