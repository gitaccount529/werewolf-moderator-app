'use client';

import Button from './Button';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-charcoal-light rounded-xl border border-moon-dim/20 p-6 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-moon mb-2">{title}</h3>
        <p className="text-sm text-moon-dim mb-6">{message}</p>
        <div className="flex gap-3">
          <Button
            variant={variant}
            className="flex-1"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
          <Button variant="ghost" className="flex-1" onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
