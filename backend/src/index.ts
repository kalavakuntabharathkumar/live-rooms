import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';

import apiRouter from './routes';
import { registerRoomSocket } from './sockets/roomSocket';

dotenv.config();

const PORT = parseInt(process.env.PORT ?? '8080', 10);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '*').split(',');

const app = express();
const httpServer = http.createServer(app);

// ── Socket.io ──────────────────────────────────────────────────────────────
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan('combined'));

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api', apiRouter);

// ── 404 handler ────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Register Socket.io handlers ────────────────────────────────────────────
registerRoomSocket(io);

// ── Start server ───────────────────────────────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Live Rooms API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
});

export default app;
