'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/v1/leaderboard`);
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data);
      }
    } catch (err) {
      console.error('Failed to fetch leaderboard', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: '40px 20px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '30px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', color: '#fff' }}>Leaderboard</h1>
        <Link href="/" style={{ color: '#00ffaa', textDecoration: 'none', border: '1px solid #00ffaa', padding: '8px 16px', borderRadius: '4px' }}>
          Back to Exchange
        </Link>
      </div>

      <div style={{
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={{ padding: '16px', color: '#888', fontWeight: 'normal' }}>Rank</th>
              <th style={{ padding: '16px', color: '#888', fontWeight: 'normal' }}>Name</th>
              <th style={{ padding: '16px', color: '#888', fontWeight: 'normal', textAlign: 'right' }}>Current Capital</th>
            </tr>
          </thead>
          <tbody>
            {loading && leaderboard.length === 0 ? (
              <tr>
                <td colSpan="3" style={{ padding: '30px', textAlign: 'center', color: '#888' }}>Loading...</td>
              </tr>
            ) : leaderboard.length === 0 ? (
              <tr>
                <td colSpan="3" style={{ padding: '30px', textAlign: 'center', color: '#888' }}>No data available</td>
              </tr>
            ) : (
              leaderboard.map((entry, index) => (
                <tr key={index} style={{
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '16px', color: index < 3 ? '#00ffaa' : '#fff' }}>
                    #{entry.rank}
                  </td>
                  <td style={{ padding: '16px', color: '#fff' }}>
                    {entry.name}
                  </td>
                  <td style={{ padding: '16px', color: '#fff', textAlign: 'right', fontFamily: 'monospace' }}>
                    ${entry.capital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
