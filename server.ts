// Custom Node server: Next.js + Socket.IO in one process. The server is authoritative for all game state.
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from './src/lib/protocol';
import { RoomManager } from './src/server/room-manager';
import { createStore } from './src/server/store';

const dev = process.argv.includes('--dev');
if (!dev) (process.env as Record<string, string>).NODE_ENV = 'production';
const port = parseInt(process.env.PORT ?? '3000', 10);
const hostname = '0.0.0.0';

async function main() {
  const { default: next } = await import('next');
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: manager?.rooms.size ?? 0 }));
      return;
    }
    void handle(req, res);
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    pingInterval: 10_000,
    pingTimeout: 8_000,
    maxHttpBufferSize: 64 * 1024,
  });

  const store = await createStore();
  const manager: RoomManager = new RoomManager(io as never, store);
  await manager.start();
  io.on('connection', (socket) => manager.attach(socket as never));

  httpServer.listen(port, hostname, () => {
    console.log(`> Whisper Market ready on http://localhost:${port} (${dev ? 'dev' : 'production'})`);
  });

  const shutdown = async (sig: string) => {
    console.log(`[server] ${sig} received, saving rooms…`);
    try {
      await manager.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
