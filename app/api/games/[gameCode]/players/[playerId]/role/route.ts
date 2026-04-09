import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/db';
import type { Game, Role } from '@/lib/types';

type Params = { params: Promise<{ gameCode: string; playerId: string }> };

// GET /api/games/[gameCode]/players/[playerId]/role
export async function GET(_request: NextRequest, { params }: Params) {
  const { gameCode, playerId } = await params;

  const game = queryOne<Game>(
    'SELECT id FROM games WHERE code = ?',
    gameCode.toUpperCase(),
  );

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  const playerRole = queryOne<Role & { player_id: number }>(
    `SELECT r.*, pr.player_id
     FROM player_roles pr
     JOIN roles r ON r.id = pr.role_id
     WHERE pr.player_id = ? AND pr.game_id = ?`,
    parseInt(playerId),
    game.id,
  );

  if (!playerRole) {
    return NextResponse.json({ error: 'Role not yet assigned' }, { status: 404 });
  }

  // Extra info based on role
  let extraInfo: Record<string, unknown> = {};

  // Masons see each other
  if (playerRole.name === 'Mason') {
    const otherMasons = queryAll<{ name: string }>(
      `SELECT p.name FROM player_roles pr
       JOIN players p ON p.id = pr.player_id
       JOIN roles r ON r.id = pr.role_id
       WHERE pr.game_id = ? AND r.name = 'Mason' AND pr.player_id != ?`,
      game.id,
      parseInt(playerId),
    );
    extraInfo.masons = otherMasons.map((m) => m.name);
  }

  // Minion sees werewolves
  if (playerRole.name === 'Minion') {
    const wolves = queryAll<{ name: string }>(
      `SELECT p.name FROM player_roles pr
       JOIN players p ON p.id = pr.player_id
       JOIN roles r ON r.id = pr.role_id
       WHERE pr.game_id = ? AND r.team = 'werewolf' AND r.name != 'Minion'`,
      game.id,
    );
    extraInfo.werewolves = wolves.map((w) => w.name);
  }

  // Werewolves see each other
  if (playerRole.team === 'werewolf' && playerRole.name !== 'Minion') {
    const packMembers = queryAll<{ name: string }>(
      `SELECT p.name FROM player_roles pr
       JOIN players p ON p.id = pr.player_id
       JOIN roles r ON r.id = pr.role_id
       WHERE pr.game_id = ? AND r.team = 'werewolf' AND pr.player_id != ? AND r.name != 'Minion'`,
      game.id,
      parseInt(playerId),
    );
    extraInfo.pack = packMembers.map((m) => m.name);
  }

  // Vampires see each other
  if (playerRole.team === 'vampire') {
    const vampires = queryAll<{ name: string }>(
      `SELECT p.name FROM player_roles pr
       JOIN players p ON p.id = pr.player_id
       JOIN roles r ON r.id = pr.role_id
       WHERE pr.game_id = ? AND r.team = 'vampire' AND pr.player_id != ?`,
      game.id,
      parseInt(playerId),
    );
    extraInfo.vampires = vampires.map((v) => v.name);
  }

  return NextResponse.json({
    role: playerRole,
    extraInfo,
  });
}
