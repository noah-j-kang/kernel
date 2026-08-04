'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('cookie_token');
    if (token) {
      router.push('/dashboard');
    } else {
      setIsCheckingSession(false);
    }
  }, [router]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    
    const endpoint = isLogin ? '/v1/auth/login' : '/v1/auth/register';

    try {
      const res = await fetch(`http://localhost:8000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.detail || 'Authentication failed');
        return;
      }
      
      if (isLogin) {
        localStorage.setItem('cookie_token', data.token);
        localStorage.setItem('cookie_user_id', data.user_id);
        router.push('/dashboard');
      } else {
        setMessage('Registration successful! Please log in.');
        setIsLogin(true);
      }
    } catch (err) {
      setError('Network error connecting to backend');
    }
  };

  if (isCheckingSession) {
    return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>Checking Session...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ padding: '2rem', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '1.5rem', textAlign: 'center', textTransform: 'uppercase' }}>
          {isLogin ? 'Log In' : 'Sign Up'}
        </h2>

        {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem', textAlign: 'center' }}>{error}</div>}
        {message && <div style={{ color: 'var(--success)', marginBottom: '1rem', textAlign: 'center' }}>{message}</div>}

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Email</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required
              className="input-field"
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: '#fff' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required
              className="input-field"
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: '#fff' }}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ padding: '1rem', fontSize: '1.1rem', marginTop: '0.5rem', width: '100%' }}>
            {isLogin ? 'Log In' : 'Sign Up'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <button 
            onClick={() => setIsLogin(!isLogin)} 
            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {isLogin ? 'Need an account? Sign up' : 'Already have an account? Log in'}
          </button>
        </div>
        
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <Link href="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>← Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
