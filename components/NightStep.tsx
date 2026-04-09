'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import type { Role, Player } from '@/lib/types';

interface Actor {
  id: number;
  name: string;
  socketId: string | null;
}

interface AlivePlayer {
  id: number;
  name: string;
}

interface NightStepProps {
  role: Role;
  actors: Actor[];
  alivePlayers: AlivePlayer[];
  round: number;
  lang?: 'en' | 'tl';
  onAction: (action: { targetPlayerId?: number; actionType: string; secondTargetId?: number }) => void;
  onSkip: () => void;
}

export default function NightStep({
  role,
  actors,
  alivePlayers,
  round,
  lang = 'en',
  onAction,
  onSkip,
}: NightStepProps) {
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null);
  const [secondTarget, setSecondTarget] = useState<number | null>(null);
  const [witchSave, setWitchSave] = useState(false);
  const [witchKillTarget, setWitchKillTarget] = useState<number | null>(null);

  const nonActorPlayers = alivePlayers.filter(
    (p) => !actors.find((a) => a.id === p.id),
  );

  function handleSubmit() {
    const roleName = role.name;

    // Role-specific action mapping
    switch (roleName) {
      case 'Seer':
      case 'Apprentice Seer':
        if (selectedTarget) onAction({ targetPlayerId: selectedTarget, actionType: 'seer_peek' });
        break;
      case 'Mystic Wolf':
        if (selectedTarget) onAction({ targetPlayerId: selectedTarget, actionType: 'mystic_wolf_peek' });
        break;
      case 'Sorceress':
        if (selectedTarget) onAction({ targetPlayerId: selectedTarget, actionType: 'sorceress_scan' });
        break;
      case 'P.I.':
        if (selectedTarget) onAction({ targetPlayerId: selectedTarget, actionType: 'pi_investigate' });
        break;
      case 'Bodyguard':
        if (selectedTarget) onAction({ targetPlayerId: selectedTarget, actionType: 'bodyguard_protect' });
        break;
      case 'Werewolf':
      case 'Fruit Brute':
        if (selectedTarget) onAction({ targetPlayerId: selectedTarget, actionType: 'werewolf_kill' });
        break;
      case 'Lone Wolf':
        if (selectedTarget) onAction({ targetPlayerId: selectedTarget, actionType: 'lone_wolf_kill' });
        break;
      case 'Dire Wolf':
        if (round === 1 && selectedTarget) {
          onAction({ targetPlayerId: selectedTarget, actionType: 'dire_wolf_bond' });
        } else {
          onSkip();
        }
        break;
      case 'Alpha Wolf':
        if (selectedTarget) onAction({ targetPlayerId: selectedTarget, actionType: 'alpha_convert' });
        else onSkip();
        break;
      case 'Witch':
        if (witchSave) onAction({ actionType: 'witch_save', targetPlayerId: selectedTarget ?? undefined });
        if (witchKillTarget) onAction({ targetPlayerId: witchKillTarget, actionType: 'witch_kill' });
        if (!witchSave && !witchKillTarget) onSkip();
        break;
      case 'Cupid':
        if (selectedTarget && secondTarget) {
          onAction({ targetPlayerId: selectedTarget, secondTargetId: secondTarget, actionType: 'cupid_link' });
        }
        break;
      case 'Sentinel':
        if (selectedTarget) onAction({ targetPlayerId: selectedTarget, actionType: 'sentinel_shield' });
        break;
      case 'Cult Leader':
        if (selectedTarget) onAction({ targetPlayerId: selectedTarget, actionType: 'cult_recruit' });
        break;
      case 'Count Dracula':
      case 'Vampire':
        if (selectedTarget) onAction({ targetPlayerId: selectedTarget, actionType: 'vampire_bite' });
        break;
      case 'Old Hag':
        if (selectedTarget) onAction({ targetPlayerId: selectedTarget, actionType: 'hag_banish' });
        break;
      case 'Spellcaster':
        if (selectedTarget) onAction({ targetPlayerId: selectedTarget, actionType: 'spell_silence' });
        break;
      case 'Leprechaun':
        if (selectedTarget && secondTarget) {
          onAction({ targetPlayerId: selectedTarget, secondTargetId: secondTarget, actionType: 'leprechaun_swap' });
        }
        break;
      default:
        // Generic roles (Thing, Insomniac, Revealer, Nostradamus, etc.)
        onSkip();
    }
  }

  const needsTwoTargets = ['Cupid', 'Leprechaun'].includes(role.name);
  const isWitch = role.name === 'Witch';
  const isGeneric = ['Thing (That Goes Bump in the Night)', 'Insomniac', 'Tough Guy', 'Fruit Brute'].includes(role.name);

  return (
    <div className="space-y-6">
      {/* Role header */}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gold mb-2">{role.name}</h2>
        <div className="flex justify-center gap-2 text-sm text-moon-dim mb-4">
          {actors.map((a) => (
            <span key={a.id} className="bg-charcoal rounded-full px-3 py-1">
              {a.name}
            </span>
          ))}
        </div>
      </div>

      {/* Moderator script */}
      {role.moderator_script && (() => {
        const script = lang === 'tl' && role.moderator_script_tl
          ? role.moderator_script_tl
          : role.moderator_script;
        return (
          <div className="bg-charcoal rounded-xl p-4 border border-gold/20">
            <p className="text-sm text-moon-dim mb-1 font-medium">
              {lang === 'tl' ? 'Basahin nang malakas:' : 'Read aloud:'}
            </p>
            <p className="text-moon leading-relaxed italic">
              &quot;{script}&quot;
            </p>
          </div>
        );
      })()}

      {/* Action area */}
      {isGeneric ? (
        <div className="text-center">
          <p className="text-moon-dim mb-4">
            {role.name} is awake. Perform their action, then continue.
          </p>
          <Button onClick={onSkip}>Next Role</Button>
        </div>
      ) : isWitch ? (
        <div className="space-y-4">
          {/* Witch save */}
          <div className="bg-charcoal rounded-lg p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={witchSave}
                onChange={(e) => setWitchSave(e.target.checked)}
                className="w-5 h-5 rounded accent-gold"
              />
              <span className="text-moon">Use healing potion (save the victim)?</span>
            </label>
          </div>

          {/* Witch kill */}
          <div>
            <p className="text-sm text-moon-dim mb-2">Use poison potion on:</p>
            <PlayerGrid
              players={nonActorPlayers}
              selected={witchKillTarget}
              onSelect={setWitchKillTarget}
            />
          </div>

          <Button onClick={handleSubmit} className="w-full">
            Confirm Witch Actions
          </Button>
        </div>
      ) : needsTwoTargets ? (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-moon-dim mb-2">
              {role.name === 'Cupid' ? 'First lover:' : 'First player:'}
            </p>
            <PlayerGrid
              players={alivePlayers}
              selected={selectedTarget}
              onSelect={(id) => {
                setSelectedTarget(id);
                if (id === secondTarget) setSecondTarget(null);
              }}
            />
          </div>
          <div>
            <p className="text-sm text-moon-dim mb-2">
              {role.name === 'Cupid' ? 'Second lover:' : 'Second player:'}
            </p>
            <PlayerGrid
              players={alivePlayers.filter((p) => p.id !== selectedTarget)}
              selected={secondTarget}
              onSelect={setSecondTarget}
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!selectedTarget || !secondTarget}
            className="w-full"
          >
            Confirm
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-moon-dim mb-2">
            Select a target:
          </p>
          <PlayerGrid
            players={role.name === 'Bodyguard' ? alivePlayers : nonActorPlayers}
            selected={selectedTarget}
            onSelect={setSelectedTarget}
          />
          <div className="flex gap-3">
            <Button
              onClick={handleSubmit}
              disabled={!selectedTarget}
              className="flex-1"
            >
              Confirm
            </Button>
            {['Alpha Wolf', 'Revealer', 'Nostradamus'].includes(role.name) && (
              <Button variant="ghost" onClick={onSkip}>
                Skip
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Player Selection Grid ──────────────────────────────────

function PlayerGrid({
  players,
  selected,
  onSelect,
}: {
  players: { id: number; name: string }[];
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {players.map((p) => (
        <button
          key={p.id}
          className={`
            min-h-[44px] px-4 py-2.5 rounded-lg text-left transition-all
            ${selected === p.id
              ? 'bg-gold text-charcoal-dark font-semibold ring-2 ring-gold'
              : 'bg-charcoal hover:bg-charcoal-light text-moon'
            }
          `}
          onClick={() => onSelect(p.id)}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
