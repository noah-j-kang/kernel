'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function DashboardPage() {
  const [wallet, setWallet] = useState(null);
  const [keys, setKeys] = useState([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState(null);
  const [error, setError] = useState('');
  
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('cookie_token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchDashboardData(token);
  }, [router]);

  const fetchDashboardData = async (token) => {
    try {
      const [walletRes, keysRes] = await Promise.all([
        fetch('http://localhost:8000/v1/auth/me/wallet', {
          headers: { 'Authorization': \`Bearer \${token}\` }
        }),
        fetch('http://localhost:8000/v1/auth/keys', {
          headers: { 'Authorization': \`Bearer \${token}\` }
        })
      ]);
      
      if (!walletRes.ok || !keysRes.ok) {
        if (walletRes.status === 401) {
          localStorage.removeItem('cookie_token');
          router.push('/login');
        }
        return;
      }
      
      setWallet(await walletRes.json());
      setKeys(await keysRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateKey = async (e) => {
    e.preventDefault();
    if (!newKeyName) return;
    
    const token = localStorage.getItem('cookie_token');
    try {
      const res = await fetch('http://localhost:8000/v1/auth/keys', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${token}\`
        },
        body: JSON.stringify({ name: newKeyName })
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedKey(data.raw_key);
        setNewKeyName('');
        fetchDashboardData(token);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRevokeKey = async (keyHash) => {
    const token = localStorage.getItem('cookie_token');
    try {
      const res = await fetch(\`http://localhost:8000/v1/auth/keys/\${keyHash}\`, {
        method: 'DELETE',
        headers: { 'Authorization': \`Bearer \${token}\` }
      });
      if (res.ok) {
        fetchDashboardData(token);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('cookie_token');
    localStorage.removeItem('cookie_user_id');
    router.push('/');
  };

  if (!wallet) {
    return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  const totalCapital = wallet.usd + wallet.margin_usd; // Basic calc

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '100vh', paddingTop: '4rem', paddingBottom: '4rem' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', padding: '0 2rem' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2.5rem', color: '#00ffaa', textTransform: 'uppercase', margin: 0 }}>Dashboard</h1>
          <div>
            <Link href="/trade" style={{ color: '#fff', textDecoration: 'none', marginRight: '1rem', border: '1px solid #333', padding: '0.5rem 1rem', borderRadius: '4px' }}>Trade</Link>
            <button onClick={handleLogout} style={{ background: 'transparent', border: '1px solid #ff4444', color: '#ff4444', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}>Logout</button>
          </div>
        </div>

        {/* Portfolio Overview */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '2rem', marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#aaa', textTransform: 'uppercase' }}>Portfolio Value</h2>
          <div style={{ fontSize: '3rem', fontWeight: 'bold' }}>\${totalCapital.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          
          <div style={{ display: 'flex', gap: '2rem', marginTop: '2rem' }}>
            <div>
              <div style={{ color: '#888', fontSize: '0.875rem' }}>Spot USD</div>
              <div style={{ fontSize: '1.25rem' }}>\${wallet.usd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            </div>
            <div>
              <div style={{ color: '#888', fontSize: '0.875rem' }}>Margin USD</div>
              <div style={{ fontSize: '1.25rem' }}>\${wallet.margin_usd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            </div>
            <div>
              <div style={{ color: '#888', fontSize: '0.875rem' }}>Cookie Balance</div>
              <div style={{ fontSize: '1.25rem' }}>{wallet.cookie.toFixed(4)}</div>
            </div>
          </div>
        </div>

        {/* API Keys */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#00ffaa' }}>API Keys</h2>
          <p style={{ color: '#aaa', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            Use these keys to authenticate your Python SDK trading bots. Do not share them.
          </p>
          
          {generatedKey && (
            <div style={{ background: 'rgba(0,255,170,0.1)', border: '1px solid #00ffaa', padding: '1.5rem', borderRadius: '4px', marginBottom: '2rem' }}>
              <h3 style={{ color: '#00ffaa', margin: '0 0 1rem 0' }}>New Key Generated!</h3>
              <p style={{ margin: '0 0 0.5rem 0', color: '#fff' }}>Please copy this key now. You will not be able to see it again.</p>
              <code style={{ display: 'block', background: '#000', padding: '1rem', borderRadius: '4px', wordBreak: 'break-all' }}>{generatedKey}</code>
              <button onClick={() => setGeneratedKey(null)} style={{ marginTop: '1rem', background: '#333', border: 'none', color: '#fff', padding: '0.5rem 1rem', cursor: 'pointer', borderRadius: '4px' }}>I have saved it</button>
            </div>
          )}

          <form onSubmit={handleCreateKey} style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
            <input 
              type="text" 
              placeholder="Key Name (e.g. My Arbitrage Bot)" 
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              style={{ flex: 1, padding: '0.75rem', background: '#111', border: '1px solid #333', color: '#fff', borderRadius: '4px' }}
            />
            <button type="submit" style={{ padding: '0.75rem 1.5rem', background: '#00ffaa', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Create Key</button>
          </form>

          {keys.length === 0 ? (
            <div style={{ color: '#666', fontStyle: 'italic' }}>No API keys generated yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {keys.map((k) => (
                <div key={k.key_hash} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '1rem', borderRadius: '4px', border: '1px solid #222' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{k.name}</div>
                    <div style={{ color: '#666', fontSize: '0.875rem', fontFamily: 'monospace' }}>{k.prefix}...</div>
                  </div>
                  <button onClick={() => handleRevokeKey(k.key_hash)} style={{ background: 'transparent', border: '1px solid #ff4444', color: '#ff4444', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}>
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
