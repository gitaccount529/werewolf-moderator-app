import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll, run } from '@/lib/db';
import type { Game, NightAction } from '@/lib/types';

type Params = { params: Promise<{ gameCode: string }> };

// POST /api/games/[gameCode]/actions — Record a night action
export async function POST(request: NextRequest, { params }: Params) {
  const { gameCode } = await params;
  const body = await request.json();
  const { round, roleId, actorPlayerId, targetPlayerId, actionType, result } = body as {
    round: number;
    roleId: number;
    actorPlayerId: number;
    targetPlayerId?: number;
    actionType: string;
    result?: string;
  };

  if (!round || !roleId || !actorPlayerId || !actionType) {
    return NextResponse.json(
      { error: 'round, roleId, actorPlayerId, and actionType are required' },
      { status: 400 },
    );
  }

  const game = await queryOne<Game>(
    'SELECT id FROM games WHERE code = ?',
    gameCode.toUpperCase(),
  );

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  const insertResult = await run(
    `INSERT INTO night_actions (game_id, round, role_id, actor_player_id, target_player_id, action_type, result)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    game.id,
    round,
    roleId,
    actorPlayerId,
    targetPlayerId ?? null,
    actionType,
    result ?? null,
  );

  const actionId = Number(insertResult.lastInsertRowid);
  let seerResult: string | null = null;

  // Auto-compute seer investigation result by checking target's actual role
  if (['seer_peek', 'mystic_wolf_peek'].includes(actionType) && targetPlayerId && !result) {
    const targetRole = await queryOne<{ name: string; team: string }>(
      `SELECT r.name, r.team FROM player_roles pr
       JOIN roles r ON r.id = pr.role_id
       WHERE pr.player_id = ? AND pr.game_id = ?`,
      targetPlayerId,
      game.id,
    );

    if (targetRole) {
      // Lycan appears as wolf to the Seer (village team but detected as wolf)
      // Wolf Man appears as safe to the Seer (werewolf team but detected as villager)
      if (targetRole.name === 'Lycan') {
        seerResult = 'wolf';
      } else if (targetRole.name === 'Wolf Man') {
        seerResult = 'safe';
      } else {
        seerResult = targetRole.team === 'werewolf' ? 'wolf' : 'safe';
      }

      await run(
        'UPDATE night_actions SET result = ? WHERE rowid = ?',
        seerResult,
        actionId,
      );
    }
  }

  return NextResponse.json({
    id: actionId,
    success: true,
    seerResult,
  });
}

// GET /api/games/[gameCode]/actions?round=N — Get actions for a round
export async function GET(request: NextRequest, { params }: Params) {
  const { gameCode } = await params;
  const round = request.nextUrl.searchParams.get('round');

  const game = await queryOne<Game>(
    'SELECT id FROM games WHERE code = ?',
    gameCode.toUpperCase(),
  );

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  let actions: NightAction[];

  if (round) {
    actions = await queryAll<NightAction>(
      `SELECT na.*, r.name as role_name, p.name as actor_name, tp.name as target_name
       FROM night_actions na
       JOIN roles r ON na.role_id = r.id
       JOIN players p ON na.actor_player_id = p.id
       LEFT JOIN players tp ON na.target_player_id = tp.id
       WHERE na.game_id = ? AND na.round = ?
       ORDER BY na.created_at`,
      game.id,
      parseInt(round),
    );
  } else {
    actions = await queryAll<NightAction>(
      `SELECT na.*, r.name as role_name, p.name as actor_name, tp.name as target_name
       FROM night_actions na
       JOIN roles r ON na.role_id = r.id
       JOIN players p ON na.actor_player_id = p.id
       LEFT JOIN players tp ON na.target_player_id = tp.id
       WHERE na.game_id = ?
       ORDER BY na.round, na.created_at`,
      game.id,
    );
  }

  return NextResponse.json(actions);
}
