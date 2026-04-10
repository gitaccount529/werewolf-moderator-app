import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/db';
import type { Game, GameLogEntry } from '@/lib/types';

type Params = { params: Promise<{ gameCode: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { gameCode } = await params;

  const game = await queryOne<Game>(
    'SELECT id FROM games WHERE code = ?',
    gameCode.toUpperCase(),
  );

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  const entries = await queryAll<GameLogEntry>(
    'SELECT * FROM game_log WHERE game_id = ? ORDER BY created_at ASC',
    game.id,
  );

  return NextResponse.json(entries);
}
