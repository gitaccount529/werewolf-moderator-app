import { queryAll, queryOne, run, transaction } from './db';
import type { Player, Role, NightAction, DeathRecord, NightResolution } from './types';

// ─── Night Steps ─────────────────────────────────────────────

export interface NightStepInfo {
  role: Role;
  actors: Player[];
  order: number;
  nightOneOnly: boolean;
}

// Roles that only wake on Night 1
const NIGHT_ONE_ONLY = new Set(['Sentinel', 'Priest', 'Cupid', 'Doppelganger', 'Hoodlum', 'Beholder']);

export async function getNightSteps(gameId: number, round: number): Promise<NightStepInfo[]> {
  // Get all roles in this game that have night actions
  const nightRoles = await queryAll<Role & { player_ids: string }>(
    `SELECT r.*, GROUP_CONCAT(p.id) as player_ids
     FROM game_roles gr
     JOIN roles r ON gr.role_id = r.id
     JOIN player_roles pr ON pr.role_id = r.id AND pr.game_id = gr.game_id
     JOIN players p ON p.id = pr.player_id AND p.is_alive = 1
     WHERE gr.game_id = ? AND r.night_wake_order > 0
     GROUP BY r.id
     ORDER BY r.night_wake_order ASC`,
    gameId,
  );

  const steps: NightStepInfo[] = [];

  for (const role of nightRoles) {
    // Skip Night-1-only roles on subsequent nights
    if (NIGHT_ONE_ONLY.has(role.name) && round > 1) continue;

    // Apprentice Seer only acts if Seer is dead
    if (role.name === 'Apprentice Seer') {
      const seerAlive = await queryOne<{ id: number }>(
        `SELECT p.id FROM player_roles pr
         JOIN players p ON p.id = pr.player_id
         JOIN roles r ON r.id = pr.role_id
         WHERE pr.game_id = ? AND r.name = 'Seer' AND p.is_alive = 1`,
        gameId,
      );
      if (seerAlive) continue; // Seer still alive, Apprentice doesn't wake
    }

    // Get alive actors for this role
    const playerIds = role.player_ids.split(',').map(Number);
    const actors = await queryAll<Player>(
      `SELECT * FROM players WHERE id IN (${playerIds.map(() => '?').join(',')}) AND is_alive = 1`,
      ...playerIds,
    );

    if (actors.length > 0) {
      steps.push({
        role,
        actors,
        order: role.night_wake_order,
        nightOneOnly: NIGHT_ONE_ONLY.has(role.name),
      });
    }
  }

  return steps;
}

// ─── Night Resolution ────────────────────────────────────────

export async function resolveNight(gameId: number, round: number): Promise<NightResolution> {
  const actions = await queryAll<NightAction & { role_name: string; actor_name: string; target_name: string }>(
    `SELECT na.*, r.name as role_name, p.name as actor_name, tp.name as target_name
     FROM night_actions na
     JOIN roles r ON na.role_id = r.id
     JOIN players p ON na.actor_player_id = p.id
     LEFT JOIN players tp ON na.target_player_id = tp.id
     WHERE na.game_id = ? AND na.round = ?`,
    gameId,
    round,
  );

  const deaths: DeathRecord[] = [];
  const announcements: string[] = [];
  let banished: number | null = null;
  let silenced: number | null = null;

  // Find wolf kill target
  const wolfKill = actions.find((a) => a.action_type === 'werewolf_kill');
  const loneWolfKill = actions.find((a) => a.action_type === 'lone_wolf_kill');
  const witchSave = actions.find((a) => a.action_type === 'witch_save');
  const witchKill = actions.find((a) => a.action_type === 'witch_kill');
  const bodyguardProtect = actions.find((a) => a.action_type === 'bodyguard_protect');
  const sentinelShield = actions.find((a) => a.action_type === 'sentinel_shield');

  // Process wolf kill
  if (wolfKill?.target_player_id) {
    const targetId = wolfKill.target_player_id;
    let protected_ = false;

    // Check sentinel shield (Night 1 only)
    if (sentinelShield?.target_player_id === targetId && round === 1) {
      protected_ = true;
      announcements.push('A player was protected by the Sentinel\'s shield.');
    }

    // Check bodyguard protection
    if (!protected_ && bodyguardProtect?.target_player_id === targetId) {
      protected_ = true;
      announcements.push('The Bodyguard protected someone from the werewolves.');
    }

    // Check witch save
    if (!protected_ && witchSave?.target_player_id === targetId) {
      protected_ = true;
      announcements.push('A mysterious potion saved someone from death.');
    }

    // Check Sandwich item protection
    if (!protected_) {
      const gameMeta = await queryOne<{ metadata_json: string }>('SELECT metadata_json FROM games WHERE id = ?', gameId);
      const meta = JSON.parse(gameMeta?.metadata_json || '{}');
      if (meta.items && Array.isArray(meta.items)) {
        const sandwich = meta.items.find(
          (item: { type: string; holderPlayerId: number; used: boolean }) =>
            item.type === 'sandwich' && item.holderPlayerId === targetId && !item.used,
        );
        if (sandwich) {
          protected_ = true;
          sandwich.used = true;
          await run('UPDATE games SET metadata_json = ? WHERE id = ?', JSON.stringify(meta), gameId);
          announcements.push('A mysterious sandwich saved someone from the wolves!');
        }
      }
    }

    if (!protected_) {
      const target = await queryOne<Player & { role_name: string }>(
        `SELECT p.*, r.name as role_name FROM players p
         JOIN player_roles pr ON pr.player_id = p.id AND pr.game_id = ?
         JOIN roles r ON r.id = pr.role_id
         WHERE p.id = ?`,
        gameId,
        targetId,
      );

      if (target) {
        // Special case: Tough Guy
        if (target.role_name === 'Tough Guy') {
          announcements.push(`${target.name} was attacked but survived... for now.`);
          // Mark as wounded via metadata
          await run(
            `UPDATE games SET metadata_json = json_set(COALESCE(metadata_json, '{}'), '$.wounded_${target.id}', ?)
             WHERE id = ?`,
            round,
            gameId,
          );
        }
        // Special case: Cursed — becomes werewolf instead of dying
        else if (target.role_name === 'Cursed') {
          const wolfRole = await queryOne<{ id: number }>('SELECT id FROM roles WHERE name = ?', 'Werewolf');
          if (wolfRole) {
            await run('UPDATE player_roles SET role_id = ? WHERE player_id = ? AND game_id = ?',
              wolfRole.id, targetId, gameId);
            announcements.push('Someone was cursed and transformed in the night...');
          }
        }
        // Normal kill
        else {
          deaths.push({
            playerId: target.id,
            playerName: target.name,
            cause: 'werewolf',
            roleName: target.role_name,
          });

          // Diseased effect
          if (target.role_name === 'Diseased') {
            await run(
              `UPDATE games SET metadata_json = json_set(COALESCE(metadata_json, '{}'), '$.wolves_skip_next', 1)
               WHERE id = ?`,
              gameId,
            );
            announcements.push('The werewolves feel sick after their meal...');
          }

          // Wolverine announcement
          if (target.role_name === 'Wolverine') {
            announcements.push('Claw marks were found at the scene — this was a werewolf attack.');
          }
        }
      }
    }
  }

  // Lone Wolf independent kill
  if (loneWolfKill?.target_player_id && loneWolfKill.target_player_id !== wolfKill?.target_player_id) {
    const targetId = loneWolfKill.target_player_id;
    let lwProtected = false;

    if (bodyguardProtect?.target_player_id === targetId) lwProtected = true;
    if (sentinelShield?.target_player_id === targetId && round === 1) lwProtected = true;

    if (!lwProtected) {
      const target = await queryOne<Player & { role_name: string }>(
        `SELECT p.*, r.name as role_name FROM players p
         JOIN player_roles pr ON pr.player_id = p.id AND pr.game_id = ?
         JOIN roles r ON r.id = pr.role_id
         WHERE p.id = ?`,
        gameId,
        targetId,
      );

      if (target && !deaths.find((d) => d.playerId === targetId)) {
        deaths.push({
          playerId: target.id,
          playerName: target.name,
          cause: 'werewolf',
          roleName: target.role_name,
        });
      }
    }
  }

  // Witch kill potion
  if (witchKill?.target_player_id) {
    const target = await queryOne<Player & { role_name: string }>(
      `SELECT p.*, r.name as role_name FROM players p
       JOIN player_roles pr ON pr.player_id = p.id AND pr.game_id = ?
       JOIN roles r ON r.id = pr.role_id
       WHERE p.id = ?`,
      gameId,
      witchKill.target_player_id,
    );

    if (target && !deaths.find((d) => d.playerId === target.id)) {
      deaths.push({
        playerId: target.id,
        playerName: target.name,
        cause: 'witch',
        roleName: target.role_name,
      });
    }
  }

  // Alpha Wolf conversion
  const alphaConvert = actions.find((a) => a.action_type === 'alpha_convert');
  if (alphaConvert?.target_player_id) {
    const wolfRole = await queryOne<{ id: number }>('SELECT id FROM roles WHERE name = ?', 'Werewolf');
    if (wolfRole) {
      await run('UPDATE player_roles SET role_id = ? WHERE player_id = ? AND game_id = ?',
        wolfRole.id, alphaConvert.target_player_id, gameId);
    }
  }

  // Cult leader recruitment
  const cultRecruit = actions.find((a) => a.action_type === 'cult_recruit');
  if (cultRecruit?.target_player_id) {
    // Store cult members in game metadata
    const game = await queryOne<{ metadata_json: string }>('SELECT metadata_json FROM games WHERE id = ?', gameId);
    const metadata = JSON.parse(game?.metadata_json || '{}');
    const cultMembers: number[] = metadata.cult_members || [];
    if (!cultMembers.includes(cultRecruit.target_player_id)) {
      cultMembers.push(cultRecruit.target_player_id);
      await run(
        `UPDATE games SET metadata_json = json_set(COALESCE(metadata_json, '{}'), '$.cult_members', json(?))
         WHERE id = ?`,
        JSON.stringify(cultMembers),
        gameId,
      );
    }
  }

  // Vampire bite
  const vampireBite = actions.find((a) => a.action_type === 'vampire_bite');
  if (vampireBite?.target_player_id) {
    // Check target is not a werewolf
    const targetRole = await queryOne<{ team: string }>(
      `SELECT r.team FROM player_roles pr
       JOIN roles r ON r.id = pr.role_id
       WHERE pr.player_id = ? AND pr.game_id = ?`,
      vampireBite.target_player_id,
      gameId,
    );
    if (targetRole && targetRole.team !== 'werewolf') {
      const vampireRole = await queryOne<{ id: number }>('SELECT id FROM roles WHERE name = ?', 'Vampire');
      if (vampireRole) {
        await run('UPDATE player_roles SET role_id = ? WHERE player_id = ? AND game_id = ?',
          vampireRole.id, vampireBite.target_player_id, gameId);
      }
    }
  }

  // Old Hag banishment
  const hagBanish = actions.find((a) => a.action_type === 'hag_banish');
  if (hagBanish?.target_player_id) {
    banished = hagBanish.target_player_id;
  }

  // Spellcaster silence
  const spellSilence = actions.find((a) => a.action_type === 'spell_silence');
  if (spellSilence?.target_player_id) {
    silenced = spellSilence.target_player_id;
  }

  // Apply deaths to database atomically
  await transaction(async (tx) => {
    for (const death of deaths) {
      await tx.execute({
        sql: 'UPDATE players SET is_alive = 0, death_cause = ?, death_round = ? WHERE id = ?',
        args: [death.cause, round, death.playerId],
      });

      await tx.execute({
        sql: `INSERT INTO game_log (game_id, round, phase, event_type, description, details_json)
              VALUES (?, ?, 'night', 'death', ?, ?)`,
        args: [gameId, round, `${death.playerName} was killed (${death.cause})`, JSON.stringify(death)],
      });
    }

    // Store banished/silenced in game metadata
    if (banished !== null || silenced !== null) {
      await tx.execute({
        sql: `UPDATE games SET metadata_json = json_set(COALESCE(metadata_json, '{}'), '$.banished', ?, '$.silenced', ?)
              WHERE id = ?`,
        args: [banished, silenced, gameId],
      });
    }
  });

  // Check win conditions
  const winResult = await checkWinCondition(gameId);

  // Check for first-death item assignment
  let pendingItemAssignment: 'ivory_tower' | 'charm' | 'sandwich' | 'gavel' | null = null;
  let firstDeathPlayerId: number | null = null;
  let firstDeathPlayerName: string | null = null;

  if (deaths.length > 0) {
    const gameMeta2 = await queryOne<{ metadata_json: string }>('SELECT metadata_json FROM games WHERE id = ?', gameId);
    const meta2 = JSON.parse(gameMeta2?.metadata_json || '{}');
    if (meta2.items_enabled && !meta2.first_night_death_occurred) {
      // First wolf-kill victim gets the Sandwich to give to someone
      const wolfDeath = deaths.find((d) => d.cause === 'werewolf');
      if (wolfDeath) {
        pendingItemAssignment = 'sandwich';
        firstDeathPlayerId = wolfDeath.playerId;
        firstDeathPlayerName = wolfDeath.playerName;
        meta2.first_night_death_occurred = true;
        await run('UPDATE games SET metadata_json = ? WHERE id = ?', JSON.stringify(meta2), gameId);
      }
    }
  }

  return {
    deaths,
    chainDeaths: [],
    announcements,
    banished,
    silenced,
    gameOver: winResult !== null,
    winningTeam: winResult?.team ?? null,
    winReason: winResult?.reason ?? null,
    pendingHunterKill: deaths.some((d) => d.roleName === 'Hunter'),
    pendingItemAssignment,
    firstDeathPlayerId,
    firstDeathPlayerName,
  };
}

// ─── Win Conditions ──────────────────────────────────────────

interface WinResult {
  team: string;
  reason: string;
}

export async function checkWinCondition(gameId: number): Promise<WinResult | null> {
  const alivePlayers = await queryAll<Player & { role_name: string; role_team: string }>(
    `SELECT p.*, r.name as role_name, r.team as role_team
     FROM players p
     JOIN player_roles pr ON pr.player_id = p.id AND pr.game_id = ?
     JOIN roles r ON r.id = pr.role_id
     WHERE p.game_id = ? AND p.is_alive = 1`,
    gameId,
    gameId,
  );

  if (alivePlayers.length === 0) {
    return { team: 'none', reason: 'Everyone is dead. Nobody wins.' };
  }

  const wolves = alivePlayers.filter((p) => p.role_team === 'werewolf');
  const nonWolves = alivePlayers.filter((p) => p.role_team !== 'werewolf');

  // All wolves eliminated
  if (wolves.length === 0) {
    // Check for vampire dominance
    const allVampires = alivePlayers.filter((p) => p.role_team === 'vampire');
    if (allVampires.length === alivePlayers.length) {
      return { team: 'vampire', reason: 'All surviving players are vampires. Vampires win!' };
    }
    return { team: 'village', reason: 'All werewolves have been eliminated. Village wins!' };
  }

  // Wolf parity
  if (wolves.length >= nonWolves.length) {
    return { team: 'werewolf', reason: 'Werewolves equal or outnumber the village. Werewolves win!' };
  }

  // Check cult dominance
  const game = await queryOne<{ metadata_json: string }>('SELECT metadata_json FROM games WHERE id = ?', gameId);
  const metadata = JSON.parse(game?.metadata_json || '{}');
  const cultMembers: number[] = metadata.cult_members || [];
  const cultLeader = alivePlayers.find((p) => p.role_name === 'Cult Leader');
  if (cultLeader) {
    const aliveCult = alivePlayers.filter((p) =>
      cultMembers.includes(p.id) || p.role_name === 'Cult Leader'
    );
    if (aliveCult.length === alivePlayers.length) {
      return { team: 'cult', reason: 'All surviving players are cult members. Cult Leader wins!' };
    }
  }

  // Vampire dominance
  const vampires = alivePlayers.filter((p) => p.role_team === 'vampire');
  if (vampires.length > 0 && vampires.length === alivePlayers.length) {
    return { team: 'vampire', reason: 'All surviving players are vampires. Vampires win!' };
  }

  return null; // Game continues
}

// ─── Death Chain ─────────────────────────────────────────────

export async function resolveDeathChain(
  gameId: number,
  initialDeaths: DeathRecord[],
  round: number,
): Promise<{ chainDeaths: DeathRecord[]; pendingHunterKill: boolean }> {
  const chainDeaths: DeathRecord[] = [];
  const processed = new Set<number>();
  const queue = [...initialDeaths];

  while (queue.length > 0) {
    const death = queue.shift()!;
    if (processed.has(death.playerId)) continue;
    processed.add(death.playerId);

    // Get the dead player's role
    const playerRole = await queryOne<{ role_name: string; role_team: string }>(
      `SELECT r.name as role_name, r.team as role_team
       FROM player_roles pr JOIN roles r ON r.id = pr.role_id
       WHERE pr.player_id = ? AND pr.game_id = ?`,
      death.playerId,
      gameId,
    );

    if (!playerRole) continue;

    // Mad Bomber: kills neighbors
    if (playerRole.role_name === 'Mad Bomber') {
      const neighbors = await getAliveNeighbors(death.playerId, gameId);
      for (const neighbor of neighbors) {
        if (!processed.has(neighbor.id)) {
          const neighborRole = await queryOne<{ name: string }>(
            `SELECT r.name FROM player_roles pr JOIN roles r ON r.id = pr.role_id
             WHERE pr.player_id = ? AND pr.game_id = ?`,
            neighbor.id,
            gameId,
          );
          const nd: DeathRecord = {
            playerId: neighbor.id,
            playerName: neighbor.name,
            cause: 'bomber',
            roleName: neighborRole?.name,
          };
          chainDeaths.push(nd);
          queue.push(nd);

          // Kill in DB
          await run('UPDATE players SET is_alive = 0, death_cause = ?, death_round = ? WHERE id = ?',
            'bomber', round, neighbor.id);
        }
      }
    }

    // Lovers: partner dies of heartbreak
    const game = await queryOne<{ metadata_json: string }>('SELECT metadata_json FROM games WHERE id = ?', gameId);
    const metadata = JSON.parse(game?.metadata_json || '{}');
    const lovers: number[] | undefined = metadata.lovers;
    if (lovers && lovers.includes(death.playerId)) {
      const partnerId = lovers.find((id: number) => id !== death.playerId);
      if (partnerId && !processed.has(partnerId)) {
        const partner = await queryOne<Player>('SELECT * FROM players WHERE id = ? AND is_alive = 1', partnerId);
        if (partner) {
          const partnerRole = await queryOne<{ name: string }>(
            `SELECT r.name FROM player_roles pr JOIN roles r ON r.id = pr.role_id
             WHERE pr.player_id = ? AND pr.game_id = ?`,
            partnerId,
            gameId,
          );
          const pd: DeathRecord = {
            playerId: partner.id,
            playerName: partner.name,
            cause: 'heartbreak',
            roleName: partnerRole?.name,
          };
          chainDeaths.push(pd);
          queue.push(pd);

          await run('UPDATE players SET is_alive = 0, death_cause = ?, death_round = ? WHERE id = ?',
            'heartbreak', round, partner.id);
        }
      }
    }

    // Dire Wolf bond
    const direWolfBond: number | undefined = metadata[`dire_wolf_bond_${death.playerId}`];
    if (playerRole.role_name === 'Dire Wolf' && direWolfBond && !processed.has(direWolfBond)) {
      const bonded = await queryOne<Player>('SELECT * FROM players WHERE id = ? AND is_alive = 1', direWolfBond);
      if (bonded) {
        const bondedRole = await queryOne<{ name: string }>(
          `SELECT r.name FROM player_roles pr JOIN roles r ON r.id = pr.role_id
           WHERE pr.player_id = ? AND pr.game_id = ?`,
          direWolfBond,
          gameId,
        );
        const bd: DeathRecord = {
          playerId: bonded.id,
          playerName: bonded.name,
          cause: 'dire_wolf',
          roleName: bondedRole?.name,
        };
        chainDeaths.push(bd);
        queue.push(bd);

        await run('UPDATE players SET is_alive = 0, death_cause = ?, death_round = ? WHERE id = ?',
          'dire_wolf', round, bonded.id);
      }
    }
  }

  // Log chain deaths
  for (const d of chainDeaths) {
    await run(
      `INSERT INTO game_log (game_id, round, phase, event_type, description, details_json)
       VALUES (?, ?, 'night', 'chain_death', ?, ?)`,
      gameId,
      round,
      `${d.playerName} died (${d.cause})`,
      JSON.stringify(d),
    );
  }

  const pendingHunterKill = [...initialDeaths, ...chainDeaths].some((d) => d.roleName === 'Hunter');

  return { chainDeaths, pendingHunterKill };
}

// ─── Helpers ─────────────────────────────────────────────────

async function getAliveNeighbors(playerId: number, gameId: number): Promise<Player[]> {
  // Get all players sorted by seat order
  const allPlayers = await queryAll<Player>(
    'SELECT * FROM players WHERE game_id = ? ORDER BY seat_order',
    gameId,
  );

  const playerIndex = allPlayers.findIndex((p) => p.id === playerId);
  if (playerIndex === -1) return [];

  const neighbors: Player[] = [];

  // Find left neighbor (alive, wrapping around)
  for (let i = 1; i < allPlayers.length; i++) {
    const idx = (playerIndex - i + allPlayers.length) % allPlayers.length;
    if (allPlayers[idx].is_alive === 1 && allPlayers[idx].id !== playerId) {
      neighbors.push(allPlayers[idx]);
      break;
    }
  }

  // Find right neighbor (alive, wrapping around)
  for (let i = 1; i < allPlayers.length; i++) {
    const idx = (playerIndex + i) % allPlayers.length;
    if (allPlayers[idx].is_alive === 1 && allPlayers[idx].id !== playerId) {
      // Don't add same player twice (possible in 3-player game)
      if (!neighbors.find((n) => n.id === allPlayers[idx].id)) {
        neighbors.push(allPlayers[idx]);
      }
      break;
    }
  }

  return neighbors;
}

// ─── Lynch Resolution ────────────────────────────────────────

export async function resolveLynch(
  gameId: number,
  targetPlayerId: number,
  round: number,
): Promise<{ death: DeathRecord | null; princeRevealed: boolean; tannerWin: boolean }> {
  const target = await queryOne<Player & { role_name: string; role_team: string }>(
    `SELECT p.*, r.name as role_name, r.team as role_team
     FROM players p
     JOIN player_roles pr ON pr.player_id = p.id AND pr.game_id = ?
     JOIN roles r ON r.id = pr.role_id
     WHERE p.id = ?`,
    gameId,
    targetPlayerId,
  );

  if (!target) return { death: null, princeRevealed: false, tannerWin: false };

  // Charm item protection (survives one daytime vote)
  const lynchMetaRow = await queryOne<{ metadata_json: string }>(
    'SELECT metadata_json FROM games WHERE id = ?',
    gameId,
  );
  const lynchMeta = JSON.parse(lynchMetaRow?.metadata_json || '{}');
  if (lynchMeta.items && Array.isArray(lynchMeta.items)) {
    const charm = lynchMeta.items.find(
      (item: { type: string; holderPlayerId: number; used: boolean }) =>
        item.type === 'charm' && item.holderPlayerId === targetPlayerId && !item.used,
    );
    if (charm) {
      charm.used = true;
      await run('UPDATE games SET metadata_json = ? WHERE id = ?', JSON.stringify(lynchMeta), gameId);
      await run(
        `INSERT INTO game_log (game_id, round, phase, event_type, description)
         VALUES (?, ?, 'day', 'charm_used', ?)`,
        gameId, round, `${target.name} used a Charm and survived the lynch!`,
      );
      return { death: null, princeRevealed: false, tannerWin: false };
    }
  }

  // Prince immunity
  if (target.role_name === 'Prince') {
    await run(
      `INSERT INTO game_log (game_id, round, phase, event_type, description)
       VALUES (?, ?, 'day', 'prince_reveal', ?)`,
      gameId,
      round,
      `${target.name} revealed as the Prince and survived the lynch!`,
    );
    return { death: null, princeRevealed: true, tannerWin: false };
  }

  // Kill the player
  await run(
    'UPDATE players SET is_alive = 0, death_cause = ?, death_round = ? WHERE id = ?',
    'lynch',
    round,
    targetPlayerId,
  );

  const death: DeathRecord = {
    playerId: target.id,
    playerName: target.name,
    cause: 'lynch',
    roleName: target.role_name,
  };

  await run(
    `INSERT INTO game_log (game_id, round, phase, event_type, description, details_json)
     VALUES (?, ?, 'day', 'lynch', ?, ?)`,
    gameId,
    round,
    `${target.name} was lynched by the village`,
    JSON.stringify(death),
  );

  // Tanner win check
  const tannerWin = target.role_name === 'Tanner';

  return { death, princeRevealed: false, tannerWin };
}
