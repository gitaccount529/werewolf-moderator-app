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
  const pastInvestigations = await queryAll<{
    target_player_id: number;
    result: string;
    round: number;
  }>(
    `SELECT target_player_id, result, round FROM night_actions
     WHERE game_id = ? AND action_type IN ('seer_peek', 'mystic_wolf_peek')
     AND result IS NOT NULL`,
    game.id,
  );

  const investigations: Record<number, { result: SeerResult; round: number }> = {};
  for (const row of pastInvestigations) {
    // Latest round wins if investigated multiple times
    const existing = investigations[row.target_player_id];
    if (!existing || row.round > existing.round) {
      investigations[row.target_player_id] = {
        result: row.result as SeerResult,
        round: row.round,
      };
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

  const enrichment: PlayerEnrichment = {
    investigations,
    protectedIds,
    priestBlessedIds,
    sentinelShieldedIds,
    sandwichHolderIds,
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
