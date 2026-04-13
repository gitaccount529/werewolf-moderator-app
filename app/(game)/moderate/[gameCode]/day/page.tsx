'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
// Real-time broadcasts are now handled by API routes (server-side Pusher)
// Timer sync deferred — player polling handles phase transitions
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Timer from '@/components/Timer';
import VotePanel from '@/components/VotePanel';
import GameLog from '@/components/GameLog';
import RosterPanel from '@/components/RosterPanel';
import GameSettingsPanel from '@/components/GameSettingsPanel';
import type { Player, DeathRecord } from '@/lib/types';

type DayPhase = 'summary' | 'mayor_election' | 'discussion' | 'voting' | 'result';

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
  // No socket needed — phase transitions broadcast via API routes

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

  // Rule Variations
  const [speedMode, setSpeedMode] = useState(false);
  const [mutedDead, setMutedDead] = useState(false);
  const [votingMode, setVotingMode] = useState<'standard' | 'closed_eyes' | 'big_brother' | 'elimination' | 'secret_ballot'>('standard');
  const [revealMode, setRevealMode] = useState<'full' | 'no_night' | 'wolf_team_only' | 'team_only' | 'none'>('full');
  const [mayorElection, setMayorElection] = useState(false);
  const [mayorPlayerId, setMayorPlayerId] = useState<number | null>(null);
  const [mayorNominees, setMayorNominees] = useState<Nominee[]>([]);
  const [mayorVotes, setMayorVotes] = useState<Vote[]>([]);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // No socket room join needed — broadcasts via API routes

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

      // Hydrate rule variations from metadata
      try {
        const meta = JSON.parse(data.game.metadata_json || '{}');
        if (meta.speed_mode) setSpeedMode(true);
        if (meta.muted_dead) setMutedDead(true);
        // Voting mode (with legacy compat)
        if (meta.voting_mode) setVotingMode(meta.voting_mode);
        else if (meta.closed_eyes_voting) setVotingMode('closed_eyes');
        // Reveal mode (with legacy compat)
        if (meta.reveal_mode) setRevealMode(meta.reveal_mode);
        else if (meta.no_role_reveal) setRevealMode('none');
        if (meta.mayor_election) setMayorElection(true);
        if (meta.mayor_player_id) setMayorPlayerId(meta.mayor_player_id);
      } catch { /* ignore */ }

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
      // Timer sync deferred — player side uses polling to detect phase changes
    },
    [gameCode],
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
    // Count votes (mayor's vote counts double)
    const voteCounts = new Map<number | null, number>();
    for (const v of votes) {
      const weight = (mayorPlayerId && v.voterId === mayorPlayerId) ? 2 : 1;
      voteCounts.set(v.targetId, (voteCounts.get(v.targetId) ?? 0) + weight);
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

    // Big Brother: tie = both eliminated (execute both via sequential lynch calls)
    if (votingMode === 'big_brother' && targets.length === 2 && targets[0] !== null && targets[1] !== null) {
      // Execute first lynch
      const res1 = await fetch(`/api/games/${gameCode}/lynch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPlayerId: targets[0] }),
      });
      const data1 = res1.ok ? await res1.json() : null;

      // Execute second lynch
      const res2 = await fetch(`/api/games/${gameCode}/lynch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPlayerId: targets[1] }),
      });
      const data2 = res2.ok ? await res2.json() : null;

      // Combine results
      const allChainDeaths = [...(data1?.chainDeaths || []), ...(data2?.chainDeaths || [])];
      setLynchResult({
        death: data1?.death || data2?.death || null,
        princeRevealed: data1?.princeRevealed || data2?.princeRevealed || false,
        tannerWin: data1?.tannerWin || data2?.tannerWin || false,
        chainDeaths: allChainDeaths,
        gameOver: data2?.gameOver || data1?.gameOver || false,
        winningTeam: data2?.winningTeam || data1?.winningTeam || null,
        winReason: data2?.winReason || data1?.winReason || null,
      });
      setPhase('result');
      const playersRes = await fetch(`/api/games/${gameCode}/players`);
      if (playersRes.ok) setPlayers(await playersRes.json());
      return;
    }

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

      // Vote result handled — player side uses polling for phase updates
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

      // Vote result handled — player side uses polling for phase updates
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

  // Format role display based on reveal mode and death context
  function formatRoleReveal(death: DeathRecord, isNightKill: boolean): string {
    const mode = revealMode;
    if (mode === 'full') return death.roleName || 'Unknown';
    if (mode === 'none') return 'Role not revealed';
    if (mode === 'no_night') {
      return isNightKill ? 'Role not revealed' : (death.roleName || 'Unknown');
    }
    if (mode === 'wolf_team_only') {
      return death.roleTeam === 'werewolf' ? 'Werewolf' : 'Not a Werewolf';
    }
    if (mode === 'team_only') {
      const team = death.roleTeam || 'unknown';
      return team.charAt(0).toUpperCase() + team.slice(1) + ' team';
    }
    return death.roleName || 'Unknown';
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
        <div className="flex items-center gap-2">
          <button onClick={() => setRosterOpen(true)} className="text-xs px-2.5 py-1.5 rounded-lg bg-charcoal text-moon-dim hover:text-moon hover:bg-charcoal-light transition-colors">Roster</button>
          <button onClick={() => setLogOpen(true)} className="text-xs px-2.5 py-1.5 rounded-lg bg-charcoal text-moon-dim hover:text-moon hover:bg-charcoal-light transition-colors">Log</button>
          <button onClick={() => setSettingsOpen(true)} className="text-xs px-2.5 py-1.5 rounded-lg bg-charcoal text-moon-dim hover:text-moon hover:bg-charcoal-light transition-colors">Settings</button>
          <span className="text-sm text-moon-dim capitalize ml-1">
            {phase}
          </span>
        </div>
      </div>

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
            onClick={() => {
              if (mayorElection && round === 1 && !mayorPlayerId) {
                setPhase('mayor_election');
              } else {
                setPhase('discussion');
              }
            }}
          >
            {mayorElection && round === 1 && !mayorPlayerId ? 'Begin Mayor Election' : 'Begin Discussion'}
          </Button>
        </div>
      )}

      {/* Mayor Election phase (first day only) */}
      {phase === 'mayor_election' && (
        <div className="space-y-6">
          <Card>
            <h3 className="text-lg font-semibold text-gold mb-3">Mayor Election</h3>
            <p className="text-sm text-moon-dim mb-4">
              Nominate candidates for mayor. The elected mayor&apos;s vote will count double during day voting.
            </p>

            {/* Mayor nominees */}
            {mayorNominees.length > 0 && (
              <div className="space-y-2 mb-4">
                {mayorNominees.map((n) => (
                  <div key={n.playerId} className="flex items-center justify-between bg-charcoal rounded-lg px-4 py-2.5">
                    <span className="text-moon font-medium">{n.playerName}</span>
                    <button
                      className="text-xs text-blood-light hover:text-blood"
                      onClick={() => setMayorNominees(mayorNominees.filter((mn) => mn.playerId !== n.playerId))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add nominee grid */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {alivePlayers
                .filter((p) => !mayorNominees.find((n) => n.playerId === p.id))
                .map((p) => (
                  <button
                    key={p.id}
                    className="min-h-[44px] px-4 py-2.5 rounded-lg text-left bg-charcoal hover:bg-charcoal-light text-moon transition-all"
                    onClick={() => setMayorNominees([...mayorNominees, { playerId: p.id, playerName: p.name }])}
                  >
                    {p.name}
                  </button>
                ))}
            </div>

            {/* Mayor vote recording */}
            {mayorNominees.length >= 2 && (
              <>
                <h4 className="text-sm text-moon-dim mb-2">Record mayor votes:</h4>
                <div className="space-y-2 mb-4 max-h-[200px] overflow-y-auto">
                  {alivePlayers.map((voter) => {
                    const existingVote = mayorVotes.find((v) => v.voterId === voter.id);
                    return (
                      <div key={voter.id} className="flex items-center gap-2">
                        <span className="text-sm text-moon w-24 truncate">{voter.name}:</span>
                        <select
                          className="flex-1 bg-charcoal-dark text-moon rounded-lg px-3 py-2 text-sm min-h-[36px]"
                          value={existingVote?.targetId ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            const targetId = val === '' ? null : parseInt(val);
                            setMayorVotes((prev) => {
                              const idx = prev.findIndex((v) => v.voterId === voter.id);
                              const newVote: Vote = { voterId: voter.id, voterName: voter.name, targetId };
                              if (idx >= 0) { const u = [...prev]; u[idx] = newVote; return u; }
                              return [...prev, newVote];
                            });
                          }}
                        >
                          <option value="">—</option>
                          {mayorNominees.map((n) => (
                            <option key={n.playerId} value={n.playerId}>{n.playerName}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>

                <Button
                  variant="primary"
                  className="w-full"
                  onClick={async () => {
                    // Tally mayor votes
                    const counts = new Map<number, number>();
                    for (const v of mayorVotes) {
                      if (v.targetId !== null) {
                        counts.set(v.targetId, (counts.get(v.targetId) ?? 0) + 1);
                      }
                    }
                    let winner: number | null = null;
                    let maxCount = 0;
                    let tied = false;
                    for (const [id, count] of counts) {
                      if (count > maxCount) { maxCount = count; winner = id; tied = false; }
                      else if (count === maxCount) { tied = true; }
                    }
                    if (tied || !winner) {
                      // Tie — pick first nominee with most votes as tiebreaker
                      winner = mayorNominees[0]?.playerId ?? null;
                    }
                    if (winner) {
                      setMayorPlayerId(winner);
                      await fetch(`/api/games/${gameCode}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'update_metadata', metadata: { mayor_player_id: winner } }),
                      });
                    }
                    setPhase('discussion');
                  }}
                >
                  Elect Mayor &amp; Begin Discussion
                </Button>
              </>
            )}

            {mayorNominees.length < 2 && (
              <p className="text-xs text-moon-dim text-center">Nominate at least 2 candidates to begin voting.</p>
            )}
          </Card>
        </div>
      )}

      {/* Discussion phase */}
      {phase === 'discussion' && (
        <div className="space-y-6">
          {/* Muted Dead reminder */}
          {mutedDead && deadPlayers.length > 0 && (
            <div className="bg-gold/10 border border-gold/30 rounded-xl p-3">
              <p className="text-sm text-gold font-medium">Muted Dead: Dead players cannot speak during discussion.</p>
            </div>
          )}

          {/* Mayor badge */}
          {mayorPlayerId && (
            <div className="bg-gold/10 border border-gold/30 rounded-xl p-3 flex items-center gap-2">
              <span className="text-lg">{'\u{1F451}'}</span>
              <p className="text-sm text-gold font-medium">
                Mayor: {players.find((p) => p.id === mayorPlayerId)?.name ?? 'Unknown'} (vote counts double)
              </p>
            </div>
          )}

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
              speedMode={speedMode}
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
            votingMode={votingMode}
            mayorPlayerId={mayorPlayerId}
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
                  Role: {formatRoleReveal(lynchResult.death, false)}
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
                    <p className="text-xs text-moon-dim">{formatRoleReveal(d, false)} — {d.cause}</p>
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

      {/* Overlay panels */}
      <RosterPanel gameCode={gameCode} isOpen={rosterOpen} onClose={() => setRosterOpen(false)} />
      <GameLog gameCode={gameCode} isOpen={logOpen} onClose={() => setLogOpen(false)} />
      <GameSettingsPanel gameCode={gameCode} isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
