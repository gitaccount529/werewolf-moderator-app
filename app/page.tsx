'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';

type Mode = 'home' | 'create' | 'join';

// Wrapper needed because useSearchParams requires Suspense in Next.js 15
export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const wasKicked = searchParams.get('kicked') === '1';
  const [mode, setMode] = useState<Mode>('home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Create game state
  const [gameName, setGameName] = useState('');
  const [pin, setPin] = useState('');
  const [gameMode, setGameMode] = useState<'classic' | 'one_night' | 'custom'>('classic');

  // Join game state
  const [gameCode, setGameCode] = useState('');
  const [playerName, setPlayerName] = useState('');

  async function handleCreate() {
    if (!gameName.trim()) {
      setError('Game name is required');
      return;
    }
    if (pin && pin.length !== 4) {
      setError('PIN must be exactly 4 digits');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: gameName.trim(), pin: pin || undefined, gameMode }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Store moderator info
      sessionStorage.setItem('moderatorPin', pin);
      sessionStorage.setItem('gameCode', data.code);

      router.push(`/moderate/${data.code}/setup`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game');
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (gameCode.length !== 4 || !playerName.trim()) {
      setError('Game code and player name are required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/games/${gameCode.toUpperCase()}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playerName.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sessionStorage.setItem('playerId', String(data.id));
      sessionStorage.setItem('playerName', playerName.trim());
      sessionStorage.setItem('gameCode', gameCode.toUpperCase());

      router.push(`/play/${gameCode.toUpperCase()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join game');
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'home') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6">
        <div className="text-6xl mb-6">🐺</div>
        <h1 className="text-4xl font-bold text-gold mb-2 tracking-wide text-center">
          Ultimate Werewolf
        </h1>
        <p className="text-moon-dim mb-4 text-lg text-center">
          Moderator &amp; Player Companion
        </p>
        {wasKicked && (
          <div className="bg-blood/20 border border-blood/30 rounded-lg px-4 py-3 mb-8 max-w-xs text-center">
            <p className="text-blood-light text-sm font-medium">You were removed from the game by the moderator.</p>
          </div>
        )}
        {!wasKicked && <div className="mb-8" />}
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <Button
            variant="primary"
            className="w-full text-lg"
            onClick={() => setMode('create')}
          >
            Create Game
          </Button>
          <Button
            variant="secondary"
            className="w-full text-lg"
            onClick={() => setMode('join')}
          >
            Join Game
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => router.push('/roles')}
          >
            Role Library
          </Button>
        </div>
      </main>
    );
  }

  if (mode === 'create') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <h2 className="text-2xl font-bold text-gold mb-6 text-center">
            Create Game
          </h2>

          <div className="flex flex-col gap-4">
            <Input
              label="Game Name"
              placeholder="Friday Night Werewolf"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              autoFocus
            />
            {/* Game Mode */}
            <div>
              <label className="block text-sm font-medium text-moon-dim mb-1.5">Game Mode</label>
              <div className="flex gap-2">
                {([
                  { key: 'classic' as const, label: 'Classic', desc: 'Multi-round' },
                  { key: 'one_night' as const, label: 'One Night', desc: 'Coming Soon' },
                  { key: 'custom' as const, label: 'Custom', desc: 'Free config' },
                ]).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors text-center ${
                      gameMode === m.key
                        ? 'bg-gold text-charcoal-dark'
                        : 'bg-charcoal-light text-moon-dim hover:text-moon border border-moon-dim/20'
                    } ${m.key === 'one_night' ? 'opacity-60' : ''}`}
                    onClick={() => setGameMode(m.key)}
                  >
                    {m.label}
                    <span className="block text-[10px] opacity-70 mt-0.5">{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <Input
              label="Moderator PIN (optional)"
              placeholder="4-digit PIN"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />

            {error && <p className="text-blood-light text-sm">{error}</p>}

            <Button
              variant="primary"
              className="w-full mt-2"
              onClick={handleCreate}
              loading={loading}
            >
              Create Game
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => { setMode('home'); setError(''); }}
            >
              Back
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  // mode === 'join'
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <h2 className="text-2xl font-bold text-gold mb-6 text-center">
          Join Game
        </h2>

        <div className="flex flex-col gap-4">
          <Input
            label="Game Code"
            placeholder="ABCD"
            maxLength={4}
            className="text-center text-2xl tracking-[0.3em] font-mono uppercase"
            value={gameCode}
            onChange={(e) => setGameCode(e.target.value.toUpperCase().slice(0, 4))}
            autoFocus
          />
          <Input
            label="Your Name"
            placeholder="Enter your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />

          {error && <p className="text-blood-light text-sm">{error}</p>}

          <Button
            variant="primary"
            className="w-full mt-2"
            onClick={handleJoin}
            loading={loading}
          >
            Join Game
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => { setMode('home'); setError(''); }}
          >
            Back
          </Button>
        </div>
      </Card>
    </main>
  );
}
