'use client';

import { PusherContext, usePusherInstance } from '@/hooks/usePusher';

export default function PusherProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pusherValue = usePusherInstance();

  return (
    <PusherContext.Provider value={pusherValue}>
      {children}
    </PusherContext.Provider>
  );
}
