import http from 'http';
import { AddressInfo } from 'net';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';

// ── Firebase mock — factory must not reference outer variables ────────────
jest.mock('../config/firebase', () => ({
  auth: { verifyIdToken: jest.fn() },
  db: {
    collection: jest.fn(),
  },
  ROOMS_COLLECTION: 'rooms',
  MESSAGES_COLLECTION: 'messages',
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const firebaseMock = require('../config/firebase') as {
  auth: { verifyIdToken: jest.Mock };
  db: { collection: jest.Mock };
};

import { registerRoomSocket } from '../sockets/roomSocket';

// ── Helpers ───────────────────────────────────────────────────────────────

let testCounter = 0;
function uniqueRoom() {
  return `test-room-${++testCounter}`;
}

function waitForEvent<T = unknown>(
  socket: ClientSocket,
  event: string,
  timeoutMs = 4000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for "${event}"`)),
      timeoutMs
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function connectClient(port: number): ClientSocket {
  return ioClient(`http://localhost:${port}`, {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: false,
  });
}

function disconnectAll(...sockets: ClientSocket[]): Promise<void> {
  return new Promise((resolve) => {
    let pending = sockets.filter((s) => s.connected).length;
    if (pending === 0) return resolve();
    for (const s of sockets) {
      if (s.connected) {
        s.once('disconnect', () => {
          if (--pending === 0) resolve();
        });
        s.disconnect();
      }
    }
  });
}

// ── Firestore stub — roomSocket calls db.collection().doc().get() and
//    .doc().update() and .doc().collection().doc().set()  ─────────────────
function setupFirestoreStubs() {
  const mockSet = jest.fn().mockResolvedValue(undefined);
  const mockUpdate = jest.fn().mockResolvedValue(undefined);
  const mockGet = jest.fn().mockResolvedValue({
    exists: true,
    data: () => ({ isActive: true, name: 'Test Room' }),
  });
  const mockSubDoc = jest.fn().mockReturnValue({ set: mockSet });
  const mockSubCollection = jest.fn().mockReturnValue({ doc: mockSubDoc });
  const mockDoc = jest.fn().mockReturnValue({
    get: mockGet,
    update: mockUpdate,
    collection: mockSubCollection,
  });
  firebaseMock.db.collection.mockReturnValue({ doc: mockDoc });
}

// ── Test server lifecycle ─────────────────────────────────────────────────
let httpServer: http.Server;
let io: SocketIOServer;
let port: number;

beforeAll((done) => {
  httpServer = http.createServer();
  io = new SocketIOServer(httpServer, { transports: ['websocket'] });
  registerRoomSocket(io);
  httpServer.listen(0, () => {
    port = (httpServer.address() as AddressInfo).port;
    done();
  });
});

afterAll((done) => {
  io.close();
  httpServer.close(done);
});

beforeEach(() => {
  jest.clearAllMocks();
  setupFirestoreStubs();
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Socket.io — room events', () => {
  it('client can connect to the server', async () => {
    const client = connectClient(port);
    client.connect();
    await waitForEvent(client, 'connect');
    expect(client.connected).toBe(true);
    await disconnectAll(client);
  });

  it('join_room emits user_joined to existing room members', async () => {
    const roomId = uniqueRoom();

    firebaseMock.auth.verifyIdToken
      .mockResolvedValueOnce({ uid: 'u-alice', name: 'Alice' })
      .mockResolvedValueOnce({ uid: 'u-bob', name: 'Bob' });

    const alice = connectClient(port);
    alice.connect();
    await waitForEvent(alice, 'connect');
    alice.emit('join_room', { roomId, token: 'alice-token' });
    await waitForEvent(alice, 'room_members');

    // Register listener BEFORE Bob joins
    const userJoinedPromise = waitForEvent<{ uid: string; displayName: string }>(
      alice,
      'user_joined'
    );

    const bob = connectClient(port);
    bob.connect();
    await waitForEvent(bob, 'connect');
    bob.emit('join_room', { roomId, token: 'bob-token' });

    const joined = await userJoinedPromise;
    expect(joined.uid).toBe('u-bob');
    expect(joined.displayName).toBe('Bob');

    await disconnectAll(alice, bob);
  });

  it('send_message broadcasts new_message to all members in the room', async () => {
    const roomId = uniqueRoom();

    firebaseMock.auth.verifyIdToken
      .mockResolvedValueOnce({ uid: 'u-alice', name: 'Alice' }) // join
      .mockResolvedValueOnce({ uid: 'u-bob', name: 'Bob' })     // join
      .mockResolvedValueOnce({ uid: 'u-alice', name: 'Alice' }); // send_message

    const alice = connectClient(port);
    const bob = connectClient(port);

    alice.connect();
    await waitForEvent(alice, 'connect');
    alice.emit('join_room', { roomId, token: 'alice-token' });
    await waitForEvent(alice, 'room_members');

    bob.connect();
    await waitForEvent(bob, 'connect');
    bob.emit('join_room', { roomId, token: 'bob-token' });
    await waitForEvent(bob, 'room_members');

    const aliceMsg = waitForEvent<{ text: string; senderName: string }>(alice, 'new_message');
    const bobMsg   = waitForEvent<{ text: string; senderName: string }>(bob,   'new_message');

    alice.emit('send_message', { roomId, text: 'Hello everyone!', token: 'alice-token' });

    const [msgOnAlice, msgOnBob] = await Promise.all([aliceMsg, bobMsg]);
    expect(msgOnAlice.text).toBe('Hello everyone!');
    expect(msgOnAlice.senderName).toBe('Alice');
    expect(msgOnBob.text).toBe('Hello everyone!');
    expect(msgOnBob.senderName).toBe('Alice');

    await disconnectAll(alice, bob);
  });

  it('leave_room triggers user_left broadcast and updated room_members', async () => {
    const roomId = uniqueRoom(); // unique per test — avoids cross-test presence leak

    firebaseMock.auth.verifyIdToken
      .mockResolvedValueOnce({ uid: 'u-alice', name: 'Alice' })
      .mockResolvedValueOnce({ uid: 'u-bob',   name: 'Bob' });

    const alice = connectClient(port);
    const bob   = connectClient(port);

    alice.connect();
    await waitForEvent(alice, 'connect');
    alice.emit('join_room', { roomId, token: 'alice-token' });
    await waitForEvent(alice, 'room_members'); // Alice gets initial list

    bob.connect();
    await waitForEvent(bob, 'connect');
    bob.emit('join_room', { roomId, token: 'bob-token' });
    await waitForEvent(bob, 'room_members'); // Bob gets list with 2 members

    // Register listeners BEFORE Bob leaves so Alice receives both events
    const userLeftPromise    = waitForEvent<{ uid: string; displayName: string }>(alice, 'user_left');
    const updatedMembersPromise = waitForEvent<{ members: unknown[] }>(alice, 'room_members');

    bob.emit('leave_room', { roomId });

    const [left, members] = await Promise.all([userLeftPromise, updatedMembersPromise]);

    expect(left.uid).toBe('u-bob');
    expect(left.displayName).toBe('Bob');
    // Only Alice remains after Bob explicitly leaves
    expect(members.members.length).toBe(1);

    await disconnectAll(alice, bob);
  });
});
