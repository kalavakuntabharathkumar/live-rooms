import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { Server as SocketIOServer } from 'socket.io';

import apiRouter from './routes';
import { registerRoomSocket } from './sockets/roomSocket';

export interface AppInstance {
  app: express.Application;
  httpServer: http.Server;
  io: SocketIOServer;
}

export function createApp(allowedOrigins: string[] = ['*']): AppInstance {
  const app = express();
  const httpServer = http.createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: { origin: allowedOrigins, methods: ['GET', 'POST'], credentials: true },
    transports: ['websocket', 'polling'],
  });

  app.use(helmet());
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json());
  app.use(morgan('combined', { stream: { write: () => {} } })); // silent in tests

  app.use('/api', apiRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  registerRoomSocket(io);

  return { app, httpServer, io };
}
