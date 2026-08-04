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
            <div className="about-title">Cookie Exchange</div>
            <div className="about-text">
              The premier destination for simulated commodity trading. We offer an ultra-low latency matching engine designed to replicate the feel and execution of high-frequency institutional trading environments, built from the ground up for the Cookie ecosystem.
            </div>
          </div>

          <div className="about-section">
            <div className="about-title">Features</div>
            <div className="about-text">
              <ul style={{ listStyleType: 'none', padding: 0 }}>
                <li style={{ marginBottom: '1rem' }}><strong>Spot Trading:</strong> Zero spread instant execution with deep liquidity for COOKIE/USD pairs.</li>
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
              <strong>Cookie is a simulated, fake commodity.</strong> It has absolutely no real-world USD value. Any balances, positions, or profits shown on this application are entirely fictitious and exist only for educational, testing, or entertainment purposes. Do not deposit real funds or expect real returns.
            </div>
          </div>
        </div>
      </div>
      
    </div>
  );
}
