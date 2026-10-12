import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { AuthProvider } from '@/lib/useAuth';

const manrope = Manrope({ subsets: ['latin', 'cyrillic'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Tsundoku — читалка манги, манхвы и книг', template: '%s · Tsundoku' },
  description:
    'Веб-читалка манхвы, манги и книг: единый каталог, библиотека, читалка литературы для сочинения и векторный AI-оверлей.',
  keywords: ['читалка манги', 'манхва онлайн', 'tsundoku', 'книги', 'mangalib', 'remanga', 'mangamir', 'wamanga', 'mangadex', 'com-x'],
  openGraph: {
    title: 'Tsundoku — читалка манги, манхвы и книг',
    description: 'Все источники в одном каталоге, библиотека литературы, история и векторный AI-оверлей.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#0c0d12',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={manrope.variable}>
      <body>
        <AuthProvider>
          <Navbar />
          <main>{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
