'use client';

import Link from 'next/link';
import Chart from './Chart';
import { useEffect, useState } from 'react';

export default function LandingPage() {
  const [currentMid, setCurrentMid] = useState(0);
  
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
        if (data.type === 'l2_update' && (!data.instrument_id || data.instrument_id === 'KERNEL-USD-SPOT')) {
          if (data.book && data.book.bids && data.book.bids.length > 0) {
            setCurrentMid(data.book.bids[0][0]);
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
          Kernel Exchange
        </h1>
        <div className="animate-fade-up" style={{ animationDelay: '0.2s', marginTop: '3rem' }}>
          <Link href="/login" className="btn btn-primary" style={{ fontSize: '1.25rem', padding: '1rem 2rem', display: 'inline-flex', alignItems: 'center', gap: '1rem', border: '1px solid #fff' }}>
            Trade Kernel <span>→</span>
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
              KERNEL/USD
              <span style={{ fontSize: '0.875rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="live-indicator"></span> LIVE
              </span>
            </h3>
            <div style={{ flex: 1, minHeight: '400px', background: '#000' }}>
              <Chart instrumentId="KERNEL-USD-SPOT" currentMid={currentMid} />
            </div>
          </div>

          {/* Features Box */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ border: '1px solid var(--border)', padding: '3rem', background: 'var(--surface)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
               <h3 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Spot Trading</h3>
               <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Trade Kernel instantly with zero spread. Deep liquidity ensures you always get the best price.</p>
            </div>
            <div style={{ border: '1px solid var(--border)', padding: '3rem', background: 'var(--surface)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
               <h3 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Perpetuals & Options</h3>
               <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Leverage your positions with advanced derivatives. Our clearing house settles European Options every 60 seconds.</p>
            </div>
          </div>
        </div>

      </section>
      
      {/* FOOTER */}
      <footer style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr 1fr', 
        borderTop: '1px solid #fff', 
        borderBottom: '1px solid #fff', 
        color: '#fff',
        textTransform: 'uppercase',
        fontSize: '0.875rem',
        letterSpacing: '1px'
      }}>
        <div style={{ padding: '2rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Link href="/about" style={{ textDecoration: 'none', color: 'inherit', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            About
          </Link>
        </div>
        <div style={{ padding: '2rem', textAlign: 'center', borderLeft: '1px solid #fff', borderRight: '1px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ textDecoration: 'none', color: 'inherit', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Kernel Exchange
          </a>
        </div>
        <div style={{ padding: '2rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Link href="/about#disclaimer" style={{ textDecoration: 'none', color: 'inherit', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Disclaimer
          </Link>
        </div>
      </footer>
    </div>
  );
}
