import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// ── Triggered when a new room document is created ─────────────────────────
// Sends a push notification to all users who follow the creator
export const onRoomCreated = functions.firestore
  .document('rooms/{roomId}')
  .onCreate(async (snap, context) => {
    const room = snap.data();
    const roomId = context.params.roomId;

    functions.logger.info(`New room created: ${roomId}`, { room });

    try {
      // Fetch followers of the creator
      const followersSnap = await db
        .collection('users')
        .doc(room.createdBy)
        .collection('followers')
        .get();

      if (followersSnap.empty) {
        functions.logger.info('No followers to notify');
        return null;
      }

      // Collect FCM tokens for each follower
      const tokens: string[] = [];
      for (const followerDoc of followersSnap.docs) {
        const followerData = followerDoc.data();
        const fcmToken = followerData.fcmToken as string | undefined;
        if (fcmToken) tokens.push(fcmToken);
      }

      if (tokens.length === 0) {
        functions.logger.info('No FCM tokens found for followers');
        return null;
      }

      // Send multicast notification
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: '🏠 New room created!',
          body: `${room.createdByName} opened "${room.name}" — join now!`,
        },
        data: {
          roomId,
          roomName: room.name as string,
          type: 'room_created',
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'live_rooms',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
        apns: {
          payload: {
            aps: { sound: 'default', badge: 1 },
          },
        },
      });

      functions.logger.info(
        `Notifications sent: ${response.successCount} success, ${response.failureCount} failed`
      );

      return { successCount: response.successCount };
    } catch (err) {
      functions.logger.error('Error sending notifications', err);
      return null;
    }
  });

// ── Triggered when a room is deleted / deactivated ────────────────────────
// Cleans up the members subcollection and notifies active members
export const onRoomDeactivated = functions.firestore
  .document('rooms/{roomId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const roomId = context.params.roomId;

    // Only act on isActive: true → false transitions
    if (before.isActive === true && after.isActive === false) {
      functions.logger.info(`Room deactivated: ${roomId}`);

      // Notify active members via FCM
      const memberTokens: string[] = [];
      const members = (after.members as string[]) ?? [];

      for (const uid of members) {
        const userDoc = await db.collection('users').doc(uid).get();
        const fcmToken = userDoc.data()?.fcmToken as string | undefined;
        if (fcmToken) memberTokens.push(fcmToken);
      }

      if (memberTokens.length > 0) {
        await messaging.sendEachForMulticast({
          tokens: memberTokens,
          notification: {
            title: 'Room closed',
            body: `"${after.name as string}" has been closed by the host.`,
          },
          data: { roomId, type: 'room_closed' },
        });
      }
    }

    return null;
  });

// ── Saves/updates the user's FCM token on first sign-in ───────────────────
// Call this HTTP endpoint from the mobile app after obtaining a new token.
export const registerFcmToken = functions.https.onCall(
  async (data: { token: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be signed in'
      );
    }

    const { token } = data;
    if (!token) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'FCM token is required'
      );
    }

    await db.collection('users').doc(context.auth.uid).set(
      { fcmToken: token, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    return { success: true };
  }
);
