'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface JoinData {
  gameCode: string;
  playerId?: number;
  name: string;
  isModerator: boolean;
}

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  joinRoom: (data: JoinData) => void;
}

export const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
  joinRoom: () => {},
});

export function useSocket() {
  return useContext(SocketContext);
}

export function useSocketInstance() {
  const socketRef = useRef<Socket | null>(null);
  const lastJoinRef = useRef<JoinData | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = io({
      path: '/api/socketio',
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 20,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
      setIsConnected(true);

      // Auto-rejoin room on reconnect
      if (lastJoinRef.current) {
        console.log('[Socket] Auto-rejoining room:', lastJoinRef.current.gameCode);
        socket.emit('room:join', lastJoinRef.current);
      }
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Disconnected');
      setIsConnected(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const joinRoom = useCallback((data: JoinData) => {
    lastJoinRef.current = data;
    if (socketRef.current?.connected) {
      socketRef.current.emit('room:join', data);
    }
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    joinRoom,
  };
}
