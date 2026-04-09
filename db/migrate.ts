import db from '../lib/db';
import { ROLE_SEED } from '../lib/roles';

console.log('[migrate] Creating tables...');

db.exec(`
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
`);

// Add moderator_script_tl column if missing (for existing DBs)
try {
  db.exec('ALTER TABLE roles ADD COLUMN moderator_script_tl TEXT NOT NULL DEFAULT ""');
  console.log('[migrate] Added moderator_script_tl column.');
} catch {
  // Column already exists
}

console.log('[migrate] Tables created.');

// ─── Seed roles ──────────────────────────────────────────────
console.log(`[migrate] Seeding ${ROLE_SEED.length} roles...`);

const upsertRole = db.prepare(`
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
`);

const seedAll = db.transaction(() => {
  for (const role of ROLE_SEED) {
    upsertRole.run(
      role.name,
      role.team,
      role.set,
      role.night_wake_order,
      role.is_night_role,
      role.default_count,
      role.ability,
      role.moderator_script,
      role.moderator_script_tl,
    );
  }
});

seedAll();

const count = db.prepare('SELECT COUNT(*) as count FROM roles').get() as { count: number };
console.log(`[migrate] Done. ${count.count} roles in database.`);
