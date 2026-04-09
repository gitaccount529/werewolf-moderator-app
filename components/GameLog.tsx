'use client';

import { useState, useEffect } from 'react';
import type { GameLogEntry } from '@/lib/types';

interface GameLogProps {
  gameCode: string;
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

export default function GameLog({ gameCode }: GameLogProps) {
  const [entries, setEntries] = useState<GameLogEntry[]>([]);
  const [filterRound, setFilterRound] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);

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

  return (
    <div className="fixed right-0 top-0 h-full z-50" role="complementary" aria-label="Game Log">
      {/* Toggle button */}
      <button
        className="absolute top-4 right-4 bg-charcoal-light border border-moon-dim/20 rounded-lg px-3 py-2 text-sm text-moon-dim hover:text-moon z-10"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="game-log-panel"
      >
        {isOpen ? 'Close' : 'Game Log'}
      </button>

      {/* Panel — sidebar on desktop, bottom sheet on mobile */}
      {isOpen && (
        <div
          id="game-log-panel"
          className="fixed md:relative md:w-80 md:h-full
                     inset-x-0 bottom-0 md:inset-auto md:bottom-auto
                     max-h-[70vh] md:max-h-full
                     bg-charcoal-dark border-t md:border-t-0 md:border-l border-moon-dim/10
                     p-4 pt-4 md:pt-14 overflow-y-auto rounded-t-2xl md:rounded-none"
        >
          <h3 className="text-lg font-semibold text-gold mb-4">Game Log</h3>

          {/* Round filter */}
          <div className="flex gap-1 mb-4 flex-wrap">
            <button
              className={`text-xs px-2 py-1 rounded ${filterRound === null ? 'bg-gold text-charcoal-dark' : 'bg-charcoal text-moon-dim'}`}
              onClick={() => setFilterRound(null)}
            >
              All
            </button>
            {rounds.map((r) => (
              <button
                key={r}
                className={`text-xs px-2 py-1 rounded ${filterRound === r ? 'bg-gold text-charcoal-dark' : 'bg-charcoal text-moon-dim'}`}
                onClick={() => setFilterRound(r)}
              >
                R{r}
              </button>
            ))}
          </div>

          {/* Entries */}
          <div className="space-y-2">
            {filtered.map((entry) => (
              <div
                key={entry.id}
                className="bg-charcoal/50 rounded-lg px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span>{eventIcons[entry.event_type] || '📝'}</span>
                  <span className="text-xs text-moon-dim">
                    R{entry.round} {entry.phase}
                  </span>
                </div>
                <p className="text-moon text-sm">{entry.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
