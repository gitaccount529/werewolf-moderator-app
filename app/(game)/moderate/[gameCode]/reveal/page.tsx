'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

interface PlayerWithRole {
  id: number;
  name: string;
  role_name: string;
  role_team: string;
  role_ability: string;
}

const teamColors: Record<string, { bg: string; text: string; label: string }> = {
  village: { bg: 'bg-team-village/10', text: 'text-team-village', label: 'Village' },
  werewolf: { bg: 'bg-team-werewolf/10', text: 'text-team-werewolf', label: 'Werewolf' },
  tanner: { bg: 'bg-team-tanner/10', text: 'text-team-tanner', label: 'Tanner' },
  vampire: { bg: 'bg-team-vampire/10', text: 'text-team-vampire', label: 'Vampire' },
  cult: { bg: 'bg-team-cult/10', text: 'text-team-cult', label: 'Cult' },
  neutral: { bg: 'bg-team-neutral/10', text: 'text-team-neutral', label: 'Neutral' },
};

export default function RevealPage() {
  const router = useRouter();
  const params = useParams();
  const gameCode = (params.gameCode as string).toUpperCase();

  const [players, setPlayers] = useState<PlayerWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithRole | null>(null);

  useEffect(() => {
    async function load() {
      // Fetch all players with their assigned roles
      const gameRes = await fetch(`/api/games/${gameCode}`);
      if (!gameRes.ok) return;
      const gameData = await gameRes.json();

      // Fetch each player's role
      const playerRoles: PlayerWithRole[] = [];
      for (const p of gameData.players) {
        const roleRes = await fetch(`/api/games/${gameCode}/players/${p.id}/role`);
        if (roleRes.ok) {
          const data = await roleRes.json();
          playerRoles.push({
            id: p.id,
            name: p.name,
            role_name: data.role.name,
            role_team: data.role.team,
            role_ability: data.role.ability,
          });
        }
      }
      setPlayers(playerRoles);
      setLoading(false);
    }
    load();
  }, [gameCode]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-moon-dim">Loading role assignments...</p>
      </div>
    );
  }

  // Player detail modal — shows when moderator taps a player to reveal individually
  if (selectedPlayer) {
    const tc = teamColors[selectedPlayer.role_team] || teamColors.neutral;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-charcoal-dark">
        <Card className={`w-full max-w-sm text-center ${tc.bg}`}>
          <h2 className="text-3xl font-bold text-moon mb-2">{selectedPlayer.name}</h2>
          <div className="my-4">
            <h3 className="text-2xl font-bold text-gold">{selectedPlayer.role_name}</h3>
            <span className={`text-sm font-medium ${tc.text}`}>{tc.label} Team</span>
          </div>
          <p className="text-sm text-moon-dim leading-relaxed mt-4 text-left">
            {selectedPlayer.role_ability}
          </p>
        </Card>
        <button
          className="mt-6 text-moon-dim hover:text-moon text-sm transition-colors"
          onClick={() => setSelectedPlayer(null)}
        >
          Back to all players
        </button>
      </div>
    );
  }

  // Group players by team
  const wolves = players.filter((p) => p.role_team === 'werewolf');
  const villagers = players.filter((p) => p.role_team !== 'werewolf');

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gold mb-1 text-center">Role Assignments</h1>
      <p className="text-moon-dim text-sm text-center mb-6">
        Review all roles before starting Night 1. Tap a player to show their role card individually.
      </p>

      {/* Wolves */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-team-werewolf mb-2 flex items-center gap-2">
          <span>Werewolf Team ({wolves.length})</span>
          <div className="flex-1 h-px bg-team-werewolf/20" />
        </h3>
        <div className="space-y-2">
          {wolves.map((p) => (
            <button
              key={p.id}
              className="w-full flex items-center justify-between bg-team-werewolf/10 rounded-lg px-4 py-3 text-left hover:bg-team-werewolf/20 transition-colors"
              onClick={() => setSelectedPlayer(p)}
            >
              <span className="text-moon font-medium">{p.name}</span>
              <span className="text-sm text-team-werewolf">{p.role_name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Village & others */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-team-village mb-2 flex items-center gap-2">
          <span>Village & Other ({villagers.length})</span>
          <div className="flex-1 h-px bg-team-village/20" />
        </h3>
        <div className="space-y-2">
          {villagers.map((p) => {
            const tc = teamColors[p.role_team] || teamColors.neutral;
            return (
              <button
                key={p.id}
                className={`w-full flex items-center justify-between ${tc.bg} rounded-lg px-4 py-3 text-left hover:opacity-80 transition-opacity`}
                onClick={() => setSelectedPlayer(p)}
              >
                <span className="text-moon font-medium">{p.name}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${tc.text}`}>{p.role_name}</span>
                  {p.role_team !== 'village' && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tc.bg} ${tc.text}`}>
                      {tc.label}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Button
        variant="primary"
        className="w-full"
        onClick={() => router.push(`/moderate/${gameCode}/night`)}
      >
        Start Night 1
      </Button>

      <div className="h-8" />
    </div>
  );
}
