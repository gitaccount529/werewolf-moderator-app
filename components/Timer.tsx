'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Button from '@/components/ui/Button';

interface TimerProps {
  initialSeconds?: number;
  round?: number;
  decreasePerRound?: number; // seconds to subtract each round
  onComplete?: () => void;
  onSync?: (secondsRemaining: number, isPaused: boolean) => void;
}

export default function Timer({
  initialSeconds = 300,
  round = 1,
  decreasePerRound = 30,
  onComplete,
  onSync,
}: TimerProps) {
  // Auto-decrease timer each round: Day 1 = full, Day 2 = -30s, etc.
  const roundAdjusted = Math.max(60, initialSeconds - (round - 1) * decreasePerRound);
  const [customDuration, setCustomDuration] = useState(roundAdjusted);
  const [seconds, setSeconds] = useState(roundAdjusted);
  const [isPaused, setIsPaused] = useState(true);
  const [editing, setEditing] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update when round changes
  useEffect(() => {
    const adjusted = Math.max(60, initialSeconds - (round - 1) * decreasePerRound);
    setCustomDuration(adjusted);
    setSeconds(adjusted);
    setIsPaused(true);
  }, [round, initialSeconds, decreasePerRound]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isPaused && seconds > 0) {
      intervalRef.current = setInterval(() => {
        setSeconds((prev) => {
          const next = prev - 1;
          if (next <= 0) {
            clearTimer();
            onComplete?.();
            return 0;
          }
          return next;
        });
      }, 1000);
    } else {
      clearTimer();
    }

    return clearTimer;
  }, [isPaused, seconds, clearTimer, onComplete]);

  useEffect(() => {
    onSync?.(seconds, isPaused);
  }, [seconds, isPaused, onSync]);

  function togglePause() {
    setIsPaused((p) => !p);
  }

  function addMinute() {
    setSeconds((s) => s + 60);
  }

  function reset() {
    setSeconds(customDuration);
    setIsPaused(true);
  }

  function setDuration(totalSeconds: number) {
    const clamped = Math.max(60, Math.min(900, totalSeconds));
    setCustomDuration(clamped);
    setSeconds(clamped);
    setIsPaused(true);
    setEditing(false);
  }

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const progress = seconds / customDuration;
  const durationMins = Math.floor(customDuration / 60);

  return (
    <div className="text-center">
      {/* Duration config */}
      <div className="flex items-center justify-center gap-2 mb-3">
        <span className="text-xs text-moon-dim">
          Day {round}
        </span>
        {editing ? (
          <div className="flex items-center gap-1">
            {[2, 3, 4, 5, 7, 10].map((m) => (
              <button
                key={m}
                className={`text-xs px-2 py-1 rounded ${
                  customDuration === m * 60 ? 'bg-gold text-charcoal-dark' : 'bg-charcoal-dark text-moon-dim hover:text-moon'
                }`}
                onClick={() => setDuration(m * 60)}
              >
                {m}m
              </button>
            ))}
          </div>
        ) : (
          <button
            className="text-xs text-gold-dark hover:text-gold transition-colors"
            onClick={() => setEditing(true)}
          >
            {durationMins}min (tap to change)
          </button>
        )}
      </div>

      {/* Circular timer */}
      <div className="relative w-40 h-40 mx-auto mb-4">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50" cy="50" r="45"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="text-charcoal-dark"
          />
          <circle
            cx="50" cy="50" r="45"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeDasharray={`${2 * Math.PI * 45}`}
            strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress)}`}
            strokeLinecap="round"
            className={seconds <= 30 ? 'text-blood-light' : 'text-gold'}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-4xl font-mono font-bold ${seconds <= 30 ? 'text-blood-light' : 'text-moon'}`}>
            {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <Button variant="secondary" onClick={togglePause}>
          {isPaused ? 'Start' : 'Pause'}
        </Button>
        <Button variant="ghost" onClick={addMinute}>
          +1 min
        </Button>
        <Button variant="ghost" onClick={reset}>
          Reset
        </Button>
      </div>
    </div>
  );
}
