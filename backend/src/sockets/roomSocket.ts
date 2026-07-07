import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { db, ROOMS_COLLECTION, MESSAGES_COLLECTION } from '../config/firebase';
import { verifySocketToken } from '../middleware/auth';
import { SocketUser, JoinRoomPayload, SendMessagePayload } from '../types';

// In-memory presence map: socketId → SocketUser
const connectedUsers = new Map<string, SocketUser>();

export function registerRoomSocket(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // ── join_room ──────────────────────────────────────────────────────────
    socket.on('join_room', async (payload: JoinRoomPayload) => {
      try {
        const { uid, name } = await verifySocketToken(payload.token);

        // Leave previous room if any
        const existing = connectedUsers.get(socket.id);
        if (existing?.roomId) {
          await leaveRoom(socket, io, existing.roomId, existing);
        }

        // Verify room exists
        const roomDoc = await db
          .collection(ROOMS_COLLECTION)
          .doc(payload.roomId)
          .get();
        if (!roomDoc.exists) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        const user: SocketUser = { uid, displayName: name, roomId: payload.roomId };
        connectedUsers.set(socket.id, user);

        socket.join(payload.roomId);

        // Notify room members
        io.to(payload.roomId).emit('user_joined', {
          uid,
          displayName: name,
          roomId: payload.roomId,
          timestamp: new Date().toISOString(),
        });

        // Send current member list
        const members = getRoomMembers(payload.roomId);
        io.to(payload.roomId).emit('room_members', { roomId: payload.roomId, members });

        // Update Firestore member count
        await db.collection(ROOMS_COLLECTION).doc(payload.roomId).update({
          memberCount: members.length,
        });

        console.log(`${name} joined room ${payload.roomId}`);
      } catch (err) {
        socket.emit('error', { message: 'Authentication failed' });
      }
    });

    // ── send_message ───────────────────────────────────────────────────────
    socket.on('send_message', async (payload: SendMessagePayload) => {
      try {
        const { uid, name } = await verifySocketToken(payload.token);
        const user = connectedUsers.get(socket.id);

        if (!user?.roomId || user.roomId !== payload.roomId) {
          socket.emit('error', { message: 'Not in this room' });
          return;
        }

        if (!payload.text?.trim()) {
          socket.emit('error', { message: 'Message cannot be empty' });
          return;
        }

        const messageId = uuidv4();
        const message = {
          id: messageId,
          roomId: payload.roomId,
          senderId: uid,
          senderName: name,
          text: payload.text.trim(),
          createdAt: new Date(),
        };

        // Persist to Firestore
        await db
          .collection(ROOMS_COLLECTION)
          .doc(payload.roomId)
          .collection(MESSAGES_COLLECTION)
          .doc(messageId)
          .set(message);

        // Broadcast to room
        io.to(payload.roomId).emit('new_message', {
          ...message,
          createdAt: message.createdAt.toISOString(),
        });
      } catch (err) {
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // ── leave_room ─────────────────────────────────────────────────────────
    socket.on('leave_room', async (payload: { roomId: string }) => {
      const user = connectedUsers.get(socket.id);
      if (user) {
        await leaveRoom(socket, io, payload.roomId, user);
        user.roomId = undefined;
      }
    });

    // ── disconnect ─────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const user = connectedUsers.get(socket.id);
      if (user?.roomId) {
        await leaveRoom(socket, io, user.roomId, user);
      }
      connectedUsers.delete(socket.id);
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function leaveRoom(
  socket: Socket,
  io: Server,
  roomId: string,
  user: SocketUser
): Promise<void> {
  socket.leave(roomId);

  io.to(roomId).emit('user_left', {
    uid: user.uid,
    displayName: user.displayName,
    roomId,
    timestamp: new Date().toISOString(),
  });

  const members = getRoomMembers(roomId);
  io.to(roomId).emit('room_members', { roomId, members });

  try {
    await db.collection(ROOMS_COLLECTION).doc(roomId).update({
      memberCount: members.length,
    });
  } catch {
    // best-effort
  }
}

function getRoomMembers(roomId: string): SocketUser[] {
  return Array.from(connectedUsers.values()).filter(
    (u) => u.roomId === roomId
  );
}
