import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';

const PORT = parseInt(process.env.PORT ?? '8080', 10);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '*').split(',');

const { httpServer } = createApp(ALLOWED_ORIGINS);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Live Rooms API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
});
