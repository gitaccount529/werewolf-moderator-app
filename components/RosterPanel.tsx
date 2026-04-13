'use client';

import { useState, useEffect } from 'react';

interface PlayerRole {
  id: number;
  name: string;
  roleName: string;
  roleTeam: string;
  isAlive: boolean;
}

const TEAM_ORDER: Record<string, number> = {
  werewolf: 0,
  village: 1,
  tanner: 2,
  vampire: 3,
  cult: 4,
  neutral: 5,
};

const TEAM_COLORS: Record<string, string> = {
  werewolf: 'text-blood-light',
  village: 'text-forest-light',
  tanner: 'text-gold',
  vampire: 'text-purple-400',
  cult: 'text-purple-400',
  neutral: 'text-moon-dim',
};

const TEAM_BG: Record<string, string> = {
  werewolf: 'bg-blood/10 border-blood/20',
  village: 'bg-forest/10 border-forest/20',
  tanner: 'bg-gold/10 border-gold/20',
  vampire: 'bg-purple-500/10 border-purple-500/20',
  cult: 'bg-purple-500/10 border-purple-500/20',
  neutral: 'bg-charcoal border-moon-dim/10',
};

interface RosterPanelProps {
  gameCode: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function RosterPanel({ gameCode, isOpen, onClose }: RosterPanelProps) {
  const [players, setPlayers] = useState<PlayerRole[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    (async () => {
      const res = await fetch(`/api/games/${gameCode}`);
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();

      const roster: PlayerRole[] = [];
      for (const p of data.players) {
        const roleRes = await fetch(`/api/games/${gameCode}/players/${p.id}/role`);
        if (roleRes.ok) {
          const roleData = await roleRes.json();
          roster.push({
            id: p.id,
            name: p.name,
            roleName: roleData.role?.name || 'Unassigned',
            roleTeam: roleData.role?.team || 'neutral',
            isAlive: p.is_alive === 1,
          });
        }
      }

      roster.sort((a, b) => {
        const teamDiff = (TEAM_ORDER[a.roleTeam] ?? 99) - (TEAM_ORDER[b.roleTeam] ?? 99);
        if (teamDiff !== 0) return teamDiff;
        return a.roleName.localeCompare(b.roleName);
      });

      setPlayers(roster);
      setLoading(false);
    })();
  }, [isOpen, gameCode]);

  // Group players by team
  const teams = players.reduce<Record<string, PlayerRole[]>>((acc, p) => {
    (acc[p.roleTeam] ??= []).push(p);
    return acc;
  }, {});

  const aliveCount = players.filter(p => p.isAlive).length;
  const deadCount = players.filter(p => !p.isAlive).length;

  if (!isOpen) return null;

  return (
    <div className="fixed top-0 left-0 w-dvw h-dvh z-[100] bg-charcoal-dark flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-moon-dim/10">
        <div>
          <h2 className="text-xl font-bold text-gold">Player Roster</h2>
          <p className="text-xs text-moon-dim mt-0.5">
            {aliveCount} alive{deadCount > 0 ? ` \u00b7 ${deadCount} dead` : ''}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-charcoal hover:bg-charcoal-light text-moon-dim hover:text-moon transition-colors text-xl"
        >
          &times;
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <p className="text-moon-dim text-center mt-8">Loading roster...</p>
        ) : (
          Object.entries(teams).map(([team, teamPlayers]) => (
            <div key={team}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className={`text-sm font-bold uppercase tracking-wider ${TEAM_COLORS[team] || 'text-moon-dim'}`}>
                  {team}
                </h3>
                <span className="text-xs text-moon-dim">({teamPlayers.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {teamPlayers.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between rounded-lg px-4 py-3 border ${
                      TEAM_BG[team] || 'bg-charcoal border-moon-dim/10'
                    } ${!p.isAlive ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      {!p.isAlive && <span className="text-sm">💀</span>}
                      <span className={`text-moon font-medium ${!p.isAlive ? 'line-through' : ''}`}>
                        {p.name}
                      </span>
                    </div>
                    <span className={`text-xs font-medium ${TEAM_COLORS[team] || 'text-moon-dim'}`}>
                      {p.roleName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
