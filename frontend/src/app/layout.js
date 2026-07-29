import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Kernel Exchange',
  description: 'A high-performance simulated commodity exchange',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <header className="header">
          <div className="brand">
            <div className="live-indicator"></div>
            Kernel Exchange
          </div>
          <nav>
            <button className="btn btn-primary">Generate API Key</button>
          </nav>
        </header>
        <main className="container">
          {children}
        </main>
      </body>
    </html>
  );
}
