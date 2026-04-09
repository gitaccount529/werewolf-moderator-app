import { createServer } from 'http';
import { parse } from 'url';
import { networkInterfaces } from 'os';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { setupSocketHandlers } from './lib/socket';

function getLocalIP(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      // Skip internal/loopback and non-IPv4
      if (!net.internal && net.family === 'IPv4') {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(httpServer, {
    path: '/api/socketio',
    cors: {
      origin: dev ? '*' : false,
    },
  });

  setupSocketHandlers(io);

  httpServer.listen(port, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log(`> Werewolf app ready on http://localhost:${port}`);
    console.log(`> Players can join at http://${localIP}:${port}`);
  });
});
