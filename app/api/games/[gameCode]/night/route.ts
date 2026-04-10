import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getNightSteps, resolveNight, resolveDeathChain } from '@/lib/game-logic';
import type { Game } from '@/lib/types';

type Params = { params: Promise<{ gameCode: string }> };

// GET /api/games/[gameCode]/night — Get night steps for current round
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

  // For each step, include player info with socket_ids for targeting
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

  return NextResponse.json({
    round: game.current_round,
    steps: stepsWithPlayers,
    gameId: game.id,
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
