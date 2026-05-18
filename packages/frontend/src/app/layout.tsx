import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FIFA World Cup 2026 Sweepstake',
  description: 'Track your sweepstake teams through the 2026 World Cup',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
