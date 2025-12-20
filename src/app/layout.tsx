
import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import { Header } from '@/components/layout/header';
import { FirebaseConfigCheck } from '@/components/firebase-config-check';
import './globals.css';

const notoSansKR = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'CBM Vision',
  description: 'Jangbogo Express CBM Smart Workboard',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${notoSansKR.variable}`} suppressHydrationWarning>
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📦</text></svg>" />
      </head>
      <body className="font-body antialiased" suppressHydrationWarning>
        <FirebaseConfigCheck>
          <div className="min-h-screen flex flex-col">
            <Header />
            <div className="flex-grow">
              {children}
            </div>
            <footer className="text-center p-4 text-muted-foreground text-sm">
              <p>Jangbogo Express CBM Smart Workboard</p>
            </footer>
          </div>
          <Toaster />
        </FirebaseConfigCheck>
      </body>
    </html>
  );
}
