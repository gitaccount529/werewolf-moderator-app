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

  const code = await createGameCode();
  const pinHash = pin ? hashPin(pin) : '';

  const newGameId = await transaction(async (tx) => {
    const result = await tx.execute({
      sql: 'INSERT INTO games (code, name, pin_hash) VALUES (?, ?, ?)',
      args: [code, name, pinHash],
    });
    // libSQL returns lastInsertRowid as bigint — convert to number for JSON safety.
    const gameId = Number(result.lastInsertRowid);

    // Store game mode in metadata
    if (gameMode) {
      await tx.execute({
        sql: `UPDATE games SET metadata_json = json_set(COALESCE(metadata_json, '{}'), '$.game_mode', ?) WHERE id = ?`,
        args: [gameMode, gameId],
      });
    }

    // Clone players and roles from an existing game
    if (copyFrom) {
      const sourceRes = await tx.execute({
        sql: 'SELECT id FROM games WHERE code = ?',
        args: [copyFrom.toUpperCase()],
      });
      const sourceGame = sourceRes.rows[0] as unknown as Game | undefined;

      if (sourceGame) {
        // Copy players (names only, reset everything else)
        const playersRes = await tx.execute({
          sql: 'SELECT name, seat_order FROM players WHERE game_id = ? ORDER BY seat_order',
          args: [sourceGame.id],
        });
        const sourcePlayers = playersRes.rows as unknown as Player[];
        for (const p of sourcePlayers) {
          await tx.execute({
            sql: 'INSERT INTO players (game_id, name, seat_order) VALUES (?, ?, ?)',
            args: [gameId, p.name, p.seat_order],
          });
        }

        // Copy role selections
        const rolesRes = await tx.execute({
          sql: 'SELECT role_id, count FROM game_roles WHERE game_id = ?',
          args: [sourceGame.id],
        });
        const sourceRoles = rolesRes.rows as unknown as GameRole[];
        for (const r of sourceRoles) {
          await tx.execute({
            sql: 'INSERT INTO game_roles (game_id, role_id, count) VALUES (?, ?, ?)',
            args: [gameId, r.role_id, r.count],
          });
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

  const game = await queryOne<Game>(
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
