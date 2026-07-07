import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, ROOMS_COLLECTION, MESSAGES_COLLECTION } from '../config/firebase';
import { requireAuth } from '../middleware/auth';
import { CreateRoomDto, Room } from '../types';

const router = Router();

// GET /api/rooms — list all active rooms
router.get('/', async (_req: Request, res: Response) => {
  try {
    const snapshot = await db
      .collection(ROOMS_COLLECTION)
      .where('isActive', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const rooms: Room[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<Room, 'id'>),
    }));

    res.json({ rooms });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// GET /api/rooms/:id — get room details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const doc = await db.collection(ROOMS_COLLECTION).doc(req.params.id).get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.json({ room: { id: doc.id, ...doc.data() } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch room' });
  }
});

// POST /api/rooms — create a room
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { name, description }: CreateRoomDto = req.body;

  if (!name?.trim()) {
    res.status(400).json({ error: 'Room name is required' });
    return;
  }

  try {
    const roomId = uuidv4();
    const room: Omit<Room, 'id'> = {
      name: name.trim(),
      description: description?.trim() ?? '',
      createdBy: req.user!.uid,
      createdByName: req.user!.name ?? 'Anonymous',
      createdAt: new Date(),
      isActive: true,
      memberCount: 0,
      members: [],
    };

    await db.collection(ROOMS_COLLECTION).doc(roomId).set(room);

    res.status(201).json({ room: { id: roomId, ...room } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// POST /api/rooms/:id/join — join a room
router.post('/:id/join', requireAuth, async (req: Request, res: Response) => {
  const roomRef = db.collection(ROOMS_COLLECTION).doc(req.params.id);

  try {
    await db.runTransaction(async (t) => {
      const doc = await t.get(roomRef);
      if (!doc.exists) throw new Error('Room not found');
      const data = doc.data() as Room;
      const members = data.members ?? [];
      if (!members.includes(req.user!.uid)) {
        t.update(roomRef, {
          members: [...members, req.user!.uid],
          memberCount: members.length + 1,
        });
      }
    });
    res.json({ message: 'Joined room' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to join room';
    res.status(msg === 'Room not found' ? 404 : 500).json({ error: msg });
  }
});

// POST /api/rooms/:id/leave — leave a room
router.post('/:id/leave', requireAuth, async (req: Request, res: Response) => {
  const roomRef = db.collection(ROOMS_COLLECTION).doc(req.params.id);

  try {
    await db.runTransaction(async (t) => {
      const doc = await t.get(roomRef);
      if (!doc.exists) throw new Error('Room not found');
      const data = doc.data() as Room;
      const members = (data.members ?? []).filter(
        (uid) => uid !== req.user!.uid
      );
      t.update(roomRef, { members, memberCount: members.length });
    });
    res.json({ message: 'Left room' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to leave room';
    res.status(msg === 'Room not found' ? 404 : 500).json({ error: msg });
  }
});

// DELETE /api/rooms/:id — delete (deactivate) a room
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const roomRef = db.collection(ROOMS_COLLECTION).doc(req.params.id);

  try {
    const doc = await roomRef.get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    const data = doc.data() as Room;
    if (data.createdBy !== req.user!.uid) {
      res.status(403).json({ error: 'Only the room creator can delete it' });
      return;
    }
    await roomRef.update({ isActive: false });
    res.json({ message: 'Room deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

// GET /api/rooms/:id/messages — fetch recent messages
router.get('/:id/messages', requireAuth, async (req: Request, res: Response) => {
  try {
    const snapshot = await db
      .collection(ROOMS_COLLECTION)
      .doc(req.params.id)
      .collection(MESSAGES_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const messages = snapshot.docs.reverse().map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

export default router;
