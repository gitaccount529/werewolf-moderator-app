'use client';

import { SocketContext, useSocketInstance } from '@/hooks/useSocket';

export default function SocketProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const socketValue = useSocketInstance();

  return (
    <SocketContext.Provider value={socketValue}>
      {children}
    </SocketContext.Provider>
  );
}
