import { NextRequest, NextResponse } from 'next/server';
import { sendToPlayer } from '@/lib/realtime';

type Params = { params: Promise<{ gameCode: string }> };

// POST /api/games/[gameCode]/night/signal — Wake or sleep specific players
// Replaces the old Socket.IO night:wake / night:sleep targeted events.
// The moderator's client calls this when advancing through night steps.
export async function POST(request: NextRequest, { params }: Params) {
  const body = await request.json();
  const { action, playerIds, roleName } = body as {
    action: 'wake' | 'sleep';
    playerIds: number[];
    roleName?: string;
  };

  if (!action || !playerIds || !Array.isArray(playerIds)) {
    return NextResponse.json(
      { error: 'action and playerIds are required' },
      { status: 400 },
    );
  }

  // Send targeted event to each player's personal channel
  const event = action === 'wake' ? 'night:wake' : 'night:sleep';
  const data = action === 'wake' ? { roleName } : {};

  await Promise.all(
    playerIds.map((id) => sendToPlayer(id, event, data)),
  );

  return NextResponse.json({ success: true });
}
