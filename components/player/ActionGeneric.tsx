'use client';

import Button from '@/components/ui/Button';

interface ActionGenericProps {
  roleName: string;
  onDone: () => void;
}

export default function ActionGeneric({ roleName, onDone }: ActionGenericProps) {
  return (
    <div className="text-center space-y-6 p-6">
      <h3 className="text-xl font-bold text-gold">{roleName}</h3>
      <p className="text-moon-dim">
        You are awake. Perform your action as directed by the moderator.
      </p>
      <Button onClick={onDone} className="w-full">
        Done
      </Button>
    </div>
  );
}
