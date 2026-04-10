import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { resolveLynch, resolveDeathChain, checkWinCondition } from '@/lib/game-logic';
import type { Game } from '@/lib/types';

type Params = { params: Promise<{ gameCode: string }> };

// POST /api/games/[gameCode]/lynch — Execute a lynch
export async function POST(request: NextRequest, { params }: Params) {
  const { gameCode } = await params;
  const body = await request.json();
  const { targetPlayerId } = body as { targetPlayerId: number };

  const game = await queryOne<Game>(
    'SELECT * FROM games WHERE code = ?',
    gameCode.toUpperCase(),
  );

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  const result = await resolveLynch(game.id, targetPlayerId, game.current_round);

  let chainDeaths: { playerId: number; playerName: string; cause: string; roleName?: string }[] = [];
  let pendingHunterKill = false;
  let gameOver = false;
  let winningTeam: string | null = null;
  let winReason: string | null = null;

  if (result.death) {
    const chain = await resolveDeathChain(game.id, [result.death], game.current_round);
    chainDeaths = chain.chainDeaths as typeof chainDeaths;
    pendingHunterKill = chain.pendingHunterKill;
  }

  if (result.tannerWin) {
    gameOver = true;
    winningTeam = 'tanner';
    winReason = 'The Tanner was lynched and wins the game!';
  } else {
    const win = await checkWinCondition(game.id);
    if (win) {
      gameOver = true;
      winningTeam = win.team;
      winReason = win.reason;
    }
  }

  return NextResponse.json({
    ...result,
    chainDeaths,
    pendingHunterKill,
    gameOver,
    winningTeam,
    winReason,
  });
}
