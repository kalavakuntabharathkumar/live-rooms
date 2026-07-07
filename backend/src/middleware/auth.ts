import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decoded = await auth.verifyIdToken(idToken);
    req.user = {
      uid: decoded.uid,
      name: decoded.name ?? decoded.email ?? 'Anonymous',
      email: decoded.email,
    };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export async function verifySocketToken(token: string): Promise<{
  uid: string;
  name: string;
}> {
  const decoded = await auth.verifyIdToken(token);
  return {
    uid: decoded.uid,
    name: decoded.name ?? decoded.email ?? 'Anonymous',
  };
}
