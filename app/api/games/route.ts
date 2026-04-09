import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll, run, transaction } from '@/lib/db';
import { createGameCode } from '@/lib/game-code';
import { hashPin } from '@/lib/auth';
import type { Game, Player, GameRole } from '@/lib/types';

// POST /api/games — Create a new game (optionally clone from existing)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, pin, copyFrom, gameMode } = body as { name?: string; pin?: string; copyFrom?: string; gameMode?: string };

  if (!name) {
    return NextResponse.json(
      { error: 'Game name is required' },
      { status: 400 },
    );
  }

  if (pin && pin.length !== 4) {
    return NextResponse.json(
      { error: 'PIN must be exactly 4 digits' },
      { status: 400 },
    );
  }

  const code = createGameCode();
  const pinHash = pin ? hashPin(pin) : '';

  const newGameId = transaction(() => {
    const result = run(
      'INSERT INTO games (code, name, pin_hash) VALUES (?, ?, ?)',
      code,
      name,
      pinHash,
    );
    const gameId = result.lastInsertRowid as number;

    // Store game mode in metadata
    if (gameMode) {
      run(
        `UPDATE games SET metadata_json = json_set(COALESCE(metadata_json, '{}'), '$.game_mode', ?) WHERE id = ?`,
        gameMode,
        gameId,
      );
    }

    // Clone players and roles from an existing game
    if (copyFrom) {
      const sourceGame = queryOne<Game>(
        'SELECT id FROM games WHERE code = ?',
        copyFrom.toUpperCase(),
      );

      if (sourceGame) {
        // Copy players (names only, reset everything else)
        const sourcePlayers = queryAll<Player>(
          'SELECT name, seat_order FROM players WHERE game_id = ? ORDER BY seat_order',
          sourceGame.id,
        );
        for (const p of sourcePlayers) {
          run(
            'INSERT INTO players (game_id, name, seat_order) VALUES (?, ?, ?)',
            gameId,
            p.name,
            p.seat_order,
          );
        }

        // Copy role selections
        const sourceRoles = queryAll<GameRole>(
          'SELECT role_id, count FROM game_roles WHERE game_id = ?',
          sourceGame.id,
        );
        for (const r of sourceRoles) {
          run(
            'INSERT INTO game_roles (game_id, role_id, count) VALUES (?, ?, ?)',
            gameId,
            r.role_id,
            r.count,
          );
        }
      }
    }

    return gameId;
  });

  return NextResponse.json({
    id: newGameId,
    code,
    name,
  });
}

// GET /api/games?code=XXXX — Look up a game by code
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.json(
      { error: 'Game code is required' },
      { status: 400 },
    );
  }

  const game = queryOne<Game>(
    'SELECT id, code, name, status, current_round, created_at FROM games WHERE code = ?',
    code.toUpperCase(),
  );

  if (!game) {
    return NextResponse.json(
      { error: 'Game not found' },
      { status: 404 },
    );
  }

  return NextResponse.json(game);
}
