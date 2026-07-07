export interface Room {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdByName: string;
  createdAt: FirebaseFirestore.Timestamp | Date;
  isActive: boolean;
  memberCount: number;
  members: string[];
}

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: FirebaseFirestore.Timestamp | Date;
}

export interface CreateRoomDto {
  name: string;
  description: string;
}

export interface SocketUser {
  uid: string;
  displayName: string;
  roomId?: string;
}

export interface JoinRoomPayload {
  roomId: string;
  token: string;
}

export interface SendMessagePayload {
  roomId: string;
  text: string;
  token: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        name?: string;
        email?: string;
      };
    }
  }
}
