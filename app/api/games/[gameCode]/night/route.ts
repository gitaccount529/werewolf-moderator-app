import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/db';
import { getNightSteps, resolveNight, resolveDeathChain } from '@/lib/game-logic';
import type { Game, PlayerEnrichment, SeerResult } from '@/lib/types';

type Params = { params: Promise<{ gameCode: string }> };

// GET /api/games/[gameCode]/night — Get night steps + enrichment for current round
export async function GET(_request: NextRequest, { params }: Params) {
  const { gameCode } = await params;

  const game = await queryOne<Game>(
    'SELECT * FROM games WHERE code = ?',
    gameCode.toUpperCase(),
  );

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  const steps = await getNightSteps(game.id, game.current_round);

  const stepsWithPlayers = steps.map((step) => ({
    role: step.role,
    actors: step.actors.map((a) => ({
      id: a.id,
      name: a.name,
      socketId: a.socket_id,
    })),
    order: step.order,
    nightOneOnly: step.nightOneOnly,
  }));

  // ─── Enrichment: past investigations ───────────────────────
  // Track which players were investigated by each peek role separately,
  // so "checked" only shows for the role currently acting.
  const pastInvestigations = await queryAll<{
    target_player_id: number;
    result: string;
    round: number;
    action_type: string;
  }>(
    `SELECT target_player_id, result, round, action_type FROM night_actions
     WHERE game_id = ? AND action_type IN ('seer_peek', 'mystic_wolf_peek')
     AND result IS NOT NULL`,
    game.id,
  );

  // All investigation results (for showing wolf/safe labels)
  const investigations: Record<number, { result: SeerResult; round: number }> = {};
  // Seer-only investigations (for "checked" indicator on Seer turn)
  const seerChecked: Record<number, true> = {};
  // Mystic Wolf-only investigations (for "checked" on Mystic Wolf turn)
  const mysticWolfChecked: Record<number, true> = {};

  for (const row of pastInvestigations) {
    const existing = investigations[row.target_player_id];
    if (!existing || row.round > existing.round) {
      investigations[row.target_player_id] = {
        result: row.result as SeerResult,
        round: row.round,
      };
    }
    // Only mark as "checked" if investigated in a PRIOR round (not current)
    if (row.round < game.current_round) {
      if (row.action_type === 'seer_peek') seerChecked[row.target_player_id] = true;
      if (row.action_type === 'mystic_wolf_peek') mysticWolfChecked[row.target_player_id] = true;
    }
  }

  // ─── Enrichment: current-round protections ─────────────────
  const currentProtections = await queryAll<{
    target_player_id: number;
    action_type: string;
  }>(
    `SELECT target_player_id, action_type FROM night_actions
     WHERE game_id = ? AND round = ? AND action_type IN ('bodyguard_protect', 'sentinel_shield')`,
    game.id,
    game.current_round,
  );

  const protectedIds: number[] = [];
  const sentinelShieldedIds: number[] = [];
  for (const row of currentProtections) {
    if (row.action_type === 'bodyguard_protect') protectedIds.push(row.target_player_id);
    if (row.action_type === 'sentinel_shield') sentinelShieldedIds.push(row.target_player_id);
  }

  // ─── Enrichment: metadata-based protections ────────────────
  const meta = JSON.parse(game.metadata_json || '{}');
  const priestBlessedIds: number[] = meta.priest_blessed || [];
  const sandwichHolderIds: number[] = (meta.items || [])
    .filter((i: { type: string; used: boolean }) => i.type === 'sandwich' && !i.used)
    .map((i: { holderPlayerId: number }) => i.holderPlayerId);

  // ─── Enrichment: seer truth for ALL alive players ───────────
  // The moderator sees wolf/safe labels on every player during the Seer's turn.
  // Accounts for Lycan (village but appears wolf) and Wolf Man (wolf but appears safe).
  const allPlayerRoles = await queryAll<{ player_id: number; role_name: string; team: string }>(
    `SELECT pr.player_id, r.name as role_name, r.team
     FROM player_roles pr
     JOIN roles r ON r.id = pr.role_id
     JOIN players p ON p.id = pr.player_id
     WHERE pr.game_id = ? AND p.is_alive = 1`,
    game.id,
  );
  const seerTruth: Record<number, 'wolf' | 'safe'> = {};
  for (const pr of allPlayerRoles) {
    if (pr.role_name === 'Lycan') {
      seerTruth[pr.player_id] = 'wolf'; // Lycan appears as wolf to Seer
    } else if (pr.role_name === 'Wolf Man') {
      seerTruth[pr.player_id] = 'safe'; // Wolf Man appears as safe to Seer
    } else {
      seerTruth[pr.player_id] = pr.team === 'werewolf' ? 'wolf' : 'safe';
    }
  }

  // ─── Enrichment: wolf kill target this round (for Witch) ────
  const wolfKillAction = await queryOne<{ target_player_id: number }>(
    `SELECT target_player_id FROM night_actions
     WHERE game_id = ? AND round = ? AND action_type = 'werewolf_kill'`,
    game.id,
    game.current_round,
  );
  let wolfKillTargetId: number | null = wolfKillAction?.target_player_id ?? null;
  let wolfKillTargetName: string | null = null;
  if (wolfKillTargetId) {
    const targetPlayer = await queryOne<{ name: string }>(
      'SELECT name FROM players WHERE id = ?',
      wolfKillTargetId,
    );
    wolfKillTargetName = targetPlayer?.name ?? null;
  }

  const enrichment: PlayerEnrichment = {
    investigations,
    seerChecked,
    mysticWolfChecked,
    protectedIds,
    priestBlessedIds,
    sentinelShieldedIds,
    sandwichHolderIds,
    seerTruth,
    wolfKillTargetId,
    wolfKillTargetName,
  };

  return NextResponse.json({
    round: game.current_round,
    steps: stepsWithPlayers,
    gameId: game.id,
    enrichment,
  });
}

// POST /api/games/[gameCode]/night — Resolve night
export async function POST(_request: NextRequest, { params }: Params) {
  const { gameCode } = await params;

  const game = await queryOne<Game>(
    'SELECT * FROM games WHERE code = ?',
    gameCode.toUpperCase(),
  );

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  // Run night resolution
  const result = await resolveNight(game.id, game.current_round);

  // Run death chain
  if (result.deaths.length > 0) {
    const chain = await resolveDeathChain(game.id, result.deaths, game.current_round);
    result.chainDeaths = chain.chainDeaths;
    result.pendingHunterKill = result.pendingHunterKill || chain.pendingHunterKill;
  }

  return NextResponse.json(result);
}
