'use client';

import { useState, useEffect } from 'react';

interface GameSettingsPanelProps {
  gameCode: string;
  isOpen: boolean;
  onClose: () => void;
}

interface Settings {
  reveal_mode: string;
  voting_mode: string;
  speed_mode: boolean;
  muted_dead: boolean;
  mayor_election: boolean;
  variable_roles: boolean;
  items_enabled: boolean;
}

const REVEAL_LABELS: Record<string, string> = {
  full: 'Full Reveal',
  no_night: 'No Night Reveal',
  wolf_team_only: 'Wolf Only',
  team_only: 'Team Only',
  none: 'No Reveal',
};

const VOTING_LABELS: Record<string, string> = {
  standard: 'Standard',
  closed_eyes: 'Closed Eyes',
  big_brother: 'Big Brother',
  elimination: 'Elimination',
  secret_ballot: 'Secret Ballot',
};

export default function GameSettingsPanel({ gameCode, isOpen, onClose }: GameSettingsPanelProps) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    (async () => {
      const res = await fetch(`/api/games/${gameCode}`);
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      try {
        const meta = JSON.parse(data.game.metadata_json || '{}');
        setSettings({
          reveal_mode: meta.reveal_mode || (meta.no_role_reveal ? 'none' : 'full'),
          voting_mode: meta.voting_mode || (meta.closed_eyes_voting ? 'closed_eyes' : 'standard'),
          speed_mode: !!meta.speed_mode,
          muted_dead: !!meta.muted_dead,
          mayor_election: !!meta.mayor_election,
          variable_roles: !!meta.variable_roles,
          items_enabled: !!meta.items_enabled,
        });
      } catch {
        setSettings(null);
      }
      setLoading(false);
    })();
  }, [isOpen, gameCode]);

  if (!isOpen) return null;

  return (
    <div className="fixed top-0 left-0 w-dvw h-dvh z-[100] bg-charcoal-dark flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-moon-dim/10">
        <div>
          <h2 className="text-xl font-bold text-gold">Game Settings</h2>
          <p className="text-xs text-moon-dim mt-0.5">Active rule variations for this game</p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-charcoal hover:bg-charcoal-light text-moon-dim hover:text-moon transition-colors text-xl"
        >
          &times;
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading || !settings ? (
          <p className="text-moon-dim text-center mt-8">Loading settings...</p>
        ) : (
          <div className="space-y-3 max-w-lg mx-auto">
            {/* Selector settings */}
            <SettingRow
              label="Role Revealing"
              value={REVEAL_LABELS[settings.reveal_mode] || settings.reveal_mode}
              highlight={settings.reveal_mode !== 'full'}
            />
            <SettingRow
              label="Voting Mode"
              value={VOTING_LABELS[settings.voting_mode] || settings.voting_mode}
              highlight={settings.voting_mode !== 'standard'}
            />

            <div className="border-t border-moon-dim/10 my-4" />

            {/* Toggle settings */}
            <ToggleRow label="Game Items" enabled={settings.items_enabled} />
            <ToggleRow label="Speed Mode" enabled={settings.speed_mode} />
            <ToggleRow label="Muted Dead" enabled={settings.muted_dead} />
            <ToggleRow label="Mayor Election" enabled={settings.mayor_election} />
            <ToggleRow label="Variable Roles" enabled={settings.variable_roles} />
          </div>
        )}
      </div>
    </div>
  );
}

function SettingRow({ label, value, highlight }: { label: string; value: string; highlight: boolean }) {
  return (
    <div className="flex items-center justify-between bg-charcoal-light/50 rounded-lg px-4 py-3 border border-moon-dim/5">
      <span className="text-sm text-moon">{label}</span>
      <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${
        highlight ? 'bg-gold/20 text-gold' : 'bg-charcoal text-moon-dim'
      }`}>
        {value}
      </span>
    </div>
  );
}

function ToggleRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between bg-charcoal-light/50 rounded-lg px-4 py-3 border border-moon-dim/5">
      <span className="text-sm text-moon">{label}</span>
      <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${
        enabled ? 'bg-forest/20 text-forest-light' : 'bg-charcoal text-moon-dim'
      }`}>
        {enabled ? 'ON' : 'OFF'}
      </span>
    </div>
  );
}
