'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import type { Role, Team, RoleSet } from '@/lib/types';

const teamColors: Record<Team, { bg: string; text: string; label: string }> = {
  village: { bg: 'bg-team-village/10', text: 'text-team-village', label: 'Village' },
  werewolf: { bg: 'bg-team-werewolf/10', text: 'text-team-werewolf', label: 'Werewolf' },
  tanner: { bg: 'bg-team-tanner/10', text: 'text-team-tanner', label: 'Tanner' },
  vampire: { bg: 'bg-team-vampire/10', text: 'text-team-vampire', label: 'Vampire' },
  cult: { bg: 'bg-team-cult/10', text: 'text-team-cult', label: 'Cult' },
  neutral: { bg: 'bg-team-neutral/10', text: 'text-team-neutral', label: 'Neutral' },
};

export default function RoleLibraryPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<Role[]>([]);
  const [search, setSearch] = useState('');
  const [activeSet, setActiveSet] = useState<RoleSet | 'all'>('all');

  useEffect(() => {
    fetch('/api/roles')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setRoles(data); });
  }, []);

  const filtered = useMemo(() => {
    let list = roles;
    if (activeSet !== 'all') {
      list = list.filter((r) => r.set === activeSet);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        r.ability.toLowerCase().includes(q) ||
        r.team.toLowerCase().includes(q),
      );
    }
    return list;
  }, [roles, activeSet, search]);

  // Group by team
  const grouped = useMemo(() => {
    const groups = new Map<Team, Role[]>();
    for (const role of filtered) {
      const team = role.team as Team;
      if (!groups.has(team)) groups.set(team, []);
      groups.get(team)!.push(role);
    }
    return groups;
  }, [filtered]);

  const teamOrder: Team[] = ['village', 'werewolf', 'tanner', 'vampire', 'cult', 'neutral'];

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <button
        className="text-sm text-moon-dim hover:text-moon flex items-center gap-1 mb-2 transition-colors"
        onClick={() => router.push('/')}
      >
        ← Home
      </button>
      <h1 className="text-3xl font-bold text-gold mb-1">Role Library</h1>
      <p className="text-moon-dim text-sm mb-6">
        All {roles.length} roles from Ultimate Werewolf Deluxe &amp; Extreme
      </p>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['all', 'deluxe', 'extreme'] as const).map((s) => (
          <button
            key={s}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors capitalize ${
              activeSet === s ? 'bg-gold text-charcoal-dark' : 'bg-charcoal-light text-moon-dim hover:text-moon'
            }`}
            onClick={() => setActiveSet(s)}
          >
            {s === 'all' ? `All (${roles.length})` : `${s} (${roles.filter((r) => r.set === s).length})`}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        className="w-full min-h-[44px] px-4 py-2.5 rounded-lg bg-charcoal-light border border-moon-dim/20 text-moon placeholder:text-moon-dim/50 focus:outline-none focus:ring-2 focus:ring-gold/50 mb-6"
        placeholder="Search roles by name, ability, or team..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Role list grouped by team */}
      {filtered.length === 0 ? (
        <p className="text-moon-dim/50 text-center py-8 italic">No roles match your search.</p>
      ) : (
        <div className="space-y-8">
          {teamOrder.map((team) => {
            const teamRoles = grouped.get(team);
            if (!teamRoles || teamRoles.length === 0) return null;
            const tc = teamColors[team];

            return (
              <div key={team}>
                <div className={`flex items-center gap-2 mb-3 px-2`}>
                  <span className={`text-sm font-semibold ${tc.text}`}>{tc.label}</span>
                  <span className="text-xs text-moon-dim">({teamRoles.length})</span>
                  <div className="flex-1 h-px bg-moon-dim/10" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {teamRoles.map((role) => (
                    <Card key={role.id} className={`${tc.bg} border-l-2 border-l-current ${tc.text}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-semibold text-moon">{role.name}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${tc.bg} ${tc.text}`}>
                              {role.set}
                            </span>
                            {role.is_night_role === 1 && (
                              <span className="text-[10px] text-gold-dark">
                                🌙 Night (order: {role.night_wake_order})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-moon-dim leading-relaxed">{role.ability}</p>
                      {role.moderator_script && (
                        <details className="mt-2">
                          <summary className="text-xs text-gold-dark cursor-pointer hover:text-gold">
                            Moderator script
                          </summary>
                          <p className="text-xs text-moon-dim/70 mt-1 italic leading-relaxed">
                            &quot;{role.moderator_script}&quot;
                          </p>
                        </details>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="h-8" />
    </div>
  );
}
