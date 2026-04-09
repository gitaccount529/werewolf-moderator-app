import { Server as SocketIOServer, Socket } from 'socket.io';
import { queryOne, run } from './db';
import type { Game } from './types';

interface SocketMeta {
  playerId: number | null;
  name: string;
  isModerator: boolean;
  gameCode: string;
}

// Track connected clients per game room
const rooms = new Map<string, Map<string, SocketMeta>>();

function getRoom(gameCode: string): Map<string, SocketMeta> {
  if (!rooms.has(gameCode)) {
    rooms.set(gameCode, new Map());
  }
  return rooms.get(gameCode)!;
}

function getRoomPlayers(gameCode: string) {
  const room = rooms.get(gameCode);
  if (!room) return [];
  return Array.from(room.values()).filter((m) => !m.isModerator);
}

export function setupSocketHandlers(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);
    let currentMeta: SocketMeta | null = null;

    // ─── Room Join ───────────────────────────────────────
    socket.on('room:join', (data: {
      gameCode: string;
      playerId?: number;
      name: string;
      isModerator: boolean;
    }) => {
      const { gameCode, playerId, name, isModerator } = data;
      const code = gameCode.toUpperCase();

      // Join Socket.IO room
      socket.join(code);

      const meta: SocketMeta = {
        playerId: playerId ?? null,
        name,
        isModerator,
        gameCode: code,
      };
      currentMeta = meta;

      const room = getRoom(code);
      room.set(socket.id, meta);

      // Update socket_id in DB for players
      if (playerId) {
        run('UPDATE players SET socket_id = ? WHERE id = ?', socket.id, playerId);
      }

      // Broadcast player list update to room
      io.to(code).emit('player:joined', {
        playerId,
        name,
        isModerator,
        socketId: socket.id,
        players: getRoomPlayers(code),
      });

      console.log(`[Socket] ${name} joined room ${code} (moderator: ${isModerator})`);
    });

    // ─── Game Start ──────────────────────────────────────
    socket.on('game:start', (data: { gameCode: string }) => {
      io.to(data.gameCode.toUpperCase()).emit('game:started', {});
    });

    // ─── Night Wake/Sleep ────────────────────────────────
    socket.on('night:wake', (data: {
      gameCode: string;
      targetSocketIds: string[];
      roleName: string;
      actionPrompt?: string;
    }) => {
      const { targetSocketIds, roleName, actionPrompt } = data;
      for (const sid of targetSocketIds) {
        io.to(sid).emit('night:wake', { roleName, actionPrompt });
      }
    });

    socket.on('night:sleep', (data: {
      gameCode: string;
      targetSocketIds: string[];
    }) => {
      for (const sid of data.targetSocketIds) {
        io.to(sid).emit('night:sleep', {});
      }
    });

    // ─── Night Action (player → moderator) ───────────────
    socket.on('night:action', (data: {
      gameCode: string;
      playerId: number;
      actionType: string;
      targetPlayerId?: number;
    }) => {
      const code = data.gameCode.toUpperCase();
      const room = rooms.get(code);
      if (!room) return;

      // Forward to moderator(s) in room
      for (const [sid, meta] of room) {
        if (meta.isModerator) {
          io.to(sid).emit('night:action:received', {
            playerId: data.playerId,
            actionType: data.actionType,
            targetPlayerId: data.targetPlayerId,
          });
        }
      }
    });

    // ─── Night Resolve ───────────────────────────────────
    socket.on('night:resolve', (data: {
      gameCode: string;
      deaths: { playerId: number; playerName: string; cause: string }[];
      announcements: string[];
    }) => {
      io.to(data.gameCode.toUpperCase()).emit('night:resolved', {
        deaths: data.deaths,
        announcements: data.announcements,
      });
    });

    // ─── Day Phase ───────────────────────────────────────
    socket.on('day:start', (data: {
      gameCode: string;
      deaths: { playerId: number; playerName: string; cause: string }[];
      announcements: string[];
    }) => {
      io.to(data.gameCode.toUpperCase()).emit('day:started', {
        deaths: data.deaths,
        announcements: data.announcements,
      });
    });

    // ─── Timer Sync ──────────────────────────────────────
    socket.on('day:timer:sync', (data: {
      gameCode: string;
      secondsRemaining: number;
      isPaused: boolean;
    }) => {
      socket.to(data.gameCode.toUpperCase()).emit('day:timer:sync', {
        secondsRemaining: data.secondsRemaining,
        isPaused: data.isPaused,
      });
    });

    // ─── Voting ──────────────────────────────────────────
    socket.on('day:vote:start', (data: {
      gameCode: string;
      nominees: { playerId: number; playerName: string }[];
    }) => {
      io.to(data.gameCode.toUpperCase()).emit('day:vote:started', {
        nominees: data.nominees,
      });
    });

    socket.on('day:vote:cast', (data: {
      gameCode: string;
      voterId: number;
      voterName: string;
      targetId: number | null; // null = no lynch
    }) => {
      io.to(data.gameCode.toUpperCase()).emit('day:vote:update', {
        voterId: data.voterId,
        voterName: data.voterName,
        targetId: data.targetId,
      });
    });

    socket.on('day:vote:result', (data: {
      gameCode: string;
      result: 'lynch' | 'no_lynch';
      targetId?: number;
      targetName?: string;
    }) => {
      io.to(data.gameCode.toUpperCase()).emit('day:vote:result', data);
    });

    // ─── Player Death ────────────────────────────────────
    socket.on('player:death', (data: {
      gameCode: string;
      playerId: number;
      playerName: string;
      cause: string;
    }) => {
      io.to(data.gameCode.toUpperCase()).emit('player:died', data);
    });

    // ─── Game End ────────────────────────────────────────
    socket.on('game:end', (data: {
      gameCode: string;
      winningTeam: string;
      reason: string;
    }) => {
      io.to(data.gameCode.toUpperCase()).emit('game:ended', data);
    });

    // ─── Disconnect ──────────────────────────────────────
    socket.on('disconnect', () => {
      if (currentMeta) {
        const room = rooms.get(currentMeta.gameCode);
        if (room) {
          room.delete(socket.id);

          // Clear socket_id in DB
          if (currentMeta.playerId) {
            run(
              'UPDATE players SET socket_id = NULL WHERE id = ? AND socket_id = ?',
              currentMeta.playerId,
              socket.id,
            );
          }

          // Broadcast departure
          io.to(currentMeta.gameCode).emit('player:left', {
            playerId: currentMeta.playerId,
            name: currentMeta.name,
            isModerator: currentMeta.isModerator,
            players: getRoomPlayers(currentMeta.gameCode),
          });

          // Clean up empty rooms
          if (room.size === 0) {
            rooms.delete(currentMeta.gameCode);
          }
        }
      }
      console.log(`[Socket] Disconnected: ${socket.id}`);
    });
  });
}
