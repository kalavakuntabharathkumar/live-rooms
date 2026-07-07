import request from 'supertest';
import express from 'express';

// ── jest.mock is hoisted — cannot reference outer `const` inside the factory.
// Create the mock fn inside the factory, then grab the reference after import.
jest.mock('../config/firebase', () => ({
  auth: { verifyIdToken: jest.fn() },
  db: {},
  ROOMS_COLLECTION: 'rooms',
  MESSAGES_COLLECTION: 'messages',
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { auth } = require('../config/firebase') as { auth: { verifyIdToken: jest.Mock } };
import { requireAuth } from '../middleware/auth';

// ── Minimal Express app that uses the middleware ──────────────────────────
function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.get('/protected', requireAuth, (req, res) => {
    res.json({ uid: req.user?.uid, name: req.user?.name });
  });
  return app;
}

describe('requireAuth middleware', () => {
  const app = buildTestApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes through and attaches user when token is valid', async () => {
    auth.verifyIdToken.mockResolvedValueOnce({
      uid: 'user-123',
      name: 'Alice',
      email: 'alice@example.com',
    });

    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ uid: 'user-123', name: 'Alice' });
    expect(auth.verifyIdToken).toHaveBeenCalledWith('valid-token');
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing or invalid/i);
    expect(auth.verifyIdToken).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header is not a Bearer token', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Basic dXNlcjpwYXNz');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing or invalid/i);
    expect(auth.verifyIdToken).not.toHaveBeenCalled();
  });

  it('returns 401 when token verification fails (expired/invalid)', async () => {
    auth.verifyIdToken.mockRejectedValueOnce(
      new Error('Firebase: token has expired')
    );

    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer expired-or-bad-token');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  it('returns 401 when token is the literal string "undefined"', async () => {
    auth.verifyIdToken.mockRejectedValueOnce(new Error('Invalid token'));

    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer undefined');

    expect(res.status).toBe(401);
  });
});
