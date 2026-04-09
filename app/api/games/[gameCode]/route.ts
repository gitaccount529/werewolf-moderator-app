import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll, run, transaction } from '@/lib/db';
import type { Game, Player, GameRole } from '@/lib/types';

type Params = { params: Promise<{ gameCode: string }> };

// GET /api/games/[gameCode] — Full game state
export async function GET(_request: NextRequest, { params }: Params) {
  const { gameCode } = await params;

  const game = queryOne<Game>(
    'SELECT id, code, name, status, current_round, metadata_json, created_at FROM games WHERE code = ?',
    gameCode.toUpperCase(),
  );

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  const players = queryAll<Player>(
    'SELECT * FROM players WHERE game_id = ? ORDER BY seat_order, joined_at',
    game.id,
  );

  const gameRoles = queryAll<GameRole & { role_name: string; role_team: string }>(
    `SELECT gr.*, r.name as role_name, r.team as role_team
     FROM game_roles gr JOIN roles r ON gr.role_id = r.id
     WHERE gr.game_id = ?`,
    game.id,
  );

  return NextResponse.json({ game, players, gameRoles });
}

// PATCH /api/games/[gameCode] — State transitions
export async function PATCH(request: NextRequest, { params }: Params) {
  const { gameCode } = await params;
  const body = await request.json();
  const { action, pin } = body as { action: string; pin?: string };

  const game = queryOne<Game>(
    'SELECT * FROM games WHERE code = ?',
    gameCode.toUpperCase(),
  );

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  switch (action) {
    case 'assign_roles': {
      if (game.status !== 'lobby') {
        return NextResponse.json({ error: 'Game is not in lobby' }, { status: 400 });
      }

      const players = queryAll<Player>(
        'SELECT * FROM players WHERE game_id = ? ORDER BY seat_order, joined_at',
        game.id,
      );

      const gameRoles = queryAll<{ role_id: number; count: number }>(
        'SELECT role_id, count FROM game_roles WHERE game_id = ?',
        game.id,
      );

      // Expand roles by count
      const rolePool: number[] = [];
      for (const gr of gameRoles) {
        for (let i = 0; i < gr.count; i++) {
          rolePool.push(gr.role_id);
        }
      }

      if (rolePool.length !== players.length) {
        return NextResponse.json(
          { error: `Role count (${rolePool.length}) does not match player count (${players.length})` },
          { status: 400 },
        );
      }

      // Fisher-Yates shuffle with crypto randomness
      const bytes = new Uint32Array(rolePool.length);
      crypto.getRandomValues(bytes);
      for (let i = rolePool.length - 1; i > 0; i--) {
        const j = bytes[i] % (i + 1);
        [rolePool[i], rolePool[j]] = [rolePool[j], rolePool[i]];
      }

      transaction(() => {
        // Assign roles
        for (let i = 0; i < players.length; i++) {
          run(
            'INSERT INTO player_roles (player_id, game_id, role_id) VALUES (?, ?, ?)',
            players[i].id,
            game.id,
            rolePool[i],
          );
          // Update seat order
          run('UPDATE players SET seat_order = ? WHERE id = ?', i, players[i].id);
        }

        // Transition to night, round 1
        run(
          'UPDATE games SET status = ?, current_round = 1 WHERE id = ?',
          'night',
          game.id,
        );

        // Log the event
        run(
          `INSERT INTO game_log (game_id, round, phase, event_type, description)
           VALUES (?, 1, 'setup', 'roles_assigned', 'Roles have been assigned to all players')`,
          game.id,
        );
      });

      return NextResponse.json({ success: true, status: 'night' });
    }

    case 'start_night': {
      if (game.status !== 'day') {
        return NextResponse.json({ error: 'Game is not in day phase' }, { status: 400 });
      }

      const newRound = game.current_round + 1;
      run(
        'UPDATE games SET status = ?, current_round = ? WHERE id = ?',
        'night',
        newRound,
        game.id,
      );

      run(
        `INSERT INTO game_log (game_id, round, phase, event_type, description)
         VALUES (?, ?, 'night', 'night_start', ?)`,
        game.id,
        newRound,
        `Night ${newRound} begins`,
      );

      return NextResponse.json({ success: true, status: 'night', round: newRound });
    }

    case 'start_day': {
      if (game.status !== 'night') {
        return NextResponse.json({ error: 'Game is not in night phase' }, { status: 400 });
      }

      run('UPDATE games SET status = ? WHERE id = ?', 'day', game.id);

      run(
        `INSERT INTO game_log (game_id, round, phase, event_type, description)
         VALUES (?, ?, 'day', 'day_start', ?)`,
        game.id,
        game.current_round,
        `Day ${game.current_round} begins`,
      );

      return NextResponse.json({ success: true, status: 'day' });
    }

    case 'end_game': {
      run('UPDATE games SET status = ? WHERE id = ?', 'ended', game.id);

      const reason = body.reason || 'Game ended by moderator';
      const winningTeam = body.winningTeam || null;

      run(
        `INSERT INTO game_log (game_id, round, phase, event_type, description, details_json)
         VALUES (?, ?, 'end', 'game_end', ?, ?)`,
        game.id,
        game.current_round,
        reason,
        winningTeam ? JSON.stringify({ winningTeam }) : null,
      );

      return NextResponse.json({ success: true, status: 'ended' });
    }

    case 'manual_assign': {
      if (game.status !== 'lobby') {
        return NextResponse.json({ error: 'Game is not in lobby' }, { status: 400 });
      }

      const assignments = body.assignments as { playerId: number; roleId: number }[] | undefined;
      if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
        return NextResponse.json({ error: 'assignments array is required' }, { status: 400 });
      }

      const allPlayers = queryAll<Player>(
        'SELECT * FROM players WHERE game_id = ? ORDER BY seat_order, joined_at',
        game.id,
      );

      if (assignments.length !== allPlayers.length) {
        return NextResponse.json(
          { error: `Assignment count (${assignments.length}) does not match player count (${allPlayers.length})` },
          { status: 400 },
        );
      }

      transaction(() => {
        for (let i = 0; i < assignments.length; i++) {
          const { playerId, roleId } = assignments[i];
          run(
            'INSERT INTO player_roles (player_id, game_id, role_id) VALUES (?, ?, ?)',
            playerId,
            game.id,
            roleId,
          );
          run('UPDATE players SET seat_order = ? WHERE id = ?', i, playerId);
        }

        run(
          'UPDATE games SET status = ?, current_round = 1 WHERE id = ?',
          'night',
          game.id,
        );

        run(
          `INSERT INTO game_log (game_id, round, phase, event_type, description)
           VALUES (?, 1, 'setup', 'roles_assigned', 'Roles have been manually assigned to all players')`,
          game.id,
        );
      });

      return NextResponse.json({ success: true, status: 'night' });
    }

    case 'update_metadata': {
      const metadata = body.metadata as Record<string, unknown> | undefined;
      if (!metadata) {
        return NextResponse.json({ error: 'metadata is required' }, { status: 400 });
      }
      const existing = JSON.parse((game as Game & { metadata_json?: string }).metadata_json || '{}');
      const merged = { ...existing, ...metadata };
      run('UPDATE games SET metadata_json = ? WHERE id = ?', JSON.stringify(merged), game.id);
      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
