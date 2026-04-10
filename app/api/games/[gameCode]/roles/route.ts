import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll, transaction } from '@/lib/db';
import type { Game, Role, GameRole } from '@/lib/types';

type Params = { params: Promise<{ gameCode: string }> };

// GET /api/games/[gameCode]/roles — All roles + current selections
export async function GET(_request: NextRequest, { params }: Params) {
  const { gameCode } = await params;

  const game = await queryOne<Game>(
    'SELECT id FROM games WHERE code = ?',
    gameCode.toUpperCase(),
  );

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  const allRoles = await queryAll<Role>(
    'SELECT * FROM roles ORDER BY "set", night_wake_order, name',
  );

  const selectedRoles = await queryAll<GameRole>(
    'SELECT * FROM game_roles WHERE game_id = ?',
    game.id,
  );

  return NextResponse.json({ roles: allRoles, selected: selectedRoles });
}

// POST /api/games/[gameCode]/roles — Set role selections
export async function POST(request: NextRequest, { params }: Params) {
  const { gameCode } = await params;
  const body = await request.json();
  const { roles } = body as { roles?: { roleId: number; count: number }[] };

  if (!roles || !Array.isArray(roles)) {
    return NextResponse.json({ error: 'Roles array is required' }, { status: 400 });
  }

  const game = await queryOne<Game>(
    'SELECT * FROM games WHERE code = ?',
    gameCode.toUpperCase(),
  );

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  if (game.status !== 'lobby') {
    return NextResponse.json({ error: 'Cannot modify roles after game has started' }, { status: 400 });
  }

  await transaction(async (tx) => {
    // Clear existing selections
    await tx.execute({
      sql: 'DELETE FROM game_roles WHERE game_id = ?',
      args: [game.id],
    });

    // Insert new selections
    for (const { roleId, count } of roles) {
      if (count > 0) {
        await tx.execute({
          sql: 'INSERT INTO game_roles (game_id, role_id, count) VALUES (?, ?, ?)',
          args: [game.id, roleId, count],
        });
      }
    }
  });

  const totalRoles = roles.reduce((sum, r) => sum + r.count, 0);

  return NextResponse.json({ success: true, totalRoles });
}
