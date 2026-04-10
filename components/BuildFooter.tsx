'use client';

import { usePathname } from 'next/navigation';

// Read from package.json at import time (bundled by webpack)
const APP_VERSION = '2.0.0';

export default function BuildFooter() {
  const pathname = usePathname();
  const buildId = process.env.NEXT_PUBLIC_BUILD_ID || 'dev';
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME;

  // Format build time as a short readable string
  const formattedTime = buildTime
    ? new Date(buildTime).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  // Hide footer on immersive player screens (night sleep, night wake, dead, game over)
  // by making it very subtle — always present but non-intrusive
  const isPlayerView = pathname?.startsWith('/play/');

  return (
    <footer
      className={`fixed bottom-0 left-0 right-0 z-10 text-center py-1.5 pointer-events-none
        ${isPlayerView ? 'opacity-20' : 'opacity-40'} hover:opacity-80 transition-opacity`}
    >
      <p className="text-[10px] text-moon-dim font-mono">
        v{APP_VERSION}
        <span className="mx-1.5">·</span>
        {buildId}
        {formattedTime && (
          <>
            <span className="mx-1.5">·</span>
            {formattedTime}
          </>
        )}
      </p>
    </footer>
  );
}
