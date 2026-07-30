import './globals.css';
import { Roboto_Mono } from 'next/font/google';
import CustomCursor from './CustomCursor';
import Link from 'next/link';

const robotoMono = Roboto_Mono({ subsets: ['latin'] });

export const metadata = {
  title: 'Kernel Exchange',
  description: 'A high-performance simulated commodity exchange',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={robotoMono.className}>
        <CustomCursor />

        <main className="container">
          {children}
        </main>
      </body>
    </html>
  );
}
