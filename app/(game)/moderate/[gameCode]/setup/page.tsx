'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { usePusher } from '@/hooks/usePusher';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import PlayerList from '@/components/PlayerList';
import RoleSelector from '@/components/RoleSelector';
import ConnectModal from '@/components/ConnectModal';
import type { Role, Player } from '@/lib/types';

interface RoleSelection {
  roleId: number;
  count: number;
}

interface TemplateInfo {
  id: number;
  name: string;
  player_count: number;
  roles_json: string;
}

type AssignMode = 'random' | 'manual';

export default function SetupPage() {
  const router = useRouter();
  const params = useParams();
  const gameCode = (params.gameCode as string).toUpperCase();
  const { subscribe } = usePusher();

  const [gameName, setGameName] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [selections, setSelections] = useState<RoleSelection[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [showConnect, setShowConnect] = useState(false);
  const [lang, setLang] = useState<'en' | 'tl'>(() => {
    if (typeof window !== 'undefined') {
      return (sessionStorage.getItem('lang') as 'en' | 'tl') || 'en';
    }
    return 'en';
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Template state
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // Assignment mode state
  const [assignMode, setAssignMode] = useState<AssignMode>('random');
  const [manualAssignments, setManualAssignments] = useState<Map<number, number>>(new Map());

  // Difficulty + Items
  type Difficulty = 'easy' | 'medium' | 'hard';
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [itemsEnabled, setItemsEnabled] = useState(false);

  // Subscribe to game channel for real-time updates
  useEffect(() => {
    return subscribe(`game-${gameCode}`, {
      'player:joined': () => {
        fetch(`/api/games/${gameCode}/players`)
          .then((r) => r.json())
          .then((data) => { if (Array.isArray(data)) setPlayers(data); });
      },
      'player:left': () => {
        fetch(`/api/games/${gameCode}/players`)
          .then((r) => r.json())
          .then((data) => { if (Array.isArray(data)) setPlayers(data); });
      },
    });
  }, [gameCode, subscribe]);

  // Fetch game data, roles, and templates
  useEffect(() => {
    async function load() {
      const [gameRes, rolesRes, templatesRes] = await Promise.all([
        fetch(`/api/games/${gameCode}`),
        fetch(`/api/games/${gameCode}/roles`),
        fetch('/api/templates'),
      ]);

      if (gameRes.ok) {
        const gameData = await gameRes.json();
        setGameName(gameData.game.name);
        setPlayers(gameData.players);

        // Hydrate items toggle from saved metadata
        try {
          const meta = JSON.parse(gameData.game.metadata_json || '{}');
          if (meta.items_enabled) setItemsEnabled(true);
        } catch { /* ignore parse errors */ }

        if (gameData.game.status !== 'lobby') {
          router.push(`/moderate/${gameCode}/night`);
          return;
        }
      }

      if (rolesRes.ok) {
        const rolesData = await rolesRes.json();
        setRoles(rolesData.roles);
        if (rolesData.selected.length > 0) {
          setSelections(
            rolesData.selected.map((s: { role_id: number; count: number }) => ({
              roleId: s.role_id,
              count: s.count,
            })),
          );
        }
      }

      if (templatesRes.ok) {
        setTemplates(await templatesRes.json());
      }
    }
    load();
  }, [gameCode, router]);

  // (Player tracking now handled by Pusher subscribe above + PlayerList polling)
  // Player updates now handled by: Pusher subscription above + PlayerList 5s polling

  // Save role selections
  const saveSelections = useCallback(
    async (newSelections: RoleSelection[]) => {
      setSelections(newSelections);
      await fetch(`/api/games/${gameCode}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: newSelections }),
      });
    },
    [gameCode],
  );

  // Quick setup presets
  type PresetName = 'basic' | 'regular' | 'classic' | 'deluxe' | 'recommended';

  function applyPreset(preset: PresetName) {
    const find = (name: string) => roles.find((r) => r.name === name);
    const wolfRole = find('Werewolf');
    const seerRole = find('Seer');
    const bodyguardRole = find('Bodyguard');
    const villagerRole = find('Villager');
    const witchRole = find('Witch');
    const hunterRole = find('Hunter');
    const tannerRole = find('Tanner');
    const minionRole = find('Minion');
    const sorceressRole = find('Sorceress');
    const dreamWolfRole = find('Dream Wolf');
    const alphaWolfRole = find('Alpha Wolf');

    if (!wolfRole || !villagerRole) return;

    const pc = players.length;
    let baseWolves = pc <= 8 ? 2 : pc <= 12 ? 3 : 4;
    const newSelections: RoleSelection[] = [];

    // Difficulty adjusts wolf count
    if (difficulty === 'easy' && baseWolves > 2 && pc >= 12) baseWolves--;
    if (difficulty === 'hard' && pc >= 8) baseWolves++;

    let filled = baseWolves;
    newSelections.push({ roleId: wolfRole.id, count: baseWolves });

    const add = (role: Role | undefined) => {
      if (role && filled < pc) { newSelections.push({ roleId: role.id, count: 1 }); filled++; }
    };

    if (preset === 'basic') {
      add(seerRole);
    } else if (preset === 'regular') {
      add(seerRole);
      add(witchRole);
    } else if (preset === 'classic') {
      add(seerRole);
      if (difficulty !== 'hard') add(bodyguardRole);
      add(hunterRole);
      add(witchRole);
      add(tannerRole);
      // Hard: add wolf-ally instead of bodyguard
      if (difficulty === 'hard') add(minionRole);
      // Easy: extra protection
      if (difficulty === 'easy') add(find('Beholder'));
    } else if (preset === 'deluxe') {
      add(seerRole);
      if (difficulty !== 'hard') add(bodyguardRole);
      add(witchRole);
      add(hunterRole);
      add(tannerRole);
      if (difficulty === 'hard') {
        add(minionRole);
        add(sorceressRole);
        if (filled < pc) add(dreamWolfRole);
      } else if (difficulty === 'easy') {
        add(find('Beholder'));
        add(find('Prince'));
      } else {
        add(minionRole);
      }
    } else if (preset === 'recommended') {
      // Official Ultimate Werewolf Extreme recommended table
      // Format: [plainWolves, specialWolves, wolfSupport, villageSupport, plainVillagers]
      // Based on the official rulebook composition chart
      const table: Record<number, [number, number, number, number, number]> = {
        5:  [1, 0, 0, 1, 3],
        6:  [1, 0, 0, 2, 3],
        7:  [1, 1, 0, 2, 3],
        8:  [2, 0, 0, 2, 4],
        9:  [2, 0, 0, 3, 4],
        10: [2, 1, 0, 3, 4],
        11: [2, 1, 0, 3, 5],
        12: [2, 1, 1, 3, 5],
        13: [3, 1, 0, 4, 5],
        14: [3, 1, 0, 4, 6],
        15: [3, 1, 1, 4, 6],
        16: [3, 1, 1, 5, 6],
        17: [3, 2, 1, 5, 6],
        18: [3, 2, 1, 5, 7],
        20: [4, 2, 1, 6, 7],
        23: [4, 3, 1, 7, 8],
        25: [5, 3, 1, 7, 9],
      };

      // Find closest matching player count
      const counts = Object.keys(table).map(Number).sort((a, b) => a - b);
      let key = counts[0];
      for (const c of counts) {
        if (c <= pc) key = c;
      }
      const [plainW, specialW, wolfSup, villageSup, plainV] = table[key];

      // Plain wolves
      newSelections.push({ roleId: wolfRole.id, count: plainW });
      filled += plainW;

      // Special wolves (Mystic Wolf, Alpha Wolf, etc.)
      const specialWolves = [find('Mystic Wolf'), find('Alpha Wolf'), find('Dire Wolf')];
      for (let i = 0; i < specialW && i < specialWolves.length; i++) {
        add(specialWolves[i]);
      }

      // Wolf support (Minion, Sorceress)
      const wolfSupRoles = [minionRole, sorceressRole];
      for (let i = 0; i < wolfSup && i < wolfSupRoles.length; i++) {
        add(wolfSupRoles[i]);
      }

      // Village support (Seer, Bodyguard, Witch, Hunter, etc.)
      const villageSupRoles = [seerRole, bodyguardRole, witchRole, hunterRole, find('Prince'), find('Beholder')];
      for (let i = 0; i < villageSup && i < villageSupRoles.length; i++) {
        add(villageSupRoles[i]);
      }

      // Adjust plain villagers to fill
      const remaining = pc - filled;
      if (remaining > 0) {
        newSelections.push({ roleId: villagerRole.id, count: remaining });
        filled += remaining;
      }
    }

    // Fill remainder with villagers (for non-recommended presets)
    if (pc - filled > 0) {
      newSelections.push({ roleId: villagerRole.id, count: pc - filled });
    }

    saveSelections(newSelections);
  }

  // ─── Template handlers ─────────────────────────────────────

  async function handleSaveTemplate() {
    if (!templateName.trim()) return;
    const roleDetails = selections.map((s) => {
      const role = roles.find((r) => r.id === s.roleId);
      return { roleId: s.roleId, roleName: role?.name ?? '', count: s.count };
    });

    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: templateName.trim(),
        playerCount: totalRoles,
        roles: roleDetails,
      }),
    });

    if (res.ok) {
      const templatesRes = await fetch('/api/templates');
      if (templatesRes.ok) setTemplates(await templatesRes.json());
      setShowSavePrompt(false);
      setTemplateName('');
    }
  }

  async function handleLoadTemplate(templateId: number) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    try {
      const parsed = JSON.parse(template.roles_json) as { roleId: number; count: number }[];
      const newSelections = parsed
        .filter((r) => roles.some((role) => role.id === r.roleId))
        .map((r) => ({ roleId: r.roleId, count: r.count }));
      saveSelections(newSelections);
    } catch {
      // Invalid JSON
    }
  }

  // ─── Assignment handlers ───────────────────────────────────

  // Build the expanded role pool for manual assignment
  const rolePool: { roleId: number; roleName: string; team: string }[] = [];
  for (const s of selections) {
    const role = roles.find((r) => r.id === s.roleId);
    if (role) {
      for (let i = 0; i < s.count; i++) {
        rolePool.push({ roleId: role.id, roleName: role.name, team: role.team });
      }
    }
  }

  function setManualRole(playerId: number, roleId: number | null) {
    setManualAssignments((prev) => {
      const next = new Map(prev);
      if (roleId === null) {
        next.delete(playerId);
      } else {
        next.set(playerId, roleId);
      }
      return next;
    });
  }

  // Count how many times each roleId is used in manual assignments
  function getRoleUsage(): Map<number, number> {
    const usage = new Map<number, number>();
    for (const roleId of manualAssignments.values()) {
      usage.set(roleId, (usage.get(roleId) ?? 0) + 1);
    }
    return usage;
  }

  // Available role instances for a given player's dropdown
  function getAvailableRolesForPlayer(playerId: number) {
    const usage = getRoleUsage();
    const currentRoleId = manualAssignments.get(playerId);

    // Group pool by roleId and count available slots
    const poolCounts = new Map<number, number>();
    for (const r of rolePool) {
      poolCounts.set(r.roleId, (poolCounts.get(r.roleId) ?? 0) + 1);
    }

    const available: { roleId: number; roleName: string; team: string }[] = [];
    const seen = new Set<number>();

    for (const r of rolePool) {
      if (seen.has(r.roleId)) continue;
      seen.add(r.roleId);

      const totalSlots = poolCounts.get(r.roleId) ?? 0;
      const usedSlots = usage.get(r.roleId) ?? 0;
      const freeSlots = totalSlots - usedSlots;

      // Available if there are free slots, or this player already has this role assigned
      if (freeSlots > 0 || currentRoleId === r.roleId) {
        available.push(r);
      }
    }

    return available;
  }

  const allManualAssigned = assignMode === 'manual' && manualAssignments.size === players.length;

  // Start game
  async function handleStart() {
    setLoading(true);
    setError('');

    try {
      // Save current selections first
      await fetch(`/api/games/${gameCode}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: selections }),
      });

      if (assignMode === 'manual') {
        // Manual assignment
        const assignments = players.map((p) => ({
          playerId: p.id,
          roleId: manualAssignments.get(p.id)!,
        }));

        const res = await fetch(`/api/games/${gameCode}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'manual_assign', assignments }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
      } else {
        // Random assignment
        const res = await fetch(`/api/games/${gameCode}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'assign_roles' }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
      }

      // Broadcast is now handled by the API route (assign_roles or manual_assign)
      // Go to role reveal screen before Night 1 starts
      router.push(`/moderate/${gameCode}/reveal`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start game');
    } finally {
      setLoading(false);
    }
  }

  async function handleKick(playerId: number) {
    await fetch(`/api/games/${gameCode}/players`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId }),
    });
    setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    setManualAssignments((prev) => {
      const next = new Map(prev);
      next.delete(playerId);
      return next;
    });
  }

  const totalRoles = selections.reduce((sum, s) => sum + s.count, 0);
  const rolesMatch = totalRoles === players.length;
  const canStart = rolesMatch && players.length >= 3 &&
    (assignMode === 'random' || allManualAssigned);

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          className="text-sm text-moon-dim hover:text-moon flex items-center gap-1 mb-2 transition-colors"
          onClick={() => router.push('/')}
        >
          ← Home
        </button>
        <h1 className="text-2xl font-bold text-gold">{gameName || 'Game Setup'}</h1>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-moon-dim text-sm">Game Code:</span>
          <span className="font-mono text-2xl text-gold tracking-[0.2em] font-bold">
            {gameCode}
          </span>
          <button
            className="ml-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-gold text-charcoal-dark hover:bg-gold-light transition-colors"
            onClick={() => setShowConnect(true)}
          >
            Share Link / QR
          </button>
          <button
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-charcoal-dark text-moon-dim hover:text-moon transition-colors"
            onClick={() => window.open('/roles', '_blank')}
          >
            View All Roles
          </button>
        </div>
        <div className="flex items-center gap-4 mt-2">
          <p className="text-moon-dim text-sm">
            Share this code with players to join
          </p>
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-xs text-moon-dim mr-1">Script:</span>
            {(['en', 'tl'] as const).map((l) => (
              <button
                key={l}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                  lang === l ? 'bg-gold text-charcoal-dark' : 'bg-charcoal-dark text-moon-dim hover:text-moon'
                }`}
                onClick={() => { setLang(l); sessionStorage.setItem('lang', l); }}
              >
                {l === 'en' ? 'EN' : 'TL'}
              </button>
            ))}
          </div>
        </div>

        {showConnect && (
          <ConnectModal gameCode={gameCode} onClose={() => setShowConnect(false)} />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Players column */}
        <Card className="md:col-span-1">
          <PlayerList
            gameCode={gameCode}
            showKick
            showManualAdd
            onKick={handleKick}
            onPlayerAdded={() => {
              fetch(`/api/games/${gameCode}/players`)
                .then((r) => r.json())
                .then((data) => { if (Array.isArray(data)) setPlayers(data); });
            }}
          />
        </Card>

        {/* Roles column */}
        <Card className="md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-moon">Select Roles</h3>
          </div>

          {/* Difficulty selector */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-moon-dim">Difficulty:</span>
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors capitalize ${
                  difficulty === d
                    ? d === 'easy' ? 'bg-forest-light text-white'
                    : d === 'hard' ? 'bg-blood-light text-white'
                    : 'bg-gold text-charcoal-dark'
                    : 'bg-charcoal text-moon-dim hover:text-moon'
                }`}
                onClick={() => setDifficulty(d)}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Preset buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            {([
              { name: 'basic' as PresetName, label: 'Basic', min: 3 },
              { name: 'regular' as PresetName, label: 'Regular', min: 4 },
              { name: 'classic' as PresetName, label: 'Classic', min: 5 },
              { name: 'deluxe' as PresetName, label: 'Deluxe', min: 8 },
              { name: 'recommended' as PresetName, label: 'Official', min: 5 },
            ]).map((p) => (
              <button
                key={p.name}
                className="text-xs px-3 py-1.5 rounded-md bg-charcoal text-moon-dim hover:text-moon transition-colors disabled:opacity-30"
                onClick={() => applyPreset(p.name)}
                disabled={players.length < p.min}
              >
                {p.label}
              </button>
            ))}
          </div>

          <RoleSelector
            roles={roles}
            selections={selections}
            onChange={saveSelections}
            playerCount={players.length}
            onSaveTemplate={() => setShowSavePrompt(true)}
            templates={templates}
            onSelectTemplate={handleLoadTemplate}
          />
        </Card>
      </div>

      {/* Game Options: Items */}
      {rolesMatch && players.length >= 3 && (
        <Card className="mt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-moon">Game Items</h3>
              <p className="text-xs text-moon-dim mt-1">
                First-death items: Sandwich (wolf kill), Charm (day lynch), Ivory Tower (first elimination)
              </p>
            </div>
            <button
              className={`relative w-12 h-6 rounded-full transition-colors ${
                itemsEnabled ? 'bg-gold' : 'bg-charcoal-dark'
              }`}
              onClick={() => {
                const newVal = !itemsEnabled;
                setItemsEnabled(newVal);
                fetch(`/api/games/${gameCode}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'update_metadata', metadata: { items_enabled: newVal } }),
                });
              }}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                itemsEnabled ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
        </Card>
      )}

      {/* Manual Assignment Panel */}
      {rolesMatch && players.length >= 3 && (
        <Card className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-moon">Assignment Mode</h3>
            <div className="flex gap-1">
              {(['random', 'manual'] as AssignMode[]).map((mode) => (
                <button
                  key={mode}
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors capitalize ${
                    assignMode === mode
                      ? 'bg-gold text-charcoal-dark'
                      : 'bg-charcoal-dark text-moon-dim hover:text-moon'
                  }`}
                  onClick={() => { setAssignMode(mode); setManualAssignments(new Map()); }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {assignMode === 'random' ? (
            <p className="text-sm text-moon-dim">
              Roles will be randomly shuffled and assigned to players.
            </p>
          ) : (
            <div>
              <p className="text-sm text-moon-dim mb-3">
                Assign a specific role to each player.
                {manualAssignments.size < players.length && (
                  <span className="text-blood-light ml-2">
                    ({players.length - manualAssignments.size} unassigned)
                  </span>
                )}
              </p>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {players.map((player) => {
                  const available = getAvailableRolesForPlayer(player.id);
                  const currentRoleId = manualAssignments.get(player.id);

                  return (
                    <div
                      key={player.id}
                      className="flex items-center gap-3 bg-charcoal/50 rounded-lg px-4 py-2.5"
                    >
                      <span className="text-moon font-medium w-28 truncate shrink-0">
                        {player.name}
                      </span>
                      <select
                        className="flex-1 bg-charcoal-dark text-moon rounded-lg px-3 py-2 text-sm min-h-[36px] border border-moon-dim/20 focus:outline-none focus:ring-1 focus:ring-gold/50"
                        value={currentRoleId ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setManualRole(player.id, val ? parseInt(val) : null);
                        }}
                      >
                        <option value="">— Select role —</option>
                        {available.map((r) => (
                          <option key={r.roleId} value={r.roleId}>
                            {r.roleName} ({r.team})
                          </option>
                        ))}
                      </select>
                      {currentRoleId && (
                        <span className="text-[10px] text-forest-light shrink-0">Assigned</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Save Template prompt (modal) */}
      {showSavePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowSavePrompt(false)}>
          <div className="bg-charcoal-light rounded-xl border border-moon-dim/20 p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gold mb-4">Save Template</h3>
            <input
              className="w-full min-h-[44px] px-4 py-2.5 rounded-lg bg-charcoal-dark border border-moon-dim/20 text-moon placeholder:text-moon-dim/50 focus:outline-none focus:ring-2 focus:ring-gold/50 mb-4"
              placeholder="Template name (e.g. Classic 6P)"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveTemplate()}
              autoFocus
            />
            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" onClick={handleSaveTemplate} disabled={!templateName.trim()}>
                Save
              </Button>
              <Button variant="ghost" onClick={() => setShowSavePrompt(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-charcoal-dark border-t border-moon-dim/10 p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="text-sm">
            <span className={rolesMatch ? 'text-forest-light' : 'text-blood-light'}>
              {totalRoles} roles / {players.length} players
            </span>
            {assignMode === 'manual' && rolesMatch && (
              <span className={`ml-3 ${allManualAssigned ? 'text-forest-light' : 'text-gold-dark'}`}>
                {assignMode === 'manual' ? `${manualAssignments.size}/${players.length} assigned` : ''}
              </span>
            )}
          </div>

          {error && <span className="text-sm text-blood-light">{error}</span>}

          <Button
            variant="primary"
            onClick={handleStart}
            loading={loading}
            disabled={!canStart}
          >
            {assignMode === 'manual' ? 'Start Game (Manual)' : 'Assign Roles & Start Game'}
          </Button>
        </div>
      </div>

      {/* Spacer for fixed action bar */}
      <div className="h-20" />
    </div>
  );
}
