'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import type { Role, PlayerEnrichment, PlayerIndicator } from '@/lib/types';

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
  enrichment?: PlayerEnrichment | null;
  onAction: (action: { targetPlayerId?: number; actionType: string; secondTargetId?: number }) => void;
  onSkip: () => void;
  isDead?: boolean;
}

// ─── Indicator Builder ───────────────────────────────────────

const SEER_ROLES = new Set(['Seer', 'Apprentice Seer', 'Mystic Wolf']);
const KILL_ROLES = new Set(['Werewolf', 'Fruit Brute', 'Lone Wolf', 'Dire Wolf', 'Alpha Wolf']);

function buildIndicators(
  roleName: string,
  players: { id: number }[],
  enrichment: PlayerEnrichment | null | undefined,
): Record<number, PlayerIndicator> {
  if (!enrichment) return {};
  const result: Record<number, PlayerIndicator> = {};

  const isSeerRole = SEER_ROLES.has(roleName);
  const isKillRole = KILL_ROLES.has(roleName);

  for (const p of players) {
    const ind: PlayerIndicator = {};

    // Seer: show wolf/safe truth for ALL players (moderator cheat sheet)
    // Plus mark already-investigated players (only by THIS role, not other peek roles)
    if (isSeerRole) {
      // Show truth from seerTruth (accounts for Lycan/Wolf Man deceptions)
      if (enrichment.seerTruth?.[p.id]) {
        ind.seerResult = enrichment.seerTruth[p.id];
      }
      // Mark if already investigated by THIS specific role in a prior round
      if (roleName === 'Mystic Wolf') {
        if (enrichment.mysticWolfChecked?.[p.id]) ind.alreadyInvestigated = true;
      } else {
        // Seer and Apprentice Seer share the seer_peek action
        if (enrichment.seerChecked?.[p.id]) ind.alreadyInvestigated = true;
      }
    }

    // Kill roles: show protection indicators
    if (isKillRole || roleName === 'Witch') {
      const sources: string[] = [];
      if (enrichment.protectedIds.includes(p.id)) sources.push('Bodyguard');
      if (enrichment.priestBlessedIds.includes(p.id)) sources.push('Priest');
      if (enrichment.sentinelShieldedIds.includes(p.id)) sources.push('Sentinel');
      if (enrichment.sandwichHolderIds.includes(p.id)) sources.push('Sandwich');
      if (sources.length > 0) {
        ind.isProtected = true;
        ind.protectionLabel = sources.join(', ');
      }
    }

    if (Object.keys(ind).length > 0) result[p.id] = ind;
  }

  return result;
}

// ─── Main Component ──────────────────────────────────────────

export default function NightStep({
  role,
  actors,
  alivePlayers,
  round,
  lang = 'en',
  enrichment,
  onAction,
  onSkip,
  isDead = false,
}: NightStepProps) {
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null);
  const [secondTarget, setSecondTarget] = useState<number | null>(null);
  const [witchSave, setWitchSave] = useState(false);
  const [witchKillTarget, setWitchKillTarget] = useState<number | null>(null);

  const nonActorPlayers = alivePlayers.filter(
    (p) => !actors.find((a) => a.id === p.id),
  );

  // Build indicators for the current role
  const indicators = buildIndicators(role.name, alivePlayers, enrichment);

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
      case 'Priest':
        if (selectedTarget) onAction({ targetPlayerId: selectedTarget, actionType: 'priest_bless' });
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
  const isBeholder = role.name === 'Beholder';
  const isGeneric = ['Thing (That Goes Bump in the Night)', 'Insomniac', 'Tough Guy', 'Fruit Brute'].includes(role.name);

  return (
    <div className="space-y-6">
      {/* Role header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <h2 className="text-3xl font-bold text-gold">{role.name}</h2>
          {isDead && (
            <span className="bg-blood/30 text-blood-light text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
              Dead
            </span>
          )}
        </div>
        <div className="flex justify-center gap-2 text-sm text-moon-dim mb-4">
          {actors.map((a) => (
            <span key={a.id} className={`rounded-full px-3 py-1 ${isDead ? 'bg-charcoal-dark line-through opacity-60' : 'bg-charcoal'}`}>
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
      {isDead ? (
        <div className="text-center space-y-4">
          <div className="bg-blood/10 border border-blood/20 rounded-xl p-4">
            <p className="text-sm text-moon-dim">
              This role is dead. Read the script aloud for appearances only.
            </p>
          </div>
          <Button onClick={onSkip} className="w-full">Continue</Button>
        </div>
      ) : isBeholder ? (
        <div className="space-y-4">
          {enrichment?.seerPlayerName ? (
            <div className="bg-amber-900/30 border border-amber-500/60 rounded-xl p-5 text-center">
              <p className="text-xs text-amber-400 uppercase tracking-wider font-semibold mb-2">
                Point to the Seer
              </p>
              <p className="text-3xl font-bold text-amber-300">{enrichment.seerPlayerName}</p>
            </div>
          ) : (
            <div className="bg-charcoal rounded-xl p-4 text-center">
              <p className="text-sm text-moon-dim">No Seer found in this game.</p>
            </div>
          )}
          <Button onClick={onSkip} className="w-full">Continue</Button>
        </div>
      ) : isGeneric ? (
        <div className="text-center">
          <p className="text-moon-dim mb-4">
            {role.name} is awake. Perform their action, then continue.
          </p>
          <Button onClick={onSkip}>Next Role</Button>
        </div>
      ) : isWitch ? (
        <div className="space-y-4">
          {/* Wolf target reveal */}
          {enrichment?.wolfKillTargetName ? (
            <div className="bg-blood/20 border border-blood/40 rounded-xl p-4 text-center">
              <p className="text-xs text-moon-dim mb-1">The werewolves targeted:</p>
              <p className="text-xl font-bold text-blood-light">{enrichment.wolfKillTargetName}</p>
            </div>
          ) : (
            <div className="bg-charcoal rounded-xl p-4 text-center">
              <p className="text-sm text-moon-dim">No wolf kill recorded this round.</p>
            </div>
          )}

          {/* Witch save */}
          {enrichment?.witchSaveUsed ? (
            <div className="bg-charcoal rounded-lg p-4 opacity-50">
              <p className="text-moon-dim text-sm">Healing potion already used this game.</p>
            </div>
          ) : (
            <div className="bg-charcoal rounded-lg p-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={witchSave}
                  onChange={(e) => setWitchSave(e.target.checked)}
                  className="w-5 h-5 rounded accent-gold"
                />
                <span className="text-moon">
                  Use healing potion{enrichment?.wolfKillTargetName ? ` (save ${enrichment.wolfKillTargetName})` : ' (save the victim)'}?
                </span>
              </label>
            </div>
          )}

          {/* Witch kill */}
          {enrichment?.witchKillUsed ? (
            <div className="bg-charcoal rounded-lg p-4 opacity-50">
              <p className="text-moon-dim text-sm">Poison potion already used this game.</p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-moon-dim mb-2">Use poison potion on:</p>
              <PlayerGrid
                players={nonActorPlayers}
                selected={witchKillTarget}
                onSelect={setWitchKillTarget}
                indicators={indicators}
              />
            </div>
          )}

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
            indicators={indicators}
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

// ─── Player Selection Grid with Indicators ───────────────────

function PlayerGrid({
  players,
  selected,
  onSelect,
  indicators,
}: {
  players: { id: number; name: string }[];
  selected: number | null;
  onSelect: (id: number) => void;
  indicators?: Record<number, PlayerIndicator>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {players.map((p) => {
        const ind = indicators?.[p.id];
        const isSelected = selected === p.id;

        // Indicator-based styling (only when NOT selected — gold overrides everything)
        let indicatorBg = '';
        if (!isSelected && ind?.seerResult === 'wolf') {
          indicatorBg = 'ring-2 ring-blood/60 bg-blood/10';
        } else if (!isSelected && ind?.seerResult === 'safe') {
          indicatorBg = 'ring-2 ring-forest/60 bg-forest/10';
        }

        return (
          <button
            key={p.id}
            className={`
              min-h-[44px] px-4 py-2.5 rounded-lg text-left transition-all
              ${isSelected
                ? 'bg-gold text-charcoal-dark font-semibold ring-2 ring-gold'
                : `bg-charcoal hover:bg-charcoal-light text-moon ${indicatorBg}`
              }
            `}
            onClick={() => onSelect(p.id)}
          >
            <div className="flex items-center justify-between w-full gap-2">
              <span className={`truncate ${ind?.alreadyInvestigated ? 'italic opacity-70' : ''}`}>
                {p.name}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {ind?.seerResult === 'wolf' && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    isSelected ? 'text-blood bg-blood/20' : 'text-blood-light'
                  }`}>
                    🐺 WOLF
                  </span>
                )}
                {ind?.seerResult === 'safe' && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    isSelected ? 'text-forest bg-forest/20' : 'text-forest-light'
                  }`}>
                    ✅ SAFE
                  </span>
                )}
                {ind?.alreadyInvestigated && (
                  <span className="text-[9px] text-moon-dim/50">checked</span>
                )}
                {ind?.isProtected && (
                  <span
                    className="text-sm"
                    title={ind.protectionLabel}
                  >
                    🛡
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
