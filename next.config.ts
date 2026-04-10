import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // No serverExternalPackages needed — Turso and Pusher are pure JS/HTTP clients
};

export default nextConfig;
