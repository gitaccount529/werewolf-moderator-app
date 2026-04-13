'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface Nominee {
  playerId: number;
  playerName: string;
}

interface Vote {
  voterId: number;
  voterName: string;
  targetId: number | null; // null = no lynch
}

interface VotePanelProps {
  alivePlayers: { id: number; name: string }[];
  nominees: Nominee[];
  onAddNominee: (playerId: number) => void;
  onRemoveNominee: (playerId: number) => void;
  onRecordVote: (voterId: number, targetId: number | null) => void;
  onFinishVoting: () => void;
  votes: Vote[];
  votingMode?: 'standard' | 'closed_eyes' | 'big_brother' | 'elimination' | 'secret_ballot';
  mayorPlayerId?: number | null;
}

export default function VotePanel({
  alivePlayers,
  nominees,
  onAddNominee,
  onRemoveNominee,
  onRecordVote,
  onFinishVoting,
  votes,
  votingMode = 'standard',
  mayorPlayerId = null,
}: VotePanelProps) {
  const [nominateTarget, setNominateTarget] = useState<number | null>(null);
  const [votingActive, setVotingActive] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // Count votes per nominee (mayor's vote counts double)
  const voteCounts = new Map<number | null, number>();
  for (const v of votes) {
    const weight = (mayorPlayerId && v.voterId === mayorPlayerId) ? 2 : 1;
    voteCounts.set(v.targetId, (voteCounts.get(v.targetId) ?? 0) + weight);
  }

  const majority = Math.floor(alivePlayers.length / 2) + 1;
  const nonNominees = alivePlayers.filter(
    (p) => !nominees.find((n) => n.playerId === p.id),
  );

  const maxNominees = votingMode === 'big_brother' ? 2 : Infinity;
  const nomineesFull = nominees.length >= maxNominees;

  return (
    <div className="space-y-6">
      {/* Voting mode instruction */}
      {votingMode === 'elimination' && !votingActive && (
        <div className="bg-gold/10 border border-gold/30 rounded-xl p-4">
          <p className="text-sm font-semibold text-gold">Process of Elimination</p>
          <p className="text-xs text-moon-dim mt-1">
            One player declares another player safe. That safe player then declares another safe, and so on.
            The last player with their hand up is eliminated. Run this verbally, then record the result below.
          </p>
        </div>
      )}
      {votingMode === 'secret_ballot' && !votingActive && (
        <div className="bg-gold/10 border border-gold/30 rounded-xl p-4">
          <p className="text-sm font-semibold text-gold">Secret Ballot</p>
          <p className="text-xs text-moon-dim mt-1">
            Each player writes a name on paper. Collect and read ballots aloud, then record votes below.
            If tied, hold a re-vote among the tied players only. Second tie = all tied players eliminated.
          </p>
        </div>
      )}
      {votingMode === 'big_brother' && !votingActive && (
        <div className="bg-gold/10 border border-gold/30 rounded-xl p-4">
          <p className="text-sm font-semibold text-gold">Big Brother (Two Player Accusations)</p>
          <p className="text-xs text-moon-dim mt-1">
            The first 2 players accused and seconded are nominated. Players vote thumbs up (first) or
            thumbs down (second). If tied, both are eliminated.
          </p>
        </div>
      )}

      {/* Nomination phase */}
      {!votingActive && (
        <div>
          <h3 className="text-lg font-semibold text-moon mb-3">
            Nominations{votingMode === 'big_brother' ? ' (max 2)' : ''}
          </h3>

          {/* Current nominees */}
          {nominees.length > 0 && (
            <div className="space-y-2 mb-4">
              {nominees.map((n) => (
                <div
                  key={n.playerId}
                  className="flex items-center justify-between bg-charcoal rounded-lg px-4 py-2.5"
                >
                  <span className="text-moon font-medium">{n.playerName}</span>
                  <button
                    className="text-xs text-blood-light hover:text-blood"
                    onClick={() => onRemoveNominee(n.playerId)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add nominee */}
          {nonNominees.length > 0 && !nomineesFull && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              {nonNominees.map((p) => (
                <button
                  key={p.id}
                  className={`min-h-[44px] px-4 py-2.5 rounded-lg text-left transition-all
                    ${nominateTarget === p.id
                      ? 'bg-gold text-charcoal-dark font-semibold'
                      : 'bg-charcoal hover:bg-charcoal-light text-moon'
                    }`}
                  onClick={() => {
                    setNominateTarget(p.id);
                    onAddNominee(p.id);
                    setNominateTarget(null);
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {nominees.length > 0 && (
            <Button
              variant="primary"
              className="w-full"
              onClick={() => setVotingActive(true)}
            >
              Open Voting ({nominees.length} nominee{nominees.length !== 1 ? 's' : ''})
            </Button>
          )}
        </div>
      )}

      {/* Voting phase */}
      {votingActive && (
        <div>
          <h3 className="text-lg font-semibold text-moon mb-3">
            Voting (Majority: {majority})
          </h3>

          {/* Voting mode instructions */}
          {votingMode === 'closed_eyes' && (
            <div className="bg-gold/10 border border-gold/30 rounded-xl p-4 mb-4 text-center">
              <p className="text-lg font-semibold text-gold">Close Your Eyes!</p>
              <p className="text-xs text-moon-dim mt-1">
                Instruct all players to close their eyes. Call each nominee&apos;s name and ask for raised hands.
              </p>
            </div>
          )}
          {votingMode === 'big_brother' && (
            <div className="bg-gold/10 border border-gold/30 rounded-xl p-3 mb-4 text-center">
              <p className="text-xs text-gold">Thumbs UP = {nominees[0]?.playerName || '1st'} &nbsp;|&nbsp; Thumbs DOWN = {nominees[1]?.playerName || '2nd'}. Tie = both eliminated.</p>
            </div>
          )}
          {votingMode === 'secret_ballot' && (
            <div className="bg-gold/10 border border-gold/30 rounded-xl p-3 mb-4 text-center">
              <p className="text-xs text-gold">Record ballot results below. Tie = re-vote among tied only.</p>
            </div>
          )}

          {/* Vote tallies */}
          <div className="space-y-3 mb-4">
            {nominees.map((n) => {
              const count = voteCounts.get(n.playerId) ?? 0;
              const hasMajority = count >= majority;
              return (
                <div
                  key={n.playerId}
                  className={`rounded-lg px-4 py-3 border ${
                    hasMajority ? 'border-blood bg-blood/10' : 'border-moon-dim/10 bg-charcoal'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-moon">{n.playerName}</span>
                    <span className={`text-xl font-bold ${hasMajority ? 'text-blood-light' : 'text-gold'}`}>
                      {count}
                    </span>
                  </div>
                </div>
              );
            })}
            <div className="rounded-lg px-4 py-3 border border-moon-dim/10 bg-charcoal">
              <div className="flex items-center justify-between">
                <span className="font-medium text-moon-dim">No Lynch</span>
                <span className="text-xl font-bold text-moon-dim">
                  {voteCounts.get(null) ?? 0}
                </span>
              </div>
            </div>
          </div>

          {/* Manual vote recording */}
          <h4 className="text-sm text-moon-dim mb-2">Record votes manually:</h4>
          <div className="space-y-2 mb-4 max-h-[200px] overflow-y-auto">
            {alivePlayers.map((voter) => {
              const existingVote = votes.find((v) => v.voterId === voter.id);
              return (
                <div key={voter.id} className="flex items-center gap-2">
                  <span className="text-sm text-moon w-24 truncate">
                    {voter.name}{mayorPlayerId === voter.id ? ' \u{1F451}2x' : ''}:
                  </span>
                  <select
                    className="flex-1 bg-charcoal-dark text-moon rounded-lg px-3 py-2 text-sm min-h-[36px]"
                    value={existingVote?.targetId ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      onRecordVote(voter.id, val === '' ? null : val === 'no_lynch' ? null : parseInt(val));
                    }}
                  >
                    <option value="">—</option>
                    {nominees.map((n) => (
                      <option key={n.playerId} value={n.playerId}>
                        {n.playerName}
                      </option>
                    ))}
                    <option value="no_lynch">No Lynch</option>
                  </select>
                </div>
              );
            })}
          </div>

          <Button
            variant="danger"
            className="w-full"
            onClick={() => setShowCloseConfirm(true)}
          >
            Close Voting &amp; Tally
          </Button>

          {showCloseConfirm && (
            <ConfirmDialog
              title="Close Voting"
              message="Tally all votes and determine the result? This cannot be undone."
              confirmLabel="Close & Tally"
              variant="primary"
              onConfirm={() => { setShowCloseConfirm(false); onFinishVoting(); }}
              onCancel={() => setShowCloseConfirm(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
