import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Providers } from '../components/providers';

const vazir = localFont({
  src: '../fonts/Vazirmatn-Variable.woff2',
  variable: '--font-vazir',
  weight: '100 900',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'بازار سیاه · Whisper Market',
  icons: { icon: '/favicon.svg' },
  description: 'بازی دورهمی تاجرهای شب‌های بندر: حرف بزن، ردپا را بخوان، سفارش سربسته بده.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0a1322',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={vazir.variable}>
      <body className="font-sans antialiased fog">
        <div className="water" aria-hidden />
        <Providers>
          <div className="relative z-10">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
