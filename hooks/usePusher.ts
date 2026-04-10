'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import PusherClient from 'pusher-js';
import type { Channel } from 'pusher-js';

// ─── Types ───────────────────────────────────────────────────

interface PusherContextValue {
  /** Subscribe to a game channel and bind event handlers. Returns an unbind function. */
  subscribe: (channel: string, handlers: Record<string, (data: unknown) => void>) => () => void;
  /** Whether the Pusher client is connected. */
  isConnected: boolean;
}

// ─── Context ─────────────────────────────────────────────────

export const PusherContext = createContext<PusherContextValue>({
  subscribe: () => () => {},
  isConnected: false,
});

export function usePusher() {
  return useContext(PusherContext);
}

// ─── Hook (used by PusherProvider) ───────────────────────────

export function usePusherInstance() {
  const clientRef = useRef<PusherClient | null>(null);
  const channelsRef = useRef<Map<string, Channel>>(new Map());
  const [isConnected, setIsConnected] = useState(false);

  // Initialize Pusher client once
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) {
      console.warn('[Pusher] NEXT_PUBLIC_PUSHER_KEY or CLUSTER not set — real-time disabled.');
      return;
    }

    const client = new PusherClient(key, {
      cluster,
      // Pusher auto-reconnects by default
    });

    clientRef.current = client;

    client.connection.bind('connected', () => {
      console.log('[Pusher] Connected');
      setIsConnected(true);
    });

    client.connection.bind('disconnected', () => {
      console.log('[Pusher] Disconnected');
      setIsConnected(false);
    });

    return () => {
      // Unsubscribe all channels and disconnect
      channelsRef.current.forEach((ch) => ch.unbind_all());
      channelsRef.current.clear();
      client.disconnect();
      clientRef.current = null;
    };
  }, []);

  // Subscribe to a channel with event handlers.
  // Returns a cleanup function that unbinds handlers and unsubscribes if no other bindings remain.
  const subscribe = useCallback(
    (channelName: string, handlers: Record<string, (data: unknown) => void>): (() => void) => {
      const client = clientRef.current;
      if (!client) return () => {};

      // Get or create the channel subscription
      let channel = channelsRef.current.get(channelName);
      if (!channel) {
        channel = client.subscribe(channelName);
        channelsRef.current.set(channelName, channel);
      }

      // Bind each handler
      for (const [event, handler] of Object.entries(handlers)) {
        channel.bind(event, handler);
      }

      // Return unbind function
      return () => {
        if (!channel) return;
        for (const [event, handler] of Object.entries(handlers)) {
          channel.unbind(event, handler);
        }
      };
    },
    [],
  );

  return { subscribe, isConnected };
}
