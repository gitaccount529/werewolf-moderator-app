'use client';

import { useState, useEffect } from 'react';
import type { GameLogEntry } from '@/lib/types';

interface GameLogProps {
  gameCode: string;
  isOpen: boolean;
  onClose: () => void;
}

const eventIcons: Record<string, string> = {
  roles_assigned: '🎭',
  death: '💀',
  chain_death: '💀',
  lynch: '⚖️',
  prince_reveal: '👑',
  night_start: '🌙',
  day_start: '☀️',
  game_end: '🏆',
  vote: '🗳️',
};

export default function GameLog({ gameCode, isOpen, onClose }: GameLogProps) {
  const [entries, setEntries] = useState<GameLogEntry[]>([]);
  const [filterRound, setFilterRound] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    fetch(`/api/games/${gameCode}/log`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setEntries(data);
      });
  }, [gameCode, isOpen]);

  const rounds = [...new Set(entries.map((e) => e.round))].sort((a, b) => a - b);
  const filtered = filterRound !== null
    ? entries.filter((e) => e.round === filterRound)
    : entries;

  if (!isOpen) return null;

  return (
    <div className="fixed top-0 left-0 w-dvw h-dvh z-[100] bg-charcoal-dark flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-moon-dim/10">
        <div>
          <h2 className="text-xl font-bold text-gold">Game Log</h2>
          <p className="text-xs text-moon-dim mt-0.5">
            {entries.length} event{entries.length !== 1 ? 's' : ''} across {rounds.length} round{rounds.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-charcoal hover:bg-charcoal-light text-moon-dim hover:text-moon transition-colors text-xl"
        >
          &times;
        </button>
      </div>

      {/* Round filter */}
      <div className="flex gap-1.5 px-4 py-3 flex-wrap border-b border-moon-dim/5">
        <button
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
            filterRound === null ? 'bg-gold text-charcoal-dark' : 'bg-charcoal text-moon-dim hover:text-moon'
          }`}
          onClick={() => setFilterRound(null)}
        >
          All
        </button>
        {rounds.map((r) => (
          <button
            key={r}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterRound === r ? 'bg-gold text-charcoal-dark' : 'bg-charcoal text-moon-dim hover:text-moon'
            }`}
            onClick={() => setFilterRound(r)}
          >
            Round {r}
          </button>
        ))}
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filtered.length === 0 ? (
          <p className="text-moon-dim text-center mt-8">No events recorded yet.</p>
        ) : (
          filtered.map((entry) => (
            <div
              key={entry.id}
              className="bg-charcoal-light/50 rounded-lg px-4 py-3 border border-moon-dim/5"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{eventIcons[entry.event_type] || '📝'}</span>
                <span className="text-xs text-moon-dim font-medium">
                  Round {entry.round} &middot; {entry.phase}
                </span>
              </div>
              <p className="text-moon text-sm">{entry.description}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
