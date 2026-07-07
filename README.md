# Live Rooms

A real-time chat and room management platform built with Node.js, Flutter, Firebase, and Socket.io — deployable to Google Cloud Run.

## Architecture

```
live-rooms/
├── backend/          # Node.js + Express + TypeScript + Socket.io API
├── mobile/           # Flutter mobile client (iOS & Android)
├── functions/        # Firebase Cloud Functions (push notifications)
└── .github/          # CI/CD workflows (Cloud Run deployment)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Node.js, Express, TypeScript |
| Real-time | Socket.io (WebSockets) |
| Mobile | Flutter (Dart) |
| Auth | Firebase Authentication (Email + Google) |
| Database | Cloud Firestore |
| Push Notifications | Firebase Cloud Messaging (FCM) |
| Functions | Firebase Cloud Functions |
| Deployment | Docker, Google Cloud Run |
| CI/CD | GitHub Actions + Cloud Build |

## Features

- 🏠 **Room Management** — Create, discover, and manage chat rooms
- ⚡ **Real-time Messaging** — Sub-second bi-directional messaging via Socket.io
- 👥 **Live Presence** — Real-time user join/leave events broadcast to all members
- 🔐 **Firebase Auth** — Secure email and Google sign-in
- 🔔 **Push Notifications** — FCM notifications on room events via Cloud Functions
- 📱 **Flutter Mobile** — Native iOS/Android client

## Quick Start

### Backend

```bash
cd backend
cp .env.example .env
# Fill in your Firebase credentials
npm install
npm run dev
```

### Flutter

```bash
cd mobile
flutter pub get
flutter run
```

### Firebase Functions

```bash
cd functions
npm install
firebase deploy --only functions
```

## Environment Variables

See `backend/.env.example` for required variables.

## Deployment

### Cloud Run (via GitHub Actions)

Push to `main` — the GitHub Actions workflow builds the Docker image and deploys to Cloud Run automatically.

### Manual Cloud Run Deploy

```bash
cd backend
docker build -t live-rooms-api .
docker tag live-rooms-api gcr.io/YOUR_PROJECT_ID/live-rooms-api
docker push gcr.io/YOUR_PROJECT_ID/live-rooms-api
gcloud run deploy live-rooms-api \
  --image gcr.io/YOUR_PROJECT_ID/live-rooms-api \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/rooms` | Create a new room |
| GET | `/api/rooms` | List all active rooms |
| GET | `/api/rooms/:id` | Get room details |
| DELETE | `/api/rooms/:id` | Delete a room |
| POST | `/api/rooms/:id/join` | Join a room |
| POST | `/api/rooms/:id/leave` | Leave a room |

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `join_room` | Client → Server | Join a room |
| `leave_room` | Client → Server | Leave a room |
| `send_message` | Client → Server | Send a message |
| `new_message` | Server → Client | Broadcast new message |
| `user_joined` | Server → Client | User joined notification |
| `user_left` | Server → Client | User left notification |
| `room_members` | Server → Client | Updated member list |
