'use client';

import type { Role, Team } from '@/lib/types';

const teamColors: Record<Team, string> = {
  village: 'bg-team-village/20 text-team-village',
  werewolf: 'bg-team-werewolf/20 text-team-werewolf',
  tanner: 'bg-team-tanner/20 text-team-tanner',
  vampire: 'bg-team-vampire/20 text-team-vampire',
  cult: 'bg-team-cult/20 text-team-cult',
  neutral: 'bg-team-neutral/20 text-team-neutral',
};

const teamLabels: Record<Team, string> = {
  village: 'Village',
  werewolf: 'Werewolf',
  tanner: 'Tanner',
  vampire: 'Vampire',
  cult: 'Cult',
  neutral: 'Neutral',
};

interface RoleCardProps {
  role: Role;
  showAbility?: boolean;
  compact?: boolean;
  className?: string;
}

export default function RoleCard({ role, showAbility = true, compact, className = '' }: RoleCardProps) {
  const team = role.team as Team;

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${teamColors[team]}`}>
          {teamLabels[team]}
        </span>
        <span className="text-moon font-medium">{role.name}</span>
      </div>
    );
  }

  return (
    <div className={`bg-charcoal/50 rounded-lg p-4 border border-moon-dim/10 ${className}`}>
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-lg font-semibold text-moon">{role.name}</h4>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${teamColors[team]}`}>
          {teamLabels[team]}
        </span>
      </div>
      {showAbility && (
        <p className="text-sm text-moon-dim leading-relaxed">{role.ability}</p>
      )}
      {role.is_night_role === 1 && (
        <div className="mt-2 text-xs text-gold-dark">
          Night role (order: {role.night_wake_order})
        </div>
      )}
    </div>
  );
}
