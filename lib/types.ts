// ─── Enums ───────────────────────────────────────────────────
export type GameStatus = 'lobby' | 'night' | 'day' | 'ended';
export type Team = 'village' | 'werewolf' | 'tanner' | 'vampire' | 'cult' | 'neutral';
export type RoleSet = 'deluxe' | 'extreme';
export type GameMode = 'classic' | 'one_night' | 'custom';
export type RevealMode = 'full' | 'no_night' | 'wolf_team_only' | 'team_only' | 'none';
export type VotingMode = 'standard' | 'closed_eyes' | 'big_brother' | 'elimination' | 'secret_ballot';
export type ItemType = 'ivory_tower' | 'charm' | 'sandwich' | 'gavel';
export type DeathCause =
  | 'werewolf'
  | 'lynch'
  | 'hunter'
  | 'witch'
  | 'bomber'
  | 'heartbreak'
  | 'vampire'
  | 'chupacabra'
  | 'dire_wolf'
  | 'bloody_mary'
  | 'cult'
  | 'other';

// ─── Database Row Types ──────────────────────────────────────
export interface Game {
  id: number;
  code: string;
  name: string;
  pin_hash: string;
  status: GameStatus;
  current_round: number;
  metadata_json: string;
  created_at: string;
}

export interface Player {
  id: number;
  game_id: number;
  name: string;
  socket_id: string | null;
  is_alive: number; // SQLite boolean: 0 or 1
  death_cause: DeathCause | null;
  death_round: number | null;
  seat_order: number;
  joined_at: string;
}

export interface Role {
  id: number;
  name: string;
  team: Team;
  set: RoleSet;
  night_wake_order: number; // 0 = does not wake
  is_night_role: number;    // SQLite boolean
  default_count: number;
  ability: string;
  moderator_script: string;
  moderator_script_tl: string;
}

export interface GameRole {
  id: number;
  game_id: number;
  role_id: number;
  count: number;
}

export interface PlayerRole {
  id: number;
  player_id: number;
  game_id: number;
  role_id: number;
}

export interface NightAction {
  id: number;
  game_id: number;
  round: number;
  role_id: number;
  actor_player_id: number;
  target_player_id: number | null;
  action_type: string;
  result: string | null;
  created_at: string;
}

export interface RoleTemplate {
  id: number;
  name: string;
  player_count: number;
  roles_json: string; // JSON array of {roleId, roleName, count}
  created_at: string;
}

export interface GameLogEntry {
  id: number;
  game_id: number;
  round: number;
  phase: string;
  event_type: string;
  description: string;
  details_json: string | null;
  created_at: string;
}

// ─── API / App Types ─────────────────────────────────────────
export interface PlayerWithRole extends Player {
  role_name?: string;
  role_team?: Team;
  role_ability?: string;
}

export interface GameState {
  game: Game;
  players: Player[];
  gameRoles: (GameRole & { role_name: string; role_team: Team })[];
}

export interface NightStep {
  role: Role;
  actors: Player[];
  order: number;
  nightOneOnly: boolean;
  isDead?: boolean;
}

// ─── Rule Variations ────────────────────────────────────────
export interface RuleVariations {
  reveal_mode?: RevealMode;
  voting_mode?: VotingMode;
  speed_mode?: boolean;
  muted_dead?: boolean;
  mayor_election?: boolean;
  mayor_player_id?: number | null;
  variable_roles?: boolean;
  // Legacy compat
  no_role_reveal?: boolean;
  closed_eyes_voting?: boolean;
}

export interface DeathRecord {
  playerId: number;
  playerName: string;
  cause: DeathCause;
  roleName?: string;
  roleTeam?: string;
}

export interface NightResolution {
  deaths: DeathRecord[];
  chainDeaths: DeathRecord[];
  announcements: string[];
  banished: number | null;
  silenced: number | null;
  gameOver: boolean;
  winningTeam: string | null;
  winReason: string | null;
  pendingHunterKill: boolean;
  pendingItemAssignment?: ItemType | null;
  firstDeathPlayerId?: number | null;
  firstDeathPlayerName?: string | null;
}

// ─── Night Step Enrichment (moderator-only) ──────────────────
export type SeerResult = 'wolf' | 'safe';

export interface PlayerEnrichment {
  /** Past seer/mystic wolf investigation results keyed by target player ID */
  investigations: Record<number, { result: SeerResult; round: number }>;
  /** Players protected by bodyguard THIS round */
  protectedIds: number[];
  /** Players blessed by priest (persists until consumed by a wolf attack) */
  priestBlessedIds: number[];
  /** Players shielded by sentinel (night 1 only) */
  sentinelShieldedIds: number[];
  /** Players holding an active (unused) sandwich item */
  sandwichHolderIds: number[];
  /** Players the Seer specifically investigated in prior rounds */
  seerChecked: Record<number, true>;
  /** Players the Mystic Wolf specifically investigated in prior rounds */
  mysticWolfChecked: Record<number, true>;
  /** True wolf/safe status for ALL alive players (moderator cheat sheet for Seer turn) */
  seerTruth: Record<number, SeerResult>;
  /** Wolf kill target this round (for Witch to know who to save) */
  wolfKillTargetId: number | null;
  /** Wolf kill target name (for display) */
  wolfKillTargetName: string | null;
  /** Whether witch has already used her save potion this game */
  witchSaveUsed: boolean;
  /** Whether witch has already used her kill potion this game */
  witchKillUsed: boolean;
}

export interface PlayerIndicator {
  seerResult?: SeerResult;
  alreadyInvestigated?: boolean;  // true if seer checked this player in a prior round
  isProtected?: boolean;
  protectionLabel?: string;
}
