'use client';

import { useEffect, useState, useMemo } from 'react';
import { usePusher } from '@/hooks/usePusher';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface PlayerInfo {
  playerId: number | null;
  name: string;
  socketId?: string | null;
  roleTeam?: string | null;
  isAlive?: number;
}

type SortMode = 'join' | 'name' | 'faction';
type FilterMode = 'all' | 'alive' | 'dead';

interface PlayerListProps {
  gameCode: string;
  showKick?: boolean;
  showManualAdd?: boolean;
  showSort?: boolean;
  gameStarted?: boolean;
  onKick?: (playerId: number) => void;
  onPlayerAdded?: () => void;
}

const teamColors: Record<string, string> = {
  village: 'text-team-village',
  werewolf: 'text-team-werewolf',
  tanner: 'text-team-tanner',
  vampire: 'text-team-vampire',
  cult: 'text-team-cult',
  neutral: 'text-team-neutral',
};

export default function PlayerList({
  gameCode,
  showKick,
  showManualAdd,
  showSort = true,
  gameStarted,
  onKick,
  onPlayerAdded,
}: PlayerListProps) {
  const { subscribe } = usePusher();
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('join');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [addName, setAddName] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [kickConfirm, setKickConfirm] = useState<{ id: number; name: string } | null>(null);

  // Fetch initial player list + poll every 5s as safety net
  useEffect(() => {
    fetchPlayers();
    const interval = setInterval(fetchPlayers, 5000);
    return () => clearInterval(interval);
  }, [gameCode]);

  function fetchPlayers() {
    fetch(`/api/games/${gameCode}/players`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setPlayers(data.map((p: { id: number; name: string; socket_id?: string | null; is_alive?: number }) => ({
            playerId: p.id,
            name: p.name,
            socketId: p.socket_id,
            isAlive: p.is_alive,
          })));
        }
      });
  }

  // Listen for real-time updates via Pusher
  useEffect(() => {
    return subscribe(`game-${gameCode}`, {
      'player:joined': () => fetchPlayers(),
      'player:left': () => fetchPlayers(),
      'player:kicked': () => fetchPlayers(),
    });
  }, [gameCode, subscribe]);

  // Manual add player
  async function handleAddPlayer() {
    if (!addName.trim()) return;
    setAdding(true);
    setAddError('');

    try {
      const res = await fetch(`/api/games/${gameCode}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setAddName('');
      fetchPlayers();
      onPlayerAdded?.();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add');
    } finally {
      setAdding(false);
    }
  }

  // Sort & filter
  const displayPlayers = useMemo(() => {
    let list = [...players];

    // Filter
    if (filterMode === 'alive') list = list.filter((p) => p.isAlive !== 0);
    if (filterMode === 'dead') list = list.filter((p) => p.isAlive === 0);

    // Sort
    if (sortMode === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === 'faction' && gameStarted) {
      list.sort((a, b) => (a.roleTeam || 'z').localeCompare(b.roleTeam || 'z'));
    }

    return list;
  }, [players, sortMode, filterMode, gameStarted]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-moon">Players</h3>
        <span className="text-sm text-moon-dim bg-charcoal rounded-full px-3 py-1">
          {players.length}
        </span>
      </div>

      {/* Sort / Filter controls */}
      {showSort && players.length > 1 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {(['join', 'name'] as SortMode[]).concat(gameStarted ? ['faction'] : []).map((mode) => (
            <button
              key={mode}
              className={`text-[10px] px-2 py-1 rounded transition-colors capitalize
                ${sortMode === mode ? 'bg-gold text-charcoal-dark' : 'bg-charcoal-dark text-moon-dim hover:text-moon'}`}
              onClick={() => setSortMode(mode)}
            >
              {mode === 'join' ? 'Order' : mode}
            </button>
          ))}

          {gameStarted && (
            <>
              <span className="text-moon-dim/30 mx-1">|</span>
              {(['all', 'alive', 'dead'] as FilterMode[]).map((mode) => (
                <button
                  key={mode}
                  className={`text-[10px] px-2 py-1 rounded transition-colors capitalize
                    ${filterMode === mode ? 'bg-gold text-charcoal-dark' : 'bg-charcoal-dark text-moon-dim hover:text-moon'}`}
                  onClick={() => setFilterMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Player list */}
      {displayPlayers.length === 0 ? (
        <p className="text-moon-dim text-sm italic">
          {players.length === 0 ? 'Waiting for players to join...' : 'No players match filter.'}
        </p>
      ) : (
        <ul className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
          {displayPlayers.map((player, i) => {
            const isConnected = !!player.socketId;
            const isDead = player.isAlive === 0;

            return (
              <li
                key={player.playerId ?? i}
                className={`flex items-center justify-between bg-charcoal/50 rounded-lg px-4 py-2.5
                  ${isDead ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-forest-light' : 'bg-moon-dim/40'}`} />
                  <span className={`text-moon truncate ${isDead ? 'line-through' : ''}`}>
                    {player.name}
                  </span>
                  {player.roleTeam && gameStarted && (
                    <span className={`text-[10px] ${teamColors[player.roleTeam] || 'text-moon-dim'}`}>
                      {player.roleTeam}
                    </span>
                  )}
                  {!isConnected && !isDead && (
                    <span className="text-[10px] text-moon-dim/50">manual</span>
                  )}
                </div>
                {showKick && player.playerId && onKick && !gameStarted && (
                  <button
                    className="text-xs text-blood-light hover:text-blood transition-colors px-2 py-1 shrink-0"
                    onClick={() => setKickConfirm({ id: player.playerId!, name: player.name })}
                  >
                    Kick
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Manual add player */}
      {showManualAdd && !gameStarted && (
        <div className="mt-4 pt-3 border-t border-moon-dim/10">
          <div className="flex gap-2">
            <input
              className="flex-1 min-h-[36px] px-3 py-1.5 rounded-lg bg-charcoal-dark border border-moon-dim/20 text-moon text-sm placeholder:text-moon-dim/50 focus:outline-none focus:ring-1 focus:ring-gold/50"
              placeholder="Add player manually..."
              value={addName}
              onChange={(e) => { setAddName(e.target.value); setAddError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleAddPlayer()}
            />
            <button
              className="min-h-[36px] px-3 rounded-lg bg-gold text-charcoal-dark text-sm font-medium hover:bg-gold-light transition-colors disabled:opacity-50"
              onClick={handleAddPlayer}
              disabled={adding || !addName.trim()}
            >
              Add
            </button>
          </div>
          {addError && <p className="text-xs text-blood-light mt-1">{addError}</p>}
        </div>
      )}

      {/* Kick confirmation */}
      {kickConfirm && onKick && (
        <ConfirmDialog
          title="Kick Player"
          message={`Remove ${kickConfirm.name} from the game?`}
          confirmLabel="Kick"
          variant="danger"
          onConfirm={() => { onKick(kickConfirm.id); setKickConfirm(null); }}
          onCancel={() => setKickConfirm(null)}
        />
      )}
    </div>
  );
}
