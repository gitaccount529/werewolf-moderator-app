'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { usePusher } from '@/hooks/usePusher';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import RoleCard from '@/components/RoleCard';
import PlayerAction from '@/components/player/PlayerAction';
import type { Role, Player } from '@/lib/types';

type PlayerPhase = 'lobby' | 'role_hidden' | 'role_shown' | 'night_sleep' | 'night_wake' | 'day' | 'voting' | 'dead' | 'game_over';
type WinningTeam = 'village' | 'werewolf' | 'vampire' | 'cult' | 'tanner' | 'lovers' | null;

interface VoteNominee {
  playerId: number;
  playerName: string;
}

export default function PlayerPage() {
  const params = useParams();
  const gameCode = (params.gameCode as string).toUpperCase();
  const { subscribe } = usePusher();

  const [playerId, setPlayerId] = useState<number | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [phase, setPhase] = useState<PlayerPhase>('lobby');
  const [role, setRole] = useState<Role | null>(null);
  const [extraInfo, setExtraInfo] = useState<Record<string, string[]>>({});
  const [alivePlayers, setAlivePlayers] = useState<{ id: number; name: string }[]>([]);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerPaused, setTimerPaused] = useState(true);
  const [nominees, setNominees] = useState<VoteNominee[]>([]);
  const [selectedVote, setSelectedVote] = useState<number | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [nightRoleName, setNightRoleName] = useState('');
  const [deaths, setDeaths] = useState<{ playerName: string; cause: string }[]>([]);
  const [winningTeam, setWinningTeam] = useState<WinningTeam>(null);
  const [winReason, setWinReason] = useState('');
  const [testPanelOpen, setTestPanelOpen] = useState(true);

  // Get player info from sessionStorage
  useEffect(() => {
    const id = sessionStorage.getItem('playerId');
    const name = sessionStorage.getItem('playerName');
    if (id) setPlayerId(parseInt(id));
    if (name) setPlayerName(name);

    // Test mode (code 6969) — bypass moderator, inject full test state
    if (gameCode === '6969') {
      if (!id) {
        setPlayerId(-1);
        setPlayerName('TestPlayer');
      }
      // Skip lobby — start in role_hidden so test panel is immediately useful
      setPhase('role_hidden');
      // Preload mock role so role_shown works
      setRole({
        id: 0,
        name: 'Seer',
        team: 'village',
        set: 'deluxe',
        night_wake_order: 50,
        is_night_role: 1,
        default_count: 1,
        ability: 'Each night, may look at one player\'s card to learn if they are a werewolf.',
        moderator_script: '',
        moderator_script_tl: '',
      });
      // Preload mock alive players
      setAlivePlayers([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' },
        { id: 4, name: 'Dave' },
      ]);
    }
  }, [gameCode]);

  // No socket room to join — Pusher handles subscriptions in the effect below

  // Sync game state from server (called on mount + poll interval)
  const syncGameState = useCallback(async () => {
    if (!playerId) return;
    // Test mode — don't sync from server, the test panel manually drives state
    if (gameCode === '6969') return;
    const res = await fetch(`/api/games/${gameCode}`);
    if (!res.ok) return;
    const data = await res.json();

    setAlivePlayers(
      data.players
        .filter((p: Player) => p.is_alive === 1)
        .map((p: Player) => ({ id: p.id, name: p.name })),
    );

    const me = data.players.find((p: Player) => p.id === playerId);
    const isDead = me && me.is_alive === 0;

    // Phase reconciliation — server status is source of truth
    // Only reconcile if current phase is clearly out of sync with game status
    setPhase((currentPhase) => {
      if (isDead) return 'dead';

      const status = data.game.status;
      if (status === 'lobby') return 'lobby';

      if (status === 'night') {
        // In night phase — allow night_sleep, night_wake, role_hidden, role_shown
        if (['night_sleep', 'night_wake', 'role_hidden', 'role_shown'].includes(currentPhase)) {
          return currentPhase;
        }
        return 'night_sleep';
      }

      if (status === 'day') {
        // In day phase — allow day, voting, role_shown (peek)
        if (['day', 'voting', 'role_shown'].includes(currentPhase)) {
          return currentPhase;
        }
        return 'day';
      }

      return currentPhase;
    });

    // Fetch role if game has started and we don't have it yet
    if (['night', 'day'].includes(data.game.status) && role === null) {
      fetchRole();
    }
  }, [gameCode, playerId, role]);

  // Initial sync + polling fallback (covers missed socket events)
  useEffect(() => {
    if (!playerId) return;
    syncGameState();
    const interval = setInterval(syncGameState, 5000);
    return () => clearInterval(interval);
  }, [playerId, syncGameState]);

  async function fetchRole() {
    if (!playerId) return;
    const res = await fetch(`/api/games/${gameCode}/players/${playerId}/role`);
    if (res.ok) {
      const data = await res.json();
      setRole(data.role);
      setExtraInfo(data.extraInfo || {});
    }
  }

  // ─── Pusher Event Subscriptions ────────────────────────────

  // Subscribe to game channel (broadcasts visible to all players)
  useEffect(() => {
    if (gameCode === '6969') return; // Test mode — no real subscriptions
    return subscribe(`game-${gameCode}`, {
      'game:started': () => {
        setPhase('role_hidden');
        fetchRole();
      },
      'day:started': () => {
        setPhase('day');
        setHasVoted(false);
        setSelectedVote(null);
        syncGameState();
      },
      'game:ended': (data: unknown) => {
        const d = data as { winningTeam?: string; reason?: string };
        setWinningTeam((d.winningTeam as WinningTeam) || null);
        setWinReason(d.reason || '');
        setPhase('game_over');
      },
    });
  }, [gameCode, subscribe]);

  // Subscribe to player-specific channel (night wake/sleep targeted to this player)
  useEffect(() => {
    if (!playerId || playerId < 0 || gameCode === '6969') return;
    return subscribe(`player-${playerId}`, {
      'night:wake': (data: unknown) => {
        const d = data as { roleName?: string };
        setNightRoleName(d.roleName || '');
        setPhase('night_wake');
      },
      'night:sleep': () => {
        setPhase('night_sleep');
      },
    });
  }, [playerId, subscribe, gameCode]);

  // Submit night action via API (was socket.emit before)
  function submitNightAction(actionType: string, targetPlayerId?: number) {
    // The moderator handles actions — player just returns to sleep
    setPhase('night_sleep');
  }

  // Submit vote
  function submitVote() {
    if (selectedVote === undefined) return;
    // Vote submission — in serverless mode, moderator handles votes manually
    // Player just shows "vote cast" feedback locally
    setHasVoted(true);
  }

  // ─── Test Mode ─────────────────────────────────────────────
  // Activates when gameCode is "6969" — lets you jump between player states
  const isTestMode = gameCode === '6969';

  function jumpToPhase(p: PlayerPhase, opts?: { winning?: WinningTeam; reason?: string }) {
    // Load mock data for states that need it
    if (p === 'role_shown' && !role) {
      setRole({
        id: 0, name: 'Seer', team: 'village', set: 'deluxe',
        night_wake_order: 50, is_night_role: 1, default_count: 1,
        ability: 'Each night, may look at one player\'s card to learn if they are a werewolf.',
        moderator_script: '', moderator_script_tl: '',
      });
    }
    if (p === 'night_wake') setNightRoleName('Seer');
    if (p === 'day' && deaths.length === 0) {
      setDeaths([{ playerName: 'Alice', cause: 'werewolf' }]);
    }
    if (p === 'voting') {
      setNominees([
        { playerId: 1, playerName: 'Alice' },
        { playerId: 2, playerName: 'Bob' },
        { playerId: 3, playerName: 'Charlie' },
      ]);
      setHasVoted(false);
      setSelectedVote(null);
    }
    if (['day', 'voting', 'night_wake'].includes(p) && alivePlayers.length === 0) {
      setAlivePlayers([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' },
        { id: 4, name: 'Dave' },
      ]);
    }
    if (p === 'game_over' && opts?.winning) {
      setWinningTeam(opts.winning);
      setWinReason(opts.reason || '');
    }
    if (!playerName) setPlayerName('TestPlayer');
    setPhase(p);
  }

  const testPanel = isTestMode ? (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-charcoal-dark/95 backdrop-blur border-t-2 border-gold shadow-2xl">
      {/* Header bar — always visible */}
      <button
        className="w-full flex items-center justify-between px-4 py-2 bg-gold/10 hover:bg-gold/20 transition-colors"
        onClick={() => setTestPanelOpen((o) => !o)}
      >
        <span className="text-xs font-bold text-gold">
          🧪 TEST MODE
        </span>
        <span className="text-[10px] text-moon-dim">
          current: <span className="text-gold font-mono">{phase}</span>
          {winningTeam && ` • ${winningTeam}`}
        </span>
        <span className="text-gold text-sm">
          {testPanelOpen ? '▼' : '▲'}
        </span>
      </button>

      {/* Expanded controls — auto-height, no internal scroll */}
      {testPanelOpen && (
        <div className="p-3">
          {/* Phase buttons */}
          <p className="text-[10px] text-moon-dim mb-1 uppercase tracking-wide">Phases</p>
          <div className="grid grid-cols-4 gap-1 mb-3">
            {([
              ['lobby', 'Lobby'],
              ['role_hidden', 'Reveal'],
              ['role_shown', 'Role'],
              ['night_sleep', 'Night'],
              ['night_wake', 'Wake Up'],
              ['day', 'Day'],
              ['voting', 'Vote'],
              ['dead', 'You Died'],
            ] as [PlayerPhase, string][]).map(([p, label]) => (
              <button
                key={p}
                className={`text-[11px] px-2 py-2 rounded font-medium transition-colors min-h-[36px] ${
                  phase === p
                    ? 'bg-gold text-charcoal-dark'
                    : 'bg-charcoal text-moon hover:bg-charcoal-light'
                }`}
                onClick={() => jumpToPhase(p)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Game over buttons per faction */}
          <p className="text-[10px] text-moon-dim mb-1 uppercase tracking-wide">Game Over (faction wins)</p>
          <div className="grid grid-cols-3 gap-1 mb-2">
            {([
              ['village', '🏡 Village', 'All werewolves eliminated. The village is safe.'],
              ['werewolf', '🐺 Wolves', 'Werewolves equal the village. Darkness wins.'],
              ['vampire', '🧛 Vampires', 'The vampires have converted everyone.'],
              ['cult', '🔮 Cult', 'All surviving players joined the cult.'],
              ['tanner', '🎭 Tanner', 'The Tanner was lynched and achieved their goal.'],
              ['lovers', '💘 Lovers', 'Only the linked lovers remain.'],
            ] as [WinningTeam, string, string][]).map(([team, label, reason]) => (
              <button
                key={team}
                className={`text-[10px] px-2 py-2 rounded font-medium transition-colors min-h-[36px] ${
                  phase === 'game_over' && winningTeam === team
                    ? 'bg-gold text-charcoal-dark'
                    : 'bg-charcoal text-moon hover:bg-charcoal-light'
                }`}
                onClick={() => jumpToPhase('game_over', { winning: team, reason })}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Reset */}
          <div className="flex gap-2 mt-2">
            <button
              className="flex-1 text-[10px] text-moon-dim hover:text-moon py-1 rounded bg-charcoal"
              onClick={() => {
                setHasVoted(false);
                setSelectedVote(null);
                setDeaths([]);
                setNominees([]);
                setWinningTeam(null);
                setWinReason('');
              }}
            >
              Reset mock data
            </button>
          </div>
        </div>
      )}
    </div>
  ) : null;

  // Wrap phase content so test panel stays visible
  const renderPhaseContent = () => {
  // ─── Render ────────────────────────────────────────────────

  // Lobby
  if (phase === 'lobby') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-5xl mb-6">🐺</div>
        <h2 className="text-2xl font-bold text-gold mb-2">{playerName}</h2>
        <p className="text-moon-dim mb-8">Waiting for the moderator to start the game...</p>
        <Card className="w-full max-w-xs text-center">
          <p className="text-sm text-moon-dim">Game Code</p>
          <p className="text-3xl font-mono font-bold text-gold tracking-[0.3em]">{gameCode}</p>
        </Card>
      </div>
    );
  }

  // Role reveal (hidden)
  if (phase === 'role_hidden') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <Card className="w-full max-w-sm text-center">
          <p className="text-moon-dim mb-6">Your role has been assigned!</p>
          <button
            className="w-full py-6 rounded-xl border-2 border-gold text-gold text-xl font-semibold
                       hover:bg-gold/10 active:bg-gold/20 transition-all
                       animate-[pulse-gold_2s_infinite]"
            onClick={() => setPhase('role_shown')}
          >
            Tap to Reveal Your Role
          </button>
        </Card>
      </div>
    );
  }

  // Role reveal (shown)
  if (phase === 'role_shown' && role) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <RoleCard role={role} />

          {/* Extra info */}
          {extraInfo.masons?.length > 0 && (
            <div className="mt-4 p-3 bg-charcoal rounded-lg">
              <p className="text-sm text-moon-dim">Fellow Mason(s):</p>
              <p className="text-moon font-medium">{extraInfo.masons.join(', ')}</p>
            </div>
          )}
          {extraInfo.werewolves?.length > 0 && (
            <div className="mt-4 p-3 bg-blood/10 rounded-lg">
              <p className="text-sm text-moon-dim">The werewolves are:</p>
              <p className="text-blood-light font-medium">{extraInfo.werewolves.join(', ')}</p>
            </div>
          )}
          {extraInfo.pack?.length > 0 && (
            <div className="mt-4 p-3 bg-blood/10 rounded-lg">
              <p className="text-sm text-moon-dim">Your pack:</p>
              <p className="text-blood-light font-medium">{extraInfo.pack.join(', ')}</p>
            </div>
          )}
          {extraInfo.vampires?.length > 0 && (
            <div className="mt-4 p-3 bg-team-vampire/10 rounded-lg">
              <p className="text-sm text-moon-dim">Fellow vampires:</p>
              <p className="text-team-vampire font-medium">{extraInfo.vampires.join(', ')}</p>
            </div>
          )}

          <button
            className="w-full mt-6 py-3 text-sm text-moon-dim hover:text-moon transition-colors"
            onClick={() => setPhase('night_sleep')}
          >
            Hide role (tap to continue)
          </button>
        </Card>
      </div>
    );
  }

  // Night — sleeping
  if (phase === 'night_sleep') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-charcoal-dark">
        <div className="text-6xl mb-6">🌙</div>
        <h2 className="text-2xl font-bold text-moon-dim text-center">
          Close your eyes...
        </h2>
        <p className="text-moon-dim/50 text-sm mt-4 text-center">
          Wait for the moderator to wake you.
        </p>

        {/* Hidden role peek */}
        <button
          className="mt-12 text-xs text-moon-dim/30 hover:text-moon-dim/60 transition-colors"
          onClick={() => setPhase('role_shown')}
        >
          Peek at role
        </button>
      </div>
    );
  }

  // Night — awake (action)
  if (phase === 'night_wake') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-charcoal-dark">
        <div className="w-full max-w-sm">
          <div className="text-center mb-4">
            <div className="text-4xl mb-2">👁️</div>
            <p className="text-gold text-sm">Wake up!</p>
          </div>

          <Card>
            <PlayerAction
              roleName={nightRoleName}
              alivePlayers={alivePlayers}
              playerId={playerId!}
              onSubmit={submitNightAction}
            />
          </Card>
        </div>
      </div>
    );
  }

  // Day phase
  if (phase === 'day') {
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;

    return (
      <div className="min-h-screen p-4 pb-20">
        <div className="max-w-sm mx-auto space-y-6">
          <div className="text-center">
            <div className="text-4xl mb-2">☀️</div>
            <h2 className="text-xl font-bold text-gold">Day Phase</h2>
          </div>

          {/* Deaths */}
          {deaths.length > 0 && (
            <Card>
              <h3 className="text-sm font-medium text-moon-dim mb-2">Last Night</h3>
              {deaths.map((d, i) => (
                <p key={i} className="text-blood-light text-sm">
                  💀 {d.playerName} was killed
                </p>
              ))}
            </Card>
          )}

          {/* Timer */}
          {!timerPaused && timerSeconds > 0 && (
            <div className="text-center">
              <span className={`text-3xl font-mono font-bold ${timerSeconds <= 30 ? 'text-blood-light' : 'text-moon'}`}>
                {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
              </span>
              <p className="text-xs text-moon-dim mt-1">Discussion timer</p>
            </div>
          )}

          {/* Alive players */}
          <Card>
            <h3 className="text-sm font-medium text-moon-dim mb-2">
              Alive ({alivePlayers.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {alivePlayers.map((p) => (
                <span
                  key={p.id}
                  className={`text-sm px-3 py-1 rounded-full ${
                    p.id === playerId ? 'bg-gold/20 text-gold' : 'bg-charcoal text-moon'
                  }`}
                >
                  {p.name}
                </span>
              ))}
            </div>
          </Card>

          {/* Role reminder */}
          <button
            className="w-full text-xs text-moon-dim/50 hover:text-moon-dim/80 text-center"
            onClick={() => setPhase('role_shown')}
          >
            View your role
          </button>
        </div>
      </div>
    );
  }

  // Voting
  if (phase === 'voting') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="text-4xl mb-2">🗳️</div>
            <h2 className="text-xl font-bold text-gold">Vote!</h2>
          </div>

          {hasVoted ? (
            <Card className="text-center">
              <p className="text-moon">Your vote has been cast.</p>
              <p className="text-sm text-moon-dim mt-2">
                Waiting for results...
              </p>
            </Card>
          ) : (
            <Card>
              <div className="space-y-2 mb-4">
                {nominees.map((n) => (
                  <button
                    key={n.playerId}
                    className={`w-full min-h-[44px] px-4 py-3 rounded-lg text-left transition-all ${
                      selectedVote === n.playerId
                        ? 'bg-blood text-white font-semibold ring-2 ring-blood-light'
                        : 'bg-charcoal hover:bg-charcoal-light text-moon'
                    }`}
                    onClick={() => setSelectedVote(n.playerId)}
                  >
                    {n.playerName}
                  </button>
                ))}
                <button
                  className={`w-full min-h-[44px] px-4 py-3 rounded-lg text-left transition-all ${
                    selectedVote === null && selectedVote !== undefined
                      ? 'bg-forest text-white font-semibold ring-2 ring-forest-light'
                      : 'bg-charcoal hover:bg-charcoal-light text-moon'
                  }`}
                  onClick={() => setSelectedVote(null)}
                >
                  No Lynch
                </button>
              </div>

              <Button
                variant="primary"
                className="w-full"
                onClick={submitVote}
              >
                Submit Vote
              </Button>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // Dead
  if (phase === 'dead') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-charcoal-dark">
        <div className="text-6xl mb-6">💀</div>
        <h2 className="text-2xl font-bold text-blood-light mb-2">
          You Have Been Eliminated
        </h2>
        {role && (
          <p className="text-moon-dim mb-6">
            You were the <span className="text-gold font-medium">{role.name}</span>
          </p>
        )}
        <Card className="w-full max-w-xs text-center">
          <p className="text-moon-dim text-sm">
            You are now a spectator. Do not reveal your role to living players.
          </p>
        </Card>
      </div>
    );
  }

  // Game Over
  if (phase === 'game_over') {
    const factionData: Record<string, { emoji: string; color: string; label: string; bg: string }> = {
      village: { emoji: '🏡', color: 'text-team-village', label: 'Village Wins!', bg: 'bg-team-village/10' },
      werewolf: { emoji: '🐺', color: 'text-team-werewolf', label: 'Werewolves Win!', bg: 'bg-team-werewolf/10' },
      vampire: { emoji: '🧛', color: 'text-team-vampire', label: 'Vampires Win!', bg: 'bg-team-vampire/10' },
      cult: { emoji: '🔮', color: 'text-team-cult', label: 'Cult Wins!', bg: 'bg-team-cult/10' },
      tanner: { emoji: '🎭', color: 'text-team-tanner', label: 'Tanner Wins!', bg: 'bg-team-tanner/10' },
      lovers: { emoji: '💘', color: 'text-team-vampire', label: 'Lovers Win!', bg: 'bg-team-vampire/10' },
    };
    const faction = winningTeam ? factionData[winningTeam] : null;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-7xl mb-4">{faction?.emoji || '🏆'}</div>
        <h2 className="text-3xl font-bold text-gold mb-2 text-center">Game Over</h2>
        {faction && (
          <Card className={`w-full max-w-sm text-center ${faction.bg} border-current ${faction.color} mt-4`}>
            <h3 className={`text-2xl font-bold ${faction.color} mb-2`}>
              {faction.label}
            </h3>
            {winReason && (
              <p className="text-moon-dim text-sm leading-relaxed">{winReason}</p>
            )}
          </Card>
        )}
        {role && (
          <p className="text-moon-dim text-sm mt-6">
            You were the <span className="text-gold font-medium">{role.name}</span>
          </p>
        )}
      </div>
    );
  }

  // Fallback
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <p className="text-moon-dim">Loading...</p>
    </div>
  );
  }; // end renderPhaseContent

  return (
    <>
      <div className={isTestMode ? (testPanelOpen ? 'pb-[60vh]' : 'pb-12') : ''}>
        {renderPhaseContent()}
      </div>
      {testPanel}
    </>
  );
}
