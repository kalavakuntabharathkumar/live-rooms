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

### AWS ECS Fargate (via GitHub Actions)

Push to the `aws-deploy` branch — the workflow in `.github/workflows/deploy-aws.yml`
builds the Docker image, pushes it to Amazon ECR, and deploys it to an ECS Fargate
service. The existing Cloud Run pipeline on `main` is completely unaffected.

#### One-time AWS setup

| Resource | Detail |
|----------|--------|
| ECR repository | `live-rooms-api` |
| ECS cluster | `live-rooms-cluster` |
| ECS service | `live-rooms-api` |
| ECS task definition | `live-rooms-api` (container also named `live-rooms-api`) |
| AWS region | `us-east-1` (change `AWS_REGION` in the workflow to relocate) |

**Step 1 — Create the ECR repository**

```bash
aws ecr create-repository --repository-name live-rooms-api --region us-east-1
```

**Step 2 — Create the ECS task definition**

Register an initial task definition that references the ECR image and injects
secrets from AWS Secrets Manager.  The workflow patches only the image URI on
each deploy; all other settings (CPU, memory, IAM role, secrets) are preserved.

Minimum task definition (save as `task-def-bootstrap.json`, fill in your account ID):

```json
{
  "family": "live-rooms-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "live-rooms-api",
      "image": "YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/live-rooms-api:latest",
      "portMappings": [{ "containerPort": 8080, "protocol": "tcp" }],
      "environment": [
        { "name": "NODE_ENV",                    "value": "production" },
        { "name": "PORT",                        "value": "8080" },
        { "name": "FIRESTORE_ROOMS_COLLECTION",  "value": "rooms" },
        { "name": "FIRESTORE_MESSAGES_COLLECTION","value": "messages" },
        { "name": "ALLOWED_ORIGINS",             "value": "https://your-frontend.com" }
      ],
      "secrets": [
        { "name": "FIREBASE_PROJECT_ID",    "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:live-rooms/FIREBASE_PROJECT_ID" },
        { "name": "FIREBASE_CLIENT_EMAIL",  "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:live-rooms/FIREBASE_CLIENT_EMAIL" },
        { "name": "FIREBASE_PRIVATE_KEY",   "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:live-rooms/FIREBASE_PRIVATE_KEY" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/live-rooms-api",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

```bash
aws ecs register-task-definition --cli-input-json file://task-def-bootstrap.json
```

**Step 3 — Create the ECS cluster and service**

```bash
aws ecs create-cluster --cluster-name live-rooms-cluster

aws ecs create-service \
  --cluster live-rooms-cluster \
  --service-name live-rooms-api \
  --task-definition live-rooms-api \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-XXXXX],securityGroups=[sg-XXXXX],assignPublicIp=ENABLED}"
```

**Step 4 — Store secrets in AWS Secrets Manager**

```bash
aws secretsmanager create-secret --name live-rooms/FIREBASE_PROJECT_ID    --secret-string "your-project-id"
aws secretsmanager create-secret --name live-rooms/FIREBASE_CLIENT_EMAIL  --secret-string "firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com"
aws secretsmanager create-secret --name live-rooms/FIREBASE_PRIVATE_KEY   --secret-string "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

#### IAM permissions required

The ECS task execution role (`ecsTaskExecutionRole`) needs:

```json
{
  "Effect": "Allow",
  "Action": ["secretsmanager:GetSecretValue"],
  "Resource": "arn:aws:iam::YOUR_ACCOUNT_ID:secret:live-rooms/*"
}
```

The IAM user whose credentials are stored as GitHub secrets needs:

```json
{
  "Effect": "Allow",
  "Action": [
    "ecr:GetAuthorizationToken",
    "ecr:BatchCheckLayerAvailability",
    "ecr:InitiateLayerUpload",
    "ecr:UploadLayerPart",
    "ecr:CompleteLayerUpload",
    "ecr:PutImage",
    "ecs:DescribeTaskDefinition",
    "ecs:RegisterTaskDefinition",
    "ecs:UpdateService",
    "ecs:DescribeServices",
    "iam:PassRole"
  ],
  "Resource": "*"
}
```

#### GitHub Actions secrets required

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | Access key for the deployment IAM user |
| `AWS_SECRET_ACCESS_KEY` | Secret key for the deployment IAM user |

These are separate from the GCP secrets (`GCP_SA_KEY`, `GCP_PROJECT_ID`,
`FIREBASE_TOKEN`) — both sets can coexist in the same repository.

---

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
