'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import ActionGeneric from './ActionGeneric';

interface AlivePlayer {
  id: number;
  name: string;
}

interface PlayerActionProps {
  roleName: string;
  alivePlayers: AlivePlayer[];
  playerId: number;
  onSubmit: (actionType: string, targetPlayerId?: number) => void;
}

export default function PlayerAction({
  roleName,
  alivePlayers,
  playerId,
  onSubmit,
}: PlayerActionProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const otherPlayers = alivePlayers.filter((p) => p.id !== playerId);

  // Generic roles that just need to acknowledge
  const genericRoles = [
    'Thing (That Goes Bump in the Night)',
    'Insomniac',
    'Tough Guy',
    'Fruit Brute',
    'Nostradamus',
    'Revealer',
  ];

  if (genericRoles.includes(roleName)) {
    return <ActionGeneric roleName={roleName} onDone={() => onSubmit('acknowledge')} />;
  }

  // Roles with target selection
  const actionMap: Record<string, { prompt: string; actionType: string; targetPool: AlivePlayer[] }> = {
    'Seer': { prompt: 'Choose a player to investigate', actionType: 'seer_peek', targetPool: otherPlayers },
    'Apprentice Seer': { prompt: 'Choose a player to investigate', actionType: 'seer_peek', targetPool: otherPlayers },
    'Bodyguard': { prompt: 'Choose a player to protect tonight', actionType: 'bodyguard_protect', targetPool: alivePlayers },
    'Werewolf': { prompt: 'Choose a player to eliminate', actionType: 'werewolf_kill', targetPool: otherPlayers },
    'Lone Wolf': { prompt: 'Choose a player to eliminate', actionType: 'lone_wolf_kill', targetPool: otherPlayers },
    'Mystic Wolf': { prompt: 'Choose a player to peek at', actionType: 'mystic_wolf_peek', targetPool: otherPlayers },
    'Alpha Wolf': { prompt: 'Choose a player to convert (optional)', actionType: 'alpha_convert', targetPool: otherPlayers },
    'Sorceress': { prompt: 'Choose a player — are they the Seer?', actionType: 'sorceress_scan', targetPool: otherPlayers },
    'P.I.': { prompt: 'Choose a player to investigate', actionType: 'pi_investigate', targetPool: otherPlayers },
    'Cult Leader': { prompt: 'Choose a player to recruit', actionType: 'cult_recruit', targetPool: otherPlayers },
    'Count Dracula': { prompt: 'Choose a player to bite', actionType: 'vampire_bite', targetPool: otherPlayers },
    'Vampire': { prompt: 'Choose a player to bite', actionType: 'vampire_bite', targetPool: otherPlayers },
    'Old Hag': { prompt: 'Choose a player to banish', actionType: 'hag_banish', targetPool: otherPlayers },
    'Spellcaster': { prompt: 'Choose a player to silence', actionType: 'spell_silence', targetPool: otherPlayers },
    'Sentinel': { prompt: 'Choose a player to shield', actionType: 'sentinel_shield', targetPool: otherPlayers },
  };

  const config = actionMap[roleName];

  if (!config) {
    return <ActionGeneric roleName={roleName} onDone={() => onSubmit('acknowledge')} />;
  }

  return (
    <div className="space-y-6 p-4">
      <h3 className="text-xl font-bold text-gold text-center">{roleName}</h3>
      <p className="text-moon-dim text-center">{config.prompt}</p>

      <div className="grid grid-cols-2 gap-2">
        {config.targetPool.map((p) => (
          <button
            key={p.id}
            className={`
              min-h-[44px] px-4 py-3 rounded-lg text-left transition-all
              ${selected === p.id
                ? 'bg-gold text-charcoal-dark font-semibold ring-2 ring-gold'
                : 'bg-charcoal-light hover:bg-charcoal text-moon'
              }
            `}
            onClick={() => setSelected(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>

      <Button
        variant="primary"
        className="w-full"
        disabled={!selected}
        onClick={() => {
          if (selected) onSubmit(config.actionType, selected);
        }}
      >
        Confirm
      </Button>
    </div>
  );
}
