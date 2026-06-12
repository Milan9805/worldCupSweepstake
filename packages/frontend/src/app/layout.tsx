import type { Metadata, Viewport } from 'next';
import { GroupProvider } from '@/hooks/GroupContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'FIFA World Cup 2026 Sweepstake',
  description: 'Track your sweepstake teams through the 2026 World Cup',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Sweepstake',
  },
};

export const viewport: Viewport = {
  themeColor: '#111111',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {/* One shared data instance (matches/teams/group + the score poll) for
            every page — see GroupContext. */}
        <GroupProvider>{children}</GroupProvider>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}",
          }}
        />
      </body>
    </html>
  );
}
