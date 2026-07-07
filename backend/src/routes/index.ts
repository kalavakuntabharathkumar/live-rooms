import { Router, Request, Response } from 'express';
import roomsRouter from './rooms';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/rooms', roomsRouter);

export default router;
