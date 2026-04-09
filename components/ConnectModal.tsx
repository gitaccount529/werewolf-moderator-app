'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Button from '@/components/ui/Button';

interface ConnectModalProps {
  gameCode: string;
  onClose: () => void;
}

export default function ConnectModal({ gameCode, onClose }: ConnectModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/play/${gameCode}`
    : '';

  useEffect(() => {
    if (!joinUrl) return;
    QRCode.toDataURL(joinUrl, {
      width: 240,
      margin: 2,
      color: { dark: '#e8e8e8', light: '#1a1a2e' },
    }).then(setQrDataUrl);
  }, [joinUrl]);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS
      const input = document.createElement('input');
      input.value = joinUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-charcoal-light rounded-2xl border border-moon-dim/20 p-6 max-w-sm w-full text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gold mb-1">Join This Game</h2>
        <p className="text-moon-dim text-sm mb-5">
          Scan the QR code or open the link on your phone
        </p>

        {/* QR Code */}
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="QR Code"
            className="mx-auto rounded-xl mb-5"
            width={240}
            height={240}
          />
        ) : (
          <div className="w-[240px] h-[240px] mx-auto mb-5 bg-charcoal rounded-xl animate-pulse" />
        )}

        {/* Game Code */}
        <div className="mb-4">
          <p className="text-xs text-moon-dim mb-1">Game Code</p>
          <p className="font-mono text-3xl text-gold tracking-[0.3em] font-bold">{gameCode}</p>
        </div>

        {/* URL + Copy */}
        <div className="flex items-center gap-2 bg-charcoal rounded-lg px-3 py-2 mb-5">
          <span className="text-xs text-moon-dim truncate flex-1 text-left">
            {joinUrl}
          </span>
          <button
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors shrink-0 ${
              copied
                ? 'bg-forest text-white'
                : 'bg-gold text-charcoal-dark hover:bg-gold-light'
            }`}
            onClick={copyUrl}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <Button variant="ghost" className="w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
