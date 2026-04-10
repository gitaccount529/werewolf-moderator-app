import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll, run } from '@/lib/db';
import { broadcast } from '@/lib/realtime';
import type { Game, Player } from '@/lib/types';

type Params = { params: Promise<{ gameCode: string }> };

// GET /api/games/[gameCode]/players
export async function GET(_request: NextRequest, { params }: Params) {
  const { gameCode } = await params;

  const game = await queryOne<Game>(
    'SELECT id FROM games WHERE code = ?',
    gameCode.toUpperCase(),
  );

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  const players = await queryAll<Player>(
    'SELECT * FROM players WHERE game_id = ? ORDER BY seat_order, joined_at',
    game.id,
  );

  return NextResponse.json(players);
}

// POST /api/games/[gameCode]/players — Add player
export async function POST(request: NextRequest, { params }: Params) {
  const { gameCode } = await params;
  const body = await request.json();
  const { name } = body as { name?: string };

  if (!name || name.trim().length === 0) {
    return NextResponse.json({ error: 'Player name is required' }, { status: 400 });
  }

  const game = await queryOne<Game>(
    'SELECT * FROM games WHERE code = ?',
    gameCode.toUpperCase(),
  );

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  if (game.status !== 'lobby') {
    return NextResponse.json({ error: 'Game has already started' }, { status: 400 });
  }

  // Check for duplicate name
  const existing = await queryOne<Player>(
    'SELECT id FROM players WHERE game_id = ? AND name = ?',
    game.id,
    name.trim(),
  );

  if (existing) {
    return NextResponse.json({ error: 'A player with that name already exists' }, { status: 409 });
  }

  // Get next seat order
  const maxSeat = await queryOne<{ max_seat: number | null }>(
    'SELECT MAX(seat_order) as max_seat FROM players WHERE game_id = ?',
    game.id,
  );
  const seatOrder = (maxSeat?.max_seat ?? -1) + 1;

  const result = await run(
    'INSERT INTO players (game_id, name, seat_order) VALUES (?, ?, ?)',
    game.id,
    name.trim(),
    seatOrder,
  );

  const newPlayerId = Number(result.lastInsertRowid);

  // Broadcast to all clients in the game
  await broadcast(gameCode, 'player:joined', { playerId: newPlayerId, name: name.trim() });

  return NextResponse.json({
    id: newPlayerId,
    name: name.trim(),
    gameId: game.id,
  });
}

// DELETE /api/games/[gameCode]/players — Kick player
export async function DELETE(request: NextRequest, { params }: Params) {
  const { gameCode } = await params;
  const body = await request.json();
  const { playerId } = body as { playerId?: number };

  if (!playerId) {
    return NextResponse.json({ error: 'Player ID is required' }, { status: 400 });
  }

  const game = await queryOne<Game>(
    'SELECT * FROM games WHERE code = ?',
    gameCode.toUpperCase(),
  );

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  if (game.status !== 'lobby') {
    return NextResponse.json({ error: 'Cannot kick players after game has started' }, { status: 400 });
  }

  await run('DELETE FROM players WHERE id = ? AND game_id = ?', playerId, game.id);

  await broadcast(gameCode, 'player:left', { playerId });

  return NextResponse.json({ success: true });
}
