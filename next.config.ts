import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Inject build-time values as environment variables accessible to client code.
  // These update automatically on every Vercel deploy — no manual version bumping.
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
