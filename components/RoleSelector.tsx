'use client';

import { useState, useMemo } from 'react';
import type { Role, RoleSet, Team } from '@/lib/types';

interface RoleSelection {
  roleId: number;
  count: number;
}

interface RoleSelectorProps {
  roles: Role[];
  selections: RoleSelection[];
  onChange: (selections: RoleSelection[]) => void;
  playerCount: number;
  onSaveTemplate?: (selections: RoleSelection[]) => void;
  onLoadTemplate?: () => void;
  templates?: { id: number; name: string; player_count: number }[];
  onSelectTemplate?: (templateId: number) => void;
}

type SortMode = 'wake' | 'name';
type TeamFilter = 'all' | Team;

const teamBadge: Record<string, string> = {
  village: 'bg-team-village/20 text-team-village',
  werewolf: 'bg-team-werewolf/20 text-team-werewolf',
  tanner: 'bg-team-tanner/20 text-team-tanner',
  vampire: 'bg-team-vampire/20 text-team-vampire',
  cult: 'bg-team-cult/20 text-team-cult',
  neutral: 'bg-team-neutral/20 text-team-neutral',
};

const teamLabels: Record<TeamFilter, string> = {
  all: 'All',
  village: 'Village',
  werewolf: 'Wolf',
  tanner: 'Tanner',
  vampire: 'Vampire',
  cult: 'Cult',
  neutral: 'Neutral',
};

export default function RoleSelector({
  roles,
  selections,
  onChange,
  playerCount,
  onSaveTemplate,
  templates,
  onSelectTemplate,
}: RoleSelectorProps) {
  const [activeTab, setActiveTab] = useState<RoleSet>('deluxe');
  const [expandedRole, setExpandedRole] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('wake');
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('all');
  const [showTemplates, setShowTemplates] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selectionMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of selections) map.set(s.roleId, s.count);
    return map;
  }, [selections]);

  const totalSelected = useMemo(
    () => selections.reduce((sum, s) => sum + s.count, 0),
    [selections],
  );

  const rolesBySet = useMemo(() => {
    const grouped: Record<RoleSet, Role[]> = { deluxe: [], extreme: [] };
    for (const role of roles) {
      grouped[role.set as RoleSet]?.push(role);
    }
    return grouped;
  }, [roles]);

  // Teams present in current tab
  const teamsInTab = useMemo(() => {
    const teams = new Set<Team>();
    for (const role of (rolesBySet[activeTab] ?? [])) {
      teams.add(role.team as Team);
    }
    return teams;
  }, [rolesBySet, activeTab]);

  function updateCount(roleId: number, count: number) {
    const newSelections = selections.filter((s) => s.roleId !== roleId);
    if (count > 0) {
      newSelections.push({ roleId, count });
    }
    onChange(newSelections);
  }

  function getCount(roleId: number): number {
    return selectionMap.get(roleId) ?? 0;
  }

  // Filter and sort
  const displayedRoles = useMemo(() => {
    // When searching, search across ALL sets
    let list = searchQuery.trim()
      ? [...(rolesBySet.deluxe ?? []), ...(rolesBySet.extreme ?? [])]
      : rolesBySet[activeTab] ?? [];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.ability.toLowerCase().includes(q));
    }

    if (teamFilter !== 'all') {
      list = list.filter((r) => r.team === teamFilter);
    }

    if (sortMode === 'name') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }

    return list;
  }, [rolesBySet, activeTab, teamFilter, sortMode, searchQuery]);

  const countMatch = totalSelected === playerCount;
  const countDiff = totalSelected - playerCount;

  return (
    <div>
      {/* Set Tabs */}
      <div className="flex gap-1 mb-3">
        {(['deluxe', 'extreme'] as RoleSet[]).map((tab) => (
          <button
            key={tab}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize
              ${activeTab === tab
                ? 'bg-gold text-charcoal-dark'
                : 'text-moon-dim hover:text-moon hover:bg-white/5'
              }`}
            onClick={() => { setActiveTab(tab); setTeamFilter('all'); }}
          >
            {tab} ({rolesBySet[tab]?.length ?? 0})
          </button>
        ))}
      </div>

      {/* Team filter + Sort controls */}
      <div className="flex flex-wrap items-center gap-1 mb-3">
        {/* Team filters */}
        {(['all', ...Array.from(teamsInTab)] as TeamFilter[]).map((team) => (
          <button
            key={team}
            className={`text-[10px] px-2 py-1 rounded-md font-medium transition-colors
              ${teamFilter === team
                ? 'bg-gold text-charcoal-dark'
                : 'bg-charcoal-dark text-moon-dim hover:text-moon'
              }`}
            onClick={() => setTeamFilter(team)}
          >
            {teamLabels[team] || team}
          </button>
        ))}

        <span className="text-moon-dim/20 mx-0.5">|</span>

        {/* Sort toggle */}
        {(['wake', 'name'] as SortMode[]).map((mode) => (
          <button
            key={mode}
            className={`text-[10px] px-2 py-1 rounded-md font-medium transition-colors
              ${sortMode === mode
                ? 'bg-gold text-charcoal-dark'
                : 'bg-charcoal-dark text-moon-dim hover:text-moon'
              }`}
            onClick={() => setSortMode(mode)}
          >
            {mode === 'wake' ? 'Order' : 'A-Z'}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        className="w-full min-h-[36px] px-3 py-2 rounded-lg bg-charcoal-dark border border-moon-dim/20 text-moon text-sm placeholder:text-moon-dim/50 focus:outline-none focus:ring-1 focus:ring-gold/50 mb-3"
        placeholder="Search roles..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* Status bar */}
      <div
        className={`flex items-center justify-between rounded-lg px-4 py-2.5 mb-3 text-sm font-medium
          ${countMatch
            ? 'bg-forest/30 text-forest-light'
            : 'bg-blood/20 text-blood-light'
          }`}
      >
        <span>{totalSelected} role{totalSelected !== 1 ? 's' : ''} selected</span>
        <span>{playerCount} player{playerCount !== 1 ? 's' : ''} joined</span>
        {!countMatch && (
          <span>{countDiff > 0 ? `${countDiff} too many` : `Need ${Math.abs(countDiff)} more`}</span>
        )}
      </div>

      {/* Template buttons */}
      {(onSaveTemplate || templates) && (
        <div className="flex gap-2 mb-3">
          {onSaveTemplate && totalSelected > 0 && (
            <button
              className="text-xs px-3 py-1.5 rounded-md bg-charcoal-dark text-gold-dark hover:text-gold border border-gold-dark/30 transition-colors"
              onClick={() => onSaveTemplate(selections)}
            >
              Save Template
            </button>
          )}
          {templates && templates.length > 0 && (
            <div className="relative">
              <button
                className="text-xs px-3 py-1.5 rounded-md bg-charcoal-dark text-moon-dim hover:text-moon border border-moon-dim/20 transition-colors"
                onClick={() => setShowTemplates(!showTemplates)}
              >
                Load Template ({templates.length})
              </button>
              {showTemplates && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-charcoal-dark border border-moon-dim/20 rounded-lg shadow-xl z-20 py-1 max-h-48 overflow-y-auto">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      className="w-full text-left px-3 py-2 text-sm text-moon hover:bg-white/5 transition-colors"
                      onClick={() => {
                        onSelectTemplate?.(t.id);
                        setShowTemplates(false);
                      }}
                    >
                      <span className="font-medium">{t.name}</span>
                      <span className="text-xs text-moon-dim ml-2">{t.player_count}p</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Role grid */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {displayedRoles.map((role) => {
          const count = getCount(role.id);
          const isExpanded = expandedRole === role.id;

          return (
            <div
              key={role.id}
              className={`rounded-lg border transition-colors ${
                count > 0
                  ? 'border-gold/30 bg-charcoal'
                  : 'border-moon-dim/10 bg-charcoal/30'
              }`}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  className="flex-1 text-left flex items-center gap-2 min-w-0"
                  onClick={() => setExpandedRole(isExpanded ? null : role.id)}
                >
                  <span className="text-moon font-medium truncate">{role.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${teamBadge[role.team]}`}>
                    {role.team}
                  </span>
                  {role.is_night_role === 1 && (
                    <span className="text-[10px] text-gold-dark shrink-0">🌙</span>
                  )}
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    className="w-8 h-8 rounded-md bg-charcoal-dark text-moon-dim hover:text-moon flex items-center justify-center transition-colors disabled:opacity-30"
                    onClick={() => updateCount(role.id, Math.max(0, count - 1))}
                    disabled={count === 0}
                  >
                    -
                  </button>
                  <span className={`w-6 text-center font-mono ${count > 0 ? 'text-gold' : 'text-moon-dim'}`}>
                    {count}
                  </span>
                  <button
                    className="w-8 h-8 rounded-md bg-charcoal-dark text-moon-dim hover:text-moon flex items-center justify-center transition-colors"
                    onClick={() => updateCount(role.id, Math.min(5, count + 1))}
                  >
                    +
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="px-4 pb-3 text-sm text-moon-dim leading-relaxed border-t border-moon-dim/10 pt-2">
                  {role.ability}
                </div>
              )}
            </div>
          );
        })}
        {displayedRoles.length === 0 && (
          <p className="text-sm text-moon-dim/50 italic text-center py-4">
            No roles match this filter.
          </p>
        )}
      </div>
    </div>
  );
}
