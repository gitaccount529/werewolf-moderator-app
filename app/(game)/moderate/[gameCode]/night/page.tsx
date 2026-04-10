'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
// Socket.IO replaced with Pusher — wake/sleep signals sent via API route
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import NightStep from '@/components/NightStep';
import type { Role, Player, NightResolution } from '@/lib/types';

interface StepData {
  role: Role;
  actors: { id: number; name: string; socketId: string | null }[];
  order: number;
  nightOneOnly: boolean;
}

export default function NightPage() {
  const router = useRouter();
  const params = useParams();
  const gameCode = (params.gameCode as string).toUpperCase();
  // Helper: send wake/sleep signal to specific players via API
  async function sendNightSignal(action: 'wake' | 'sleep', playerIds: number[], roleName?: string) {
    await fetch(`/api/games/${gameCode}/night/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, playerIds, roleName }),
    });
  }

  const [round, setRound] = useState(0);
  const [steps, setSteps] = useState<StepData[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [alivePlayers, setAlivePlayers] = useState<{ id: number; name: string }[]>([]);
  const [lang] = useState<'en' | 'tl'>(() => {
    if (typeof window !== 'undefined') {
      return (sessionStorage.getItem('lang') as 'en' | 'tl') || 'en';
    }
    return 'en';
  });
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState<NightResolution | null>(null);
  const [allStepsComplete, setAllStepsComplete] = useState(false);
  const [itemRecipient, setItemRecipient] = useState<number | null>(null);
  const [itemAssigned, setItemAssigned] = useState(false);

  // No socket room needed — Pusher broadcasts are server-side via API routes

  // Fetch night steps
  useEffect(() => {
    async function load() {
      const [nightRes, gameRes] = await Promise.all([
        fetch(`/api/games/${gameCode}/night`),
        fetch(`/api/games/${gameCode}`),
      ]);

      if (nightRes.ok) {
        const data = await nightRes.json();
        setRound(data.round);
        setSteps(data.steps);
        setLoading(false);
      }

      if (gameRes.ok) {
        const data = await gameRes.json();
        // If not in night phase, redirect
        if (data.game.status === 'day') {
          router.push(`/moderate/${gameCode}/day`);
          return;
        }
        if (data.game.status === 'lobby') {
          router.push(`/moderate/${gameCode}/setup`);
          return;
        }

        setAlivePlayers(
          data.players
            .filter((p: Player) => p.is_alive === 1)
            .map((p: Player) => ({ id: p.id, name: p.name })),
        );
      }
    }
    load();
  }, [gameCode, router]);

  // Handle step action
  const handleAction = useCallback(
    async (action: { targetPlayerId?: number; actionType: string; secondTargetId?: number }) => {
      const step = steps[currentStepIndex];
      if (!step) return;

      const actor = step.actors[0]; // Primary actor

      // Record the action
      await fetch(`/api/games/${gameCode}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          round,
          roleId: step.role.id,
          actorPlayerId: actor.id,
          targetPlayerId: action.targetPlayerId,
          actionType: action.actionType,
        }),
      });

      // Handle Cupid lover link — store in metadata
      if (action.actionType === 'cupid_link' && action.secondTargetId) {
        await fetch(`/api/games/${gameCode}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_metadata',
            metadata: { lovers: [action.targetPlayerId, action.secondTargetId] },
          }),
        });
      }

      // Send sleep signal to actors via API
      const actorIds = step.actors.map((a) => a.id);
      sendNightSignal('sleep', actorIds);

      advanceStep();
    },
    [currentStepIndex, steps, gameCode, round],
  );

  function advanceStep() {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex >= steps.length) {
      setAllStepsComplete(true);
    } else {
      setCurrentStepIndex(nextIndex);

      // Wake up next role's players via API
      const nextStep = steps[nextIndex];
      const nextActorIds = nextStep.actors.map((a) => a.id);

      sendNightSignal('wake', nextActorIds, nextStep.role.name);
    }
  }

  function handleSkip() {
    const step = steps[currentStepIndex];
    if (step) {
      sendNightSignal('sleep', step.actors.map((a) => a.id));
    }
    advanceStep();
  }

  // Start first step wake signal
  useEffect(() => {
    if (steps.length > 0 && !loading && currentStepIndex === 0) {
      const firstStep = steps[0];
      sendNightSignal('wake', firstStep.actors.map((a) => a.id), firstStep.role.name);
    }
  }, [steps, loading, gameCode, currentStepIndex]);

  async function handleResolveNight() {
    setResolving(true);
    try {
      const res = await fetch(`/api/games/${gameCode}/night`, {
        method: 'POST',
      });

      if (res.ok) {
        const data: NightResolution = await res.json();
        setResolution(data);

        // Broadcast is now done by the API route when 'start_day' is called
      }
    } finally {
      setResolving(false);
    }
  }

  function handleContinueToDay() {
    // Transition game to day
    fetch(`/api/games/${gameCode}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start_day' }),
    }).then(() => {
      router.push(`/moderate/${gameCode}/day`);
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-moon-dim">Loading night phase...</p>
      </div>
    );
  }

  // Resolution view
  if (resolution) {
    const allDeaths = [...resolution.deaths, ...resolution.chainDeaths];

    return (
      <div className="min-h-screen p-4 md:p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gold mb-6 text-center">
          Night {round} Results
        </h1>

        {allDeaths.length === 0 ? (
          <Card className="text-center mb-6">
            <p className="text-lg text-moon">No one was killed tonight.</p>
          </Card>
        ) : (
          <div className="space-y-3 mb-6">
            {allDeaths.map((death) => (
              <Card key={death.playerId} className="border-blood/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-semibold text-blood-light">
                      {death.playerName}
                    </p>
                    <p className="text-sm text-moon-dim">
                      {death.roleName} &mdash; Killed by: {death.cause}
                    </p>
                  </div>
                  <span className="text-2xl">💀</span>
                </div>
              </Card>
            ))}
          </div>
        )}

        {resolution.announcements.length > 0 && (
          <Card className="mb-6">
            <h3 className="text-sm font-medium text-moon-dim mb-2">Announcements</h3>
            <ul className="space-y-1">
              {resolution.announcements.map((a, i) => (
                <li key={i} className="text-moon text-sm">{a}</li>
              ))}
            </ul>
          </Card>
        )}

        {/* Item Assignment Prompt */}
        {resolution.pendingItemAssignment && !itemAssigned && (
          <Card className="border-gold/30 mb-6">
            <h3 className="text-lg font-semibold text-gold mb-2">
              🥪 Sandwich Item
            </h3>
            <p className="text-sm text-moon-dim mb-3">
              <span className="text-blood-light font-medium">{resolution.firstDeathPlayerName}</span> was the first to fall to the wolves. They may give the Sandwich to another player — that player will survive one wolf attack.
            </p>
            <p className="text-sm text-moon-dim mb-3">Choose who receives the Sandwich:</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {alivePlayers
                .filter((p) => p.id !== resolution.firstDeathPlayerId)
                .map((p) => (
                  <button
                    key={p.id}
                    className={`min-h-[44px] px-4 py-2.5 rounded-lg text-left transition-all text-sm ${
                      itemRecipient === p.id
                        ? 'bg-gold text-charcoal-dark font-semibold ring-2 ring-gold'
                        : 'bg-charcoal hover:bg-charcoal-light text-moon'
                    }`}
                    onClick={() => setItemRecipient(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                className="flex-1"
                disabled={!itemRecipient}
                onClick={async () => {
                  await fetch(`/api/games/${gameCode}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'update_metadata',
                      metadata: {
                        items: [{ type: 'sandwich', holderPlayerId: itemRecipient, used: false }],
                      },
                    }),
                  });
                  setItemAssigned(true);
                }}
              >
                Assign Sandwich
              </Button>
              <Button variant="ghost" onClick={() => setItemAssigned(true)}>
                Skip
              </Button>
            </div>
          </Card>
        )}

        {resolution.gameOver ? (
          <div className="space-y-4">
            <Card className="border-gold/50 text-center">
              <h3 className="text-xl font-bold text-gold mb-2">Game Over!</h3>
              <p className="text-moon">{resolution.winReason}</p>
              <p className="text-gold font-semibold mt-2">
                {resolution.winningTeam?.toUpperCase()} wins!
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
          <Button
            variant="primary"
            className="w-full"
            onClick={handleContinueToDay}
          >
            Continue to Day Phase
          </Button>
        )}
      </div>
    );
  }

  // All steps complete — resolve
  if (allStepsComplete) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <Card className="w-full max-w-md text-center">
          <h2 className="text-2xl font-bold text-gold mb-4">
            All Roles Have Acted
          </h2>
          <p className="text-moon-dim mb-6">
            Night {round} is complete. Resolve the night to see what happened.
          </p>
          <Button
            variant="primary"
            className="w-full"
            onClick={handleResolveNight}
            loading={resolving}
          >
            Resolve Night
          </Button>
        </Card>
      </div>
    );
  }

  // Step wizard
  const currentStep = steps[currentStepIndex];

  if (!currentStep) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-moon-dim">No night roles to resolve.</p>
        <Button onClick={handleResolveNight} className="ml-4">
          Resolve Night
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-2xl mx-auto">
      {/* Progress */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold text-gold">
          Night {round}
        </h1>
        <span className="text-sm text-moon-dim">
          Step {currentStepIndex + 1} of {steps.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-charcoal-dark rounded-full h-1.5 mb-8">
        <div
          className="bg-gold rounded-full h-1.5 transition-all duration-300"
          style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
        />
      </div>

      {/* Current step */}
      <NightStep
        role={currentStep.role}
        actors={currentStep.actors}
        alivePlayers={alivePlayers}
        round={round}
        lang={lang}
        onAction={handleAction}
        onSkip={handleSkip}
      />
    </div>
  );
}
