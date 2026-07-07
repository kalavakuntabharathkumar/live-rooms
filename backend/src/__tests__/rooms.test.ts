import request from 'supertest';

// ── jest.mock() is hoisted — variable references in the factory must either
// be literals or be defined INSIDE the factory. Define mocks as jest.fn()
// inside the factory, then grab references after import.

const MOCK_ROOM_ID = 'room-123'; // plain const — safe to use in jest.mock
const MOCK_USER_ID = 'user-abc';
const MOCK_USER_NAME = 'Test User';

const mockRoomData = {
  name: 'Test Room',
  description: 'A test room',
  createdBy: MOCK_USER_ID,
  createdByName: MOCK_USER_NAME,
  createdAt: new Date().toISOString(),
  isActive: true,
  memberCount: 0,
  members: [],
};

// ── Firebase config mock ───────────────────────────────────────────────────
jest.mock('../config/firebase', () => ({
  auth: { verifyIdToken: jest.fn() },
  db: {
    collection: jest.fn(),
    runTransaction: jest.fn(),
  },
  ROOMS_COLLECTION: 'rooms',
  MESSAGES_COLLECTION: 'messages',
}));

// ── UUID mock — use a literal inside the factory (no outer variable) ───────
jest.mock('uuid', () => ({ v4: jest.fn() }));

// ── Grab references after import ─────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const firebaseMock = require('../config/firebase') as {
  auth: { verifyIdToken: jest.Mock };
  db: { collection: jest.Mock; runTransaction: jest.Mock };
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const uuidMock = require('uuid') as { v4: jest.Mock };

import { createApp } from '../app';

// ── Chainable Firestore query mock builder ────────────────────────────────
function makeFirestoreMock() {
  const mockGet = jest.fn();
  const mockSet = jest.fn().mockResolvedValue(undefined);
  const mockUpdate = jest.fn().mockResolvedValue(undefined);

  const mockSubCollectionGet = jest.fn().mockResolvedValue({ docs: [] });
  const mockSubCollection = jest.fn().mockReturnValue({
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: mockSubCollectionGet,
  });

  const mockDocRef = {
    get: mockGet,
    set: mockSet,
    update: mockUpdate,
    collection: mockSubCollection,
  };

  const mockDoc = jest.fn().mockReturnValue(mockDocRef);

  const mockCollectionRef = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: mockGet,
    doc: mockDoc,
  };

  const mockRunTransaction = jest.fn().mockImplementation(async (fn: Function) => {
    return fn({ get: mockGet, update: mockUpdate });
  });

  return { mockGet, mockSet, mockUpdate, mockDoc, mockCollectionRef, mockRunTransaction };
}

describe('REST API — /api', () => {
  const { app } = createApp();
  const validAuthHeader = 'Bearer valid-firebase-token';

  let fs: ReturnType<typeof makeFirestoreMock>;

  beforeEach(() => {
    jest.clearAllMocks();

    fs = makeFirestoreMock();
    firebaseMock.db.collection.mockReturnValue(fs.mockCollectionRef);
    firebaseMock.db.runTransaction.mockImplementation(fs.mockRunTransaction);
    uuidMock.v4.mockReturnValue(MOCK_ROOM_ID);

    firebaseMock.auth.verifyIdToken.mockResolvedValue({
      uid: MOCK_USER_ID,
      name: MOCK_USER_NAME,
      email: 'test@example.com',
    });
  });

  // ── Health ────────────────────────────────────────────────────────────────

  describe('GET /api/health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ok' });
      expect(typeof res.body.timestamp).toBe('string');
    });
  });

  // ── GET /api/rooms ────────────────────────────────────────────────────────

  describe('GET /api/rooms', () => {
    it('returns a list of active rooms', async () => {
      fs.mockGet.mockResolvedValueOnce({
        docs: [{ id: MOCK_ROOM_ID, data: () => mockRoomData }],
      });

      const res = await request(app).get('/api/rooms');
      expect(res.status).toBe(200);
      expect(res.body.rooms).toHaveLength(1);
      expect(res.body.rooms[0]).toMatchObject({
        id: MOCK_ROOM_ID,
        name: 'Test Room',
        isActive: true,
      });
    });

    it('returns an empty list when no rooms exist', async () => {
      fs.mockGet.mockResolvedValueOnce({ docs: [] });
      const res = await request(app).get('/api/rooms');
      expect(res.status).toBe(200);
      expect(res.body.rooms).toEqual([]);
    });
  });

  // ── GET /api/rooms/:id ────────────────────────────────────────────────────

  describe('GET /api/rooms/:id', () => {
    it('returns 200 with room data for a valid id', async () => {
      fs.mockGet.mockResolvedValueOnce({
        exists: true,
        id: MOCK_ROOM_ID,
        data: () => mockRoomData,
      });

      const res = await request(app).get(`/api/rooms/${MOCK_ROOM_ID}`);
      expect(res.status).toBe(200);
      expect(res.body.room).toMatchObject({ id: MOCK_ROOM_ID, name: 'Test Room' });
    });

    it('returns 404 for a non-existent room', async () => {
      fs.mockGet.mockResolvedValueOnce({ exists: false });
      const res = await request(app).get('/api/rooms/does-not-exist');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Room not found');
    });
  });

  // ── POST /api/rooms ───────────────────────────────────────────────────────

  describe('POST /api/rooms', () => {
    it('creates a room and returns 201 with room data', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .set('Authorization', validAuthHeader)
        .send({ name: 'My Room', description: 'A cool room' });

      expect(res.status).toBe(201);
      expect(res.body.room).toMatchObject({
        id: MOCK_ROOM_ID,
        name: 'My Room',
        description: 'A cool room',
        isActive: true,
        memberCount: 0,
      });
      expect(fs.mockCollectionRef.doc).toHaveBeenCalledWith(MOCK_ROOM_ID);
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .set('Authorization', validAuthHeader)
        .send({ description: 'No name' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Room name is required');
    });

    it('returns 400 when name is an empty string', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .set('Authorization', validAuthHeader)
        .send({ name: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Room name is required');
    });

    it('returns 401 when Authorization header is missing', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({ name: 'Room without auth' });

      expect(res.status).toBe(401);
    });
  });

  // ── DELETE /api/rooms/:id ─────────────────────────────────────────────────

  describe('DELETE /api/rooms/:id', () => {
    it('soft-deletes a room when the requester is the creator', async () => {
      fs.mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ ...mockRoomData, createdBy: MOCK_USER_ID }),
      });

      const res = await request(app)
        .delete(`/api/rooms/${MOCK_ROOM_ID}`)
        .set('Authorization', validAuthHeader);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Room deleted');
      expect(fs.mockUpdate).toHaveBeenCalledWith({ isActive: false });
    });

    it('returns 403 when requester is not the creator', async () => {
      fs.mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ ...mockRoomData, createdBy: 'someone-else' }),
      });

      const res = await request(app)
        .delete(`/api/rooms/${MOCK_ROOM_ID}`)
        .set('Authorization', validAuthHeader);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/creator/i);
    });

    it('returns 404 when room does not exist', async () => {
      fs.mockGet.mockResolvedValueOnce({ exists: false });

      const res = await request(app)
        .delete(`/api/rooms/${MOCK_ROOM_ID}`)
        .set('Authorization', validAuthHeader);

      expect(res.status).toBe(404);
    });
  });
});
