import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ultimate Werewolf',
  description: 'Real-time Ultimate Werewolf game moderator',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-charcoal text-moon antialiased">
        {children}
      </body>
    </html>
  );
}
