import Pusher from 'pusher';

// Server-side Pusher client — used in API routes to broadcast events.
// Pusher publishes via REST (no persistent connection), making it
// compatible with Vercel's serverless functions.

const appId = process.env.PUSHER_APP_ID;
const key = process.env.PUSHER_KEY;
const secret = process.env.PUSHER_SECRET;
const cluster = process.env.PUSHER_CLUSTER;

let pusher: Pusher | null = null;

function getPusher(): Pusher {
  if (!pusher) {
    if (!appId || !key || !secret || !cluster) {
      console.warn('[realtime] Pusher credentials not set — broadcasts will be no-ops.');
      // Return a dummy that silently drops events (useful for local dev without Pusher)
      return {
        trigger: async () => ({}),
      } as unknown as Pusher;
    }
    pusher = new Pusher({
      appId,
      key,
      secret,
      cluster,
      useTLS: true,
    });
  }
  return pusher;
}

/**
 * Broadcast an event to all clients subscribed to a game's channel.
 * Channel name: `game-{GAMECODE}` (e.g., `game-ABCD`).
 * Safe to call even if Pusher isn't configured — silently no-ops.
 */
export async function broadcast(gameCode: string, event: string, data: unknown = {}): Promise<void> {
  try {
    await getPusher().trigger(`game-${gameCode.toUpperCase()}`, event, data);
  } catch (err) {
    console.error(`[realtime] Failed to broadcast ${event} to game-${gameCode}:`, err);
  }
}

/**
 * Send an event to a specific player's private channel.
 * Channel name: `player-{PLAYERID}` (e.g., `player-42`).
 * Used for night wake/sleep signals that target individual players.
 */
export async function sendToPlayer(playerId: number, event: string, data: unknown = {}): Promise<void> {
  try {
    await getPusher().trigger(`player-${playerId}`, event, data);
  } catch (err) {
    console.error(`[realtime] Failed to send ${event} to player-${playerId}:`, err);
  }
}
