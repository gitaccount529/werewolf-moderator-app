// Load .env.local before importing modules that read process.env.
// Next.js auto-loads env files at runtime, but standalone scripts run
// via `tsx db/migrate.ts` don't get that treatment. Node 20.6+ provides
// process.loadEnvFile() built-in.
//
// Static imports are hoisted, so we use dynamic imports inside main()
// to guarantee env vars are loaded BEFORE lib/db.ts is evaluated.
import { existsSync } from 'fs';
import { resolve } from 'path';
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const DDL = `
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    pin_hash TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'lobby' CHECK(status IN ('lobby','night','day','ended')),
    current_round INTEGER NOT NULL DEFAULT 0,
    metadata_json TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_games_code ON games(code);

  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    socket_id TEXT,
    is_alive INTEGER NOT NULL DEFAULT 1,
    death_cause TEXT,
    death_round INTEGER,
    seat_order INTEGER NOT NULL DEFAULT 0,
    joined_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_id);

  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    team TEXT NOT NULL,
    "set" TEXT NOT NULL,
    night_wake_order INTEGER NOT NULL DEFAULT 0,
    is_night_role INTEGER NOT NULL DEFAULT 0,
    default_count INTEGER NOT NULL DEFAULT 1,
    ability TEXT NOT NULL DEFAULT '',
    moderator_script TEXT NOT NULL DEFAULT '',
    moderator_script_tl TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS game_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id),
    count INTEGER NOT NULL DEFAULT 1,
    UNIQUE(game_id, role_id)
  );

  CREATE INDEX IF NOT EXISTS idx_game_roles_game ON game_roles(game_id);

  CREATE TABLE IF NOT EXISTS player_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id),
    UNIQUE(player_id, game_id)
  );

  CREATE INDEX IF NOT EXISTS idx_player_roles_game ON player_roles(game_id);

  CREATE TABLE IF NOT EXISTS night_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    round INTEGER NOT NULL,
    role_id INTEGER NOT NULL REFERENCES roles(id),
    actor_player_id INTEGER NOT NULL REFERENCES players(id),
    target_player_id INTEGER REFERENCES players(id),
    action_type TEXT NOT NULL,
    result TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_night_actions_game_round ON night_actions(game_id, round);

  CREATE TABLE IF NOT EXISTS game_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    round INTEGER NOT NULL DEFAULT 0,
    phase TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL,
    description TEXT NOT NULL,
    details_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_game_log_game ON game_log(game_id);

  CREATE TABLE IF NOT EXISTS role_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    player_count INTEGER NOT NULL,
    roles_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

async function main() {
  // Dynamic import AFTER env vars are loaded — lib/db.ts throws on import
  // if TURSO_DATABASE_URL is missing, so it must not be statically imported.
  const { client, transaction } = await import('../lib/db');
  const { ROLE_SEED } = await import('../lib/roles');

  console.log('[migrate] Creating tables...');

  // Split DDL into individual statements — libSQL's executeMultiple
  // doesn't handle some edge cases, so we run them one by one.
  const statements = DDL.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await client.execute(stmt);
  }

  // Backward-compat: add moderator_script_tl column if missing (for DBs
  // migrated before Tagalog script support was added).
  try {
    await client.execute(
      'ALTER TABLE roles ADD COLUMN moderator_script_tl TEXT NOT NULL DEFAULT ""',
    );
    console.log('[migrate] Added moderator_script_tl column.');
  } catch {
    // Column already exists — libSQL throws, we ignore.
  }

  console.log('[migrate] Tables created.');

  // ─── Seed roles ─────────────────────────────────────────────
  console.log(`[migrate] Seeding ${ROLE_SEED.length} roles...`);

  const upsertSql = `
    INSERT INTO roles (name, team, "set", night_wake_order, is_night_role, default_count, ability, moderator_script, moderator_script_tl)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      team = excluded.team,
      "set" = excluded."set",
      night_wake_order = excluded.night_wake_order,
      is_night_role = excluded.is_night_role,
      default_count = excluded.default_count,
      ability = excluded.ability,
      moderator_script = excluded.moderator_script,
      moderator_script_tl = excluded.moderator_script_tl
  `;

  await transaction(async (tx) => {
    for (const role of ROLE_SEED) {
      await tx.execute({
        sql: upsertSql,
        args: [
          role.name,
          role.team,
          role.set,
          role.night_wake_order,
          role.is_night_role,
          role.default_count,
          role.ability,
          role.moderator_script,
          role.moderator_script_tl,
        ],
      });
    }
  });

  const result = await client.execute('SELECT COUNT(*) as count FROM roles');
  const count = (result.rows[0] as unknown as { count: number }).count;
  console.log(`[migrate] Done. ${count} roles in database.`);
}

main().catch((err) => {
  console.error('[migrate] Failed:', err);
  process.exit(1);
});
