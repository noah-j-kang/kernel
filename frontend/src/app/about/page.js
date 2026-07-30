'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function AboutPage() {
  
  useEffect(() => {
    // Simple fade-up animation logic
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '100vh', paddingTop: '4rem' }}>
      <style>{`
        .about-section {
          display: grid;
          grid-template-columns: 1fr 2fr;
          border-bottom: 1px solid #fff;
          border-left: 1px solid #fff;
          border-right: 1px solid #fff;
          padding: 2rem;
          transition: background-color 0.4s ease, color 0.4s ease;
          text-decoration: none;
          color: #fff;
        }
        .about-section:hover {
          background-color: #fff;
          color: #000;
        }
        .about-section:first-of-type {
          border-top: 1px solid #fff;
        }
        .about-title {
          font-size: 1.25rem;
          font-weight: 700;
          text-transform: uppercase;
        }
        .about-text {
          font-size: 1rem;
          line-height: 1.6;
        }
        
        /* Responsive */
        @media (max-width: 768px) {
          .about-section {
            grid-template-columns: 1fr;
            gap: 1.5rem;
          }
        }
      `}</style>

      <div style={{ maxWidth: '1400px', margin: '0 auto', width: '100%', padding: '0 2rem 4rem' }}>
        <h1 className="animate-fade-up" style={{ fontSize: '3rem', textTransform: 'uppercase', fontWeight: 900, marginBottom: '4rem', letterSpacing: '-1px' }}>
          About
        </h1>

        <div className="scroll-hidden" style={{ opacity: 0 }}>
          <div className="about-section">
            <div className="about-title">Kernel Exchange</div>
            <div className="about-text">
              The premier destination for simulated commodity trading. We offer an ultra-low latency matching engine designed to replicate the feel and execution of high-frequency institutional trading environments, built from the ground up for the Kernel ecosystem.
            </div>
          </div>

          <div className="about-section">
            <div className="about-title">Features</div>
            <div className="about-text">
              <ul style={{ listStyleType: 'none', padding: 0 }}>
                <li style={{ marginBottom: '1rem' }}><strong>Spot Trading:</strong> Zero spread instant execution with deep liquidity for KERNEL/USD pairs.</li>
                <li style={{ marginBottom: '1rem' }}><strong>Perpetuals:</strong> Trade with margin. Funding rates settle every 8 hours, keeping the mark price anchored to the index.</li>
                <li><strong>Options:</strong> Cash-settled European options that expire and settle directly into your balance automatically.</li>
              </ul>
            </div>
          </div>

          <div className="about-section">
            <div className="about-title">API Access</div>
            <div className="about-text">
              Integrate your automated trading bots directly into our matching engine via our high-speed WebSocket and REST APIs. <br/><br/>
              <em>[API Documentation Placeholder - Coming Soon]</em>
            </div>
          </div>

          <div className="about-section" id="disclaimer">
            <div className="about-title">Disclaimer</div>
            <div className="about-text">
              <strong>Kernel is a simulated, fake commodity.</strong> It has absolutely no real-world USD value. Any balances, positions, or profits shown on this application are entirely fictitious and exist only for educational, testing, or entertainment purposes. Do not deposit real funds or expect real returns.
            </div>
          </div>
        </div>
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
        marginTop: 'auto'
      }}>
        <div style={{ padding: '2rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ textDecoration: 'none', color: 'inherit', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            About
          </a>
        </div>
        <div style={{ padding: '2rem', textAlign: 'center', borderLeft: '1px solid #fff', borderRight: '1px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'inherit', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Kernel Exchange
          </Link>
        </div>
        <div style={{ padding: '2rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <a href="#disclaimer" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: document.getElementById('disclaimer')?.offsetTop || 0, behavior: 'smooth' }); }} style={{ textDecoration: 'none', color: 'inherit', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Disclaimer
          </a>
        </div>
      </footer>
    </div>
  );
}
