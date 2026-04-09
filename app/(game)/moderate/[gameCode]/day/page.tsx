'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Timer from '@/components/Timer';
import VotePanel from '@/components/VotePanel';
import GameLog from '@/components/GameLog';
import type { Player, DeathRecord } from '@/lib/types';

type DayPhase = 'summary' | 'discussion' | 'voting' | 'result';

interface Nominee {
  playerId: number;
  playerName: string;
}

interface Vote {
  voterId: number;
  voterName: string;
  targetId: number | null;
}

export default function DayPage() {
  const router = useRouter();
  const params = useParams();
  const gameCode = (params.gameCode as string).toUpperCase();
  const { socket, isConnected, joinRoom } = useSocket();

  const [round, setRound] = useState(0);
  const [players, setPlayers] = useState<(Player & { role_name?: string; role_team?: string })[]>([]);
  const [phase, setPhase] = useState<DayPhase>('summary');
  const [deaths, setDeaths] = useState<DeathRecord[]>([]);
  const [announcements, setAnnouncements] = useState<string[]>([]);
  const [nominees, setNominees] = useState<Nominee[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [lynchResult, setLynchResult] = useState<{
    death: DeathRecord | null;
    princeRevealed: boolean;
    tannerWin: boolean;
    chainDeaths: DeathRecord[];
    gameOver: boolean;
    winningTeam: string | null;
    winReason: string | null;
  } | null>(null);

  // Join socket room
  useEffect(() => {
    if (isConnected) {
      joinRoom({ gameCode, name: 'Moderator', isModerator: true });
    }
  }, [isConnected, gameCode, joinRoom]);

  // Load game state
  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/games/${gameCode}`);
      if (!res.ok) return;

      const data = await res.json();
      setRound(data.game.current_round);

      // If not in day phase, redirect
      if (data.game.status === 'night') {
        router.push(`/moderate/${gameCode}/night`);
        return;
      }

      // Enrich players with role info
      const enrichedPlayers = data.players.map((p: Player) => {
        const gr = data.gameRoles?.find((gr: { role_id: number }) => {
          // We'd need player_roles data — fetch separately if needed
          return false;
        });
        return p;
      });

      setPlayers(data.players);

      // Load recent deaths from game log
      const logRes = await fetch(`/api/games/${gameCode}/log`);
      if (logRes.ok) {
        const logEntries = await logRes.json();
        const nightDeaths = logEntries
          .filter((e: { round: number; event_type: string }) =>
            e.round === data.game.current_round &&
            (e.event_type === 'death' || e.event_type === 'chain_death'),
          )
          .map((e: { details_json: string }) => {
            try {
              return JSON.parse(e.details_json);
            } catch {
              return null;
            }
          })
          .filter(Boolean);

        setDeaths(nightDeaths);
      }
    }
    load();
  }, [gameCode, router]);

  // Timer sync
  const handleTimerSync = useCallback(
    (secondsRemaining: number, isPaused: boolean) => {
      socket?.emit('day:timer:sync', { gameCode, secondsRemaining, isPaused });
    },
    [socket, gameCode],
  );

  // Nomination handlers
  function addNominee(playerId: number) {
    const player = players.find((p) => p.id === playerId);
    if (!player || nominees.find((n) => n.playerId === playerId)) return;
    setNominees([...nominees, { playerId, playerName: player.name }]);
  }

  function removeNominee(playerId: number) {
    setNominees(nominees.filter((n) => n.playerId !== playerId));
  }

  function recordVote(voterId: number, targetId: number | null) {
    const voter = players.find((p) => p.id === voterId);
    if (!voter) return;

    setVotes((prev) => {
      const existing = prev.findIndex((v) => v.voterId === voterId);
      const newVote: Vote = { voterId, voterName: voter.name, targetId };
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = newVote;
        return updated;
      }
      return [...prev, newVote];
    });
  }

  // Finish voting and tally
  async function finishVoting() {
    // Count votes
    const voteCounts = new Map<number | null, number>();
    for (const v of votes) {
      voteCounts.set(v.targetId, (voteCounts.get(v.targetId) ?? 0) + 1);
    }

    // Find the target with most votes
    let maxVotes = 0;
    let targets: (number | null)[] = [];

    for (const [targetId, count] of voteCounts) {
      if (count > maxVotes) {
        maxVotes = count;
        targets = [targetId];
      } else if (count === maxVotes) {
        targets.push(targetId);
      }
    }

    const majority = Math.floor(alivePlayers.length / 2) + 1;

    // Tie or no majority — no lynch
    if (targets.length !== 1 || targets[0] === null || maxVotes < majority) {
      setLynchResult({
        death: null,
        princeRevealed: false,
        tannerWin: false,
        chainDeaths: [],
        gameOver: false,
        winningTeam: null,
        winReason: null,
      });
      setPhase('result');

      socket?.emit('day:vote:result', {
        gameCode,
        result: 'no_lynch',
      });
      return;
    }

    // Execute lynch
    const res = await fetch(`/api/games/${gameCode}/lynch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPlayerId: targets[0] }),
    });

    if (res.ok) {
      const data = await res.json();
      setLynchResult(data);
      setPhase('result');

      // Re-fetch players
      const playersRes = await fetch(`/api/games/${gameCode}/players`);
      if (playersRes.ok) {
        setPlayers(await playersRes.json());
      }

      socket?.emit('day:vote:result', {
        gameCode,
        result: data.death ? 'lynch' : 'no_lynch',
        targetId: data.death?.playerId,
        targetName: data.death?.playerName,
      });
    }
  }

  // Transition to night
  async function startNight() {
    const res = await fetch(`/api/games/${gameCode}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start_night' }),
    });

    if (res.ok) {
      router.push(`/moderate/${gameCode}/night`);
    }
  }

  const alivePlayers = players.filter((p) => p.is_alive === 1);
  const deadPlayers = players.filter((p) => p.is_alive === 0);

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gold">
          Day {round}
        </h1>
        <span className="text-sm text-moon-dim capitalize">
          {phase}
        </span>
      </div>

      <GameLog gameCode={gameCode} />

      {/* Summary phase */}
      {phase === 'summary' && (
        <div className="space-y-6">
          <Card>
            <h3 className="text-lg font-semibold text-moon mb-4">Night Results</h3>
            {deaths.length === 0 ? (
              <p className="text-moon-dim">No one was killed during the night.</p>
            ) : (
              <div className="space-y-3">
                {deaths.map((d) => (
                  <div key={d.playerId} className="flex items-center justify-between bg-blood/10 rounded-lg px-4 py-3 border border-blood/20">
                    <div>
                      <p className="font-semibold text-blood-light">{d.playerName}</p>
                      <p className="text-sm text-moon-dim">Cause: {d.cause}</p>
                    </div>
                    <span className="text-xl">💀</span>
                  </div>
                ))}
              </div>
            )}

            {announcements.length > 0 && (
              <div className="mt-4 pt-4 border-t border-moon-dim/10">
                {announcements.map((a, i) => (
                  <p key={i} className="text-sm text-gold-dark">{a}</p>
                ))}
              </div>
            )}
          </Card>

          <Button
            variant="primary"
            className="w-full"
            onClick={() => setPhase('discussion')}
          >
            Begin Discussion
          </Button>
        </div>
      )}

      {/* Discussion phase */}
      {phase === 'discussion' && (
        <div className="space-y-6">
          {/* Player status */}
          <Card>
            <h3 className="text-lg font-semibold text-moon mb-3">
              Alive Players ({alivePlayers.length})
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {alivePlayers.map((p) => (
                <div key={p.id} className="flex items-center gap-2 bg-charcoal/50 rounded-lg px-3 py-2">
                  <div className="w-2 h-2 rounded-full bg-forest-light" />
                  <span className="text-moon text-sm">{p.name}</span>
                </div>
              ))}
            </div>

            {deadPlayers.length > 0 && (
              <>
                <h3 className="text-lg font-semibold text-moon-dim mt-4 mb-3">
                  Dead ({deadPlayers.length})
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {deadPlayers.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 bg-charcoal/50 rounded-lg px-3 py-2 opacity-50">
                      <span className="text-sm">💀</span>
                      <span className="text-moon-dim text-sm line-through">{p.name}</span>
                      <span className="text-xs text-moon-dim">R{p.death_round}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {/* Timer */}
          <Card>
            <h3 className="text-lg font-semibold text-moon mb-4 text-center">
              Discussion Timer
            </h3>
            <Timer
              initialSeconds={300}
              round={round}
              decreasePerRound={30}
              onSync={handleTimerSync}
            />
          </Card>

          <Button
            variant="primary"
            className="w-full"
            onClick={() => setPhase('voting')}
          >
            Open Nominations
          </Button>
        </div>
      )}

      {/* Voting phase */}
      {phase === 'voting' && (
        <Card>
          <VotePanel
            alivePlayers={alivePlayers.map((p) => ({ id: p.id, name: p.name }))}
            nominees={nominees}
            onAddNominee={addNominee}
            onRemoveNominee={removeNominee}
            onRecordVote={recordVote}
            onFinishVoting={finishVoting}
            votes={votes}
          />
        </Card>
      )}

      {/* Result phase */}
      {phase === 'result' && lynchResult && (
        <div className="space-y-6">
          <Card className={lynchResult.death ? 'border-blood/30' : 'border-gold/30'}>
            {lynchResult.princeRevealed ? (
              <div className="text-center">
                <span className="text-4xl mb-3 block">👑</span>
                <h3 className="text-xl font-bold text-gold">The Prince Is Revealed!</h3>
                <p className="text-moon-dim mt-2">
                  The accused revealed their royal status and survived the lynch.
                </p>
              </div>
            ) : lynchResult.death ? (
              <div className="text-center">
                <span className="text-4xl mb-3 block">⚖️</span>
                <h3 className="text-xl font-bold text-blood-light">
                  {lynchResult.death.playerName} was lynched
                </h3>
                <p className="text-moon-dim mt-2">
                  Role: {lynchResult.death.roleName}
                </p>
              </div>
            ) : (
              <div className="text-center">
                <h3 className="text-xl font-bold text-moon">No Lynch</h3>
                <p className="text-moon-dim mt-2">
                  The village could not reach a consensus.
                </p>
              </div>
            )}
          </Card>

          {/* Chain deaths */}
          {lynchResult.chainDeaths.length > 0 && (
            <Card className="border-blood/20">
              <h3 className="text-sm font-medium text-moon-dim mb-3">Chain Reactions</h3>
              {lynchResult.chainDeaths.map((d) => (
                <div key={d.playerId} className="flex items-center gap-3 py-2">
                  <span>💀</span>
                  <div>
                    <p className="text-blood-light font-medium">{d.playerName}</p>
                    <p className="text-xs text-moon-dim">{d.roleName} — {d.cause}</p>
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* Game over or continue */}
          {lynchResult.gameOver ? (
            <div className="space-y-4">
              <Card className="border-gold/50 text-center">
                <h3 className="text-xl font-bold text-gold mb-2">Game Over!</h3>
                <p className="text-moon">{lynchResult.winReason}</p>
                <p className="text-gold font-semibold mt-2 uppercase">
                  {lynchResult.winningTeam} wins!
                </p>
              </Card>
              <Button
                variant="primary"
                className="w-full"
                onClick={async () => {
                  const res = await fetch('/api/games', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: 'Rematch', copyFrom: gameCode }),
                  });
                  const data = await res.json();
                  if (data.code) router.push(`/moderate/${data.code}/setup`);
                }}
              >
                Play Again (Same Party)
              </Button>
            </div>
          ) : (
            <Button variant="primary" className="w-full" onClick={startNight}>
              Begin Night {round + 1}
            </Button>
          )}
        </div>
      )}

      {/* Bottom spacer */}
      <div className="h-8" />
    </div>
  );
}
