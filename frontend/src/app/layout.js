import './globals.css';
import { Roboto_Mono } from 'next/font/google';
import CustomCursor from './CustomCursor';
import Link from 'next/link';

const robotoMono = Roboto_Mono({ subsets: ['latin'] });

export const metadata = {
  title: 'Cookie Exchange',
  description: 'A high-performance simulated commodity exchange',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={robotoMono.className}>
        <CustomCursor />

        <main className="container" style={{ minHeight: 'calc(100vh - 180px)' }}>
          {children}
        </main>
        
        <footer style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr 1fr 1fr', 
          borderTop: '1px solid #fff', 
          borderBottom: '1px solid #fff', 
          color: '#fff',
          textTransform: 'uppercase',
          fontSize: '0.875rem',
          letterSpacing: '1px',
          marginTop: 'auto',
          maxWidth: '1200px',
          margin: 'auto auto 2rem auto',
          width: '90%'
        }}>
          <div style={{ padding: '2rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Link href="/leaderboard" style={{ textDecoration: 'none', color: 'inherit', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Leaderboard
            </Link>
          </div>
          <div style={{ padding: '2rem', textAlign: 'center', borderLeft: '1px solid #fff', borderRight: '1px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Link href="/" style={{ textDecoration: 'none', color: 'inherit', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Cookie Exchange
            </Link>
          </div>
          <div style={{ padding: '2rem', textAlign: 'center', borderRight: '1px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Link href="/about#disclaimer" style={{ textDecoration: 'none', color: 'inherit', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Disclaimer
            </Link>
          </div>
          <div style={{ padding: '2rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Link href="/about" style={{ textDecoration: 'none', color: 'inherit', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              About
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
