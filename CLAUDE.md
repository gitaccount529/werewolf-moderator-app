# Ultimate Werewolf Moderator App

## Project Overview

Real-time Ultimate Werewolf game moderator web app. 55 roles from Deluxe + Extreme sets. Moderator controls the game from desktop/tablet, players join from their phones via QR code or game code. Deployed on Vercel with Turso (database) and Pusher (real-time).

- **GitHub**: https://github.com/gitaccount529/werewolf-moderator-app
- **Live URL**: https://werewolf-app-five.vercel.app
- **Version**: 2.0.0

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, TypeScript) |
| Database | Turso (libSQL) via `@libsql/client` — async, SQLite dialect |
| Real-time | Pusher Channels (server publishes via REST, clients subscribe via WebSocket) |
| Styling | Tailwind CSS v4 (CSS-first config with `@theme`) |
| QR Codes | `qrcode` package |
| Deploy | Vercel (serverless functions, no custom server) |

### Architecture Pattern
- **Database**: All queries async via `lib/db.ts` helpers (`queryAll`, `queryOne`, `run`, `transaction`)
- **Transaction style**: Option A — explicit `tx` handle passed to callback (`await transaction(async (tx) => { await tx.execute({sql, args}); })`)
- **Real-time**: Server broadcasts via `lib/realtime.ts` (`broadcast()` / `sendToPlayer()`), clients subscribe via `hooks/usePusher.ts`
- **No custom server**: Pure Next.js App Router. Socket.IO was removed during Vercel refactor.

## Environment Variables

```
TURSO_DATABASE_URL=libsql://...turso.io
TURSO_AUTH_TOKEN=eyJ...

PUSHER_APP_ID=...
PUSHER_KEY=...
PUSHER_SECRET=...
PUSHER_CLUSTER=...
NEXT_PUBLIC_PUSHER_KEY=...
NEXT_PUBLIC_PUSHER_CLUSTER=...
```

Stored in `.env.local` (local dev) and Vercel project settings (production).

## Commands

```bash
npm run dev        # next dev on :3000
npm run build      # next build
npm run start      # next start
npm run db:migrate # tsx db/migrate.ts (seeds 55 roles, creates all tables)
```

## Database Schema (SQLite/Turso)

**games**: id, code (4-char unique), name, pin_hash, status (lobby|night|day|ended), current_round, metadata_json, created_at
**players**: id, game_id, name, socket_id, is_alive (0|1), death_cause, death_round, seat_order, joined_at
**roles**: id, name (unique), team, set, night_wake_order, is_night_role, default_count, ability, moderator_script, moderator_script_tl
**game_roles**: game_id + role_id (unique), count
**player_roles**: player_id + game_id (unique), role_id
**night_actions**: game_id, round, role_id, actor_player_id, target_player_id, action_type, result, created_at
**game_log**: game_id, round, phase, event_type, description, details_json, created_at
**role_templates**: name, player_count, roles_json, created_at

## Key Files

### Core Logic
- `lib/db.ts` — Turso connection + async query helpers
- `lib/game-logic.ts` — Night resolution, death chains, win conditions, lynch resolution
- `lib/realtime.ts` — Pusher `broadcast()` and `sendToPlayer()`
- `lib/roles.ts` — 55 role definitions with abilities + moderator scripts (EN + Tagalog)
- `lib/types.ts` — All TypeScript interfaces (Game, Player, Role, NightResolution, PlayerEnrichment, etc.)
- `lib/game-code.ts` — 4-char code generator (excludes ambiguous chars)
- `lib/auth.ts` — SHA-256 PIN hashing

### Pages
- `app/page.tsx` — Home (create game, join game, role library link, kicked banner)
- `app/roles/page.tsx` — Role Library (browse all 55 roles by set/team)
- `app/(game)/moderate/[gameCode]/setup/page.tsx` — Moderator setup (players, roles, presets, difficulty, items, manual assign)
- `app/(game)/moderate/[gameCode]/reveal/page.tsx` — Role reveal before Night 1 (all players + roles by team)
- `app/(game)/moderate/[gameCode]/night/page.tsx` — Night phase wizard (step-by-step role actions, seer indicators, wolf target for witch)
- `app/(game)/moderate/[gameCode]/day/page.tsx` — Day phase (deaths, timer, nominations, voting, lynch)
- `app/(game)/play/[gameCode]/page.tsx` — Player view (join form, lobby, role reveal, night sleep/wake, day, voting, dead, game over, test mode)

### Components
- `components/NightStep.tsx` — Night role action UI with PlayerGrid indicators (seer truth, protection shields)
- `components/PlayerList.tsx` — Real-time player list with polling + Pusher, manual add, kick with confirm
- `components/RoleSelector.tsx` — Role selection grid with team filters, search, sort, templates
- `components/VotePanel.tsx` — Day voting with nominees, manual vote recording, confirm dialog
- `components/Timer.tsx` — Configurable countdown with auto-decrease per round
- `components/ConnectModal.tsx` — QR code + copy link modal
- `components/GameLog.tsx` — Chronological event log (mobile bottom sheet)
- `components/BuildFooter.tsx` — Auto-updating version: v2.0.0 + commit hash + build time
- `components/PusherProvider.tsx` — Wraps game pages with Pusher context
- `components/RoleCard.tsx` — Role display card (name, team badge, ability)
- `components/ui/` — Button, Card, Input, ConfirmDialog

## API Routes

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/games` | POST, GET | Create game (with clone), lookup by code |
| `/api/games/[gameCode]` | GET, PATCH | Full game state; state transitions (assign_roles, manual_assign, start_night, start_day, end_game, update_metadata) |
| `/api/games/[gameCode]/players` | GET, POST, DELETE | List, add, kick players |
| `/api/games/[gameCode]/players/[playerId]/role` | GET | Player's assigned role + team info (masons, pack, etc.) |
| `/api/games/[gameCode]/roles` | GET, POST | Available roles + selections; set role selections |
| `/api/games/[gameCode]/actions` | GET, POST | Night actions (auto-computes seer result with Lycan/Wolf Man handling) |
| `/api/games/[gameCode]/night` | GET, POST | Night steps + enrichment (seer truth, protections, wolf target); resolve night |
| `/api/games/[gameCode]/night/signal` | POST | Send wake/sleep Pusher events to specific players |
| `/api/games/[gameCode]/lynch` | POST | Execute lynch + death chain + win check |
| `/api/games/[gameCode]/log` | GET | Game event log |
| `/api/roles` | GET | All 55 role definitions |
| `/api/templates` | GET, POST, DELETE | Role composition templates |

## Commit History

```
817db61 Fix: only show 'checked' for prior round investigations
2b93af5 Fix: 'checked' indicator only shows for the role that investigated
4228604 Seer cheat sheet: show wolf/safe for ALL players on Seer turn
a76437d Fix 4 critical gameplay bugs
9629887 Add moderator night indicators: seer results + protection status
aab44fc Fix kick detection + add Leave Game button
6ab513a Add build version footer with auto-updating commit hash + timestamp
9191788 Add kick redirect: kicked players return to home with message
df42b58 Fix QR code join: show name input when player arrives via direct link
52ebd51 Refactor for Vercel: replace SQLite with Turso, Socket.IO with Pusher
3d46033 Initial commit: Ultimate Werewolf moderator app
```

---

## Feature Status

### Completed (Deployed)
- [x] Game creation with optional PIN, game modes (Classic/One Night/Custom)
- [x] QR code + direct link joining with inline name form
- [x] 55 roles (Deluxe + Extreme) with EN + Tagalog moderator scripts
- [x] Role selector with team filters, search, sort (A-Z / wake order)
- [x] 5 presets (Basic, Regular, Classic, Deluxe, Official) + difficulty (Easy/Medium/Hard)
- [x] Role composition templates (save/load)
- [x] Manual role assignment mode (per-player dropdowns)
- [x] Role reveal screen before Night 1 (grouped by team, tap for individual reveal)
- [x] Night phase step-by-step wizard with correct wake order
- [x] Seer cheat sheet: wolf/safe labels on ALL players during Seer turn
- [x] Seer result flash banner after confirm ("X is WOLF/SAFE" with thumbs instruction)
- [x] "Checked" indicator for previously investigated players (role-specific, prior rounds only)
- [x] Wolf kill target shown to Witch ("The werewolves targeted: X")
- [x] Protection indicators (Bodyguard, Priest, Sentinel, Sandwich) during kill roles
- [x] Priest blessing action recording + metadata persistence
- [x] Night resolution: protections, Tough Guy, Cursed, Diseased, Wolverine
- [x] Death chains: Hunter, Mad Bomber, Lovers, Dire Wolf
- [x] Day phase: death announcements, discussion timer (auto-decreasing), nominations, voting
- [x] Lynch resolution: Prince immunity, Charm item, Tanner win
- [x] Win conditions: Village, Werewolf, Vampire, Cult, Tanner, Lovers
- [x] First-death items system (Sandwich, Charm, Ivory Tower) with toggle
- [x] Game items toggle persistence (hydrated from metadata on reload)
- [x] Play Again (Same Party) on Game Over screens
- [x] Player kick with confirm dialog + redirect to home with message
- [x] Player Leave Game button (removes from DB, updates moderator)
- [x] Player polling fallback (5s interval catches missed Pusher events)
- [x] Socket reconnection auto-rejoin (via lastJoinRef in usePusher)
- [x] Game Log (collapsible, filterable by round, mobile bottom sheet)
- [x] Role Library page (/roles) with search, set/team grouping
- [x] Build version footer (auto-updating commit hash + timestamp)
- [x] Test mode (code 6969): phase buttons, game over variants, mock data
- [x] Back to Home button on setup page
- [x] Language toggle (EN/TL) for moderator scripts
- [x] Confirm dialogs on destructive actions (kick, close voting)
- [x] Vercel deployment with Turso + Pusher

### Known Issues / Partially Working
- [ ] Timer sync to player devices (deferred — polling handles phase transitions but not live countdown)
- [ ] Player-side voting via Pusher (deferred — moderator records votes manually)
- [ ] One Night mode (UI exists but treated as Classic — "Coming Soon")
- [ ] Gavel item (Judge variant — requires Judge election flow, deferred)
- [ ] Wolf Cub double-kill trigger (role exists but death trigger not implemented in resolveNight)
- [ ] Huntress one-time kill (role exists but action not implemented in NightStep)
- [ ] Troublemaker double-elimination (role exists but nod action not implemented)
- [ ] Ghost one-letter clue system (role exists but post-death action not implemented)
- [ ] Doppelganger role copy mechanics (role exists but copy logic not implemented)
- [ ] Old Woman banishment variant (role exists in seed but custom mechanics not implemented)

### Potential Improvements
- [ ] Drag-to-reorder seating arrangement
- [ ] Sound effects / vibration on phone wake-up
- [ ] Spectator mode for eliminated players (see game events)
- [ ] Multi-game tournament tracking
- [ ] Custom role creation UI
- [ ] PWA (installable app with offline role reference)
- [ ] Dark/light theme toggle
- [ ] Game replay / history viewer
- [ ] Admin dashboard for managing multiple games

---

## Important Patterns

### metadata_json usage
The `games.metadata_json` column stores transient game state as a JSON blob:
- `items_enabled`: boolean
- `items`: array of `{ type, holderPlayerId, used }`
- `lovers`: [playerId, playerId]
- `cult_members`: [playerIds]
- `dire_wolf_bond_{playerId}`: bonded partner id
- `wolves_skip_next`: 1 (from Diseased)
- `wounded_{playerId}`: round number (from Tough Guy)
- `banished` / `silenced`: player ids (from Old Hag / Spellcaster)
- `priest_blessed`: [playerIds]
- `game_mode`: 'classic' | 'one_night' | 'custom'
- `first_night_death_occurred`: boolean (for items)

### Night wake order (ascending)
5-Sentinel, 6-Priest, 10-Doppelganger, 15-Cupid, 20-Cult Leader, 25-Vampires, 30-Leprechaun, 35-Thing, 38-Old Hag, 40-Spellcaster, 45-Bodyguard, 47-Beholder, 48-Apprentice Seer, 49-Aura Seer, 50-Seer, 52-Sorceress, 55-PI, 58-Mystic Wolf, 60-Alpha Wolf, 62-Lone Wolf, 64-Dire Wolf, 65-Fruit Brute, 70-Werewolves+Wolf Cub, 75-Witch, 76-Huntress, 78-Insomniac, 79-Troublemaker, 80-Revealer, 85-Nostradamus, 90-Tough Guy

### Seer result computation
Seer sees wolf/safe based on `player_roles.team`, with two exceptions:
- **Lycan** (village team) → appears as `wolf` to Seer
- **Wolf Man** (werewolf team) → appears as `safe` to Seer
