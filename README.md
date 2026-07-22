<div align="center">

#  Recordly

**Browser-native recording studio — real-time video calls with per-participant local recording and automated server-side post-production.**

[![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![mediasoup](https://img.shields.io/badge/mediasoup-SFU-4B32C3?style=flat-square)](https://mediasoup.org/)
[![Prisma 7](https://img.shields.io/badge/Prisma-7-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![BullMQ](https://img.shields.io/badge/BullMQ-Redis-DC382D?style=flat-square&logo=redis&logoColor=white)](https://docs.bullmq.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)](#license)

[Features](#features) · [Architecture](#architecture) · [Quick Start](#quick-start) · [Deployment](#deployment) · [API Reference](#api-reference) · [Contributing](#contributing)

</div>

---

## The Problem

Existing video conferencing tools (Zoom, Google Meet) record the **compressed, degraded WebRTC stream** — the same one you see on your call. This means network hiccups, low-bitrate encoding, and resolution drops all bake directly into the final recording.

**Recordly takes a different approach.** Each participant records their own **raw camera + microphone feed** locally via the MediaRecorder API, while still participating in a live video call. The raw recordings are uploaded to S3 and combined server-side with FFmpeg into a single synchronized output — giving you studio-quality results from a browser tab.

---

## Features

| Category | Feature | Details |
|:---|:---|:---|
| 🎥 **Live Calls** | mediasoup SFU | Selective Forwarding Unit for low-latency, multi-party video calls |
| 🔴 **Recording** | Per-participant local capture | Raw `MediaStream` recording via `MediaRecorder` — zero WebRTC compression artifacts |
| ⏱️ **Sync** | Server-generated shared timestamp | Frame-accurate alignment across all participants via `sharedStartTime` |
| 📤 **Upload** | Chunked multipart S3 upload | 5 MB chunk streaming with presigned URLs — handles large recordings reliably |
| 🎬 **Post-production** | Automated FFmpeg pipeline | `xstack` grid layout with `tpad`/`adelay` offset-aware sync, `libx264` + AAC output |
| ⚙️ **Job Queue** | BullMQ on Redis | Async combine processing with exponential backoff retries (3 attempts) |
| 🔗 **Rooms** | Invite-code system | Auto-generated invite codes with shareable links; email invitations via Resend |
| 🔐 **Auth** | Passwordless email login | NextAuth.js v4 with JWT sessions, Prisma adapter, and Resend transactional email |
| 📊 **Dashboard** | Room management | Create rooms, track recording status, view/download combined outputs |
| 🐳 **Deployment** | Docker + CI/CD | Dockerized mediasoup SFU + FFmpeg worker; GitHub Actions builds to GHCR |

---

## Architecture

The system is composed of **three independently deployable services**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER (per participant)                      │
│                                                                             │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────────────┐  │
│  │  getUserMedia()  │    │  mediasoup-client│    │    MediaRecorder      │  │
│  │  (camera + mic)  │───>|  (live SFU call) │    │  (local raw capture)  │  │
│  └──────────────────┘    └────────┬─────────┘    └──────────┬────────────┘  │
│                                   │                         │               │
│                            WebRTC (RTP)           Chunked upload (HTTPS)    │
│                                   │                         │               │
└───────────────────────────────────┼─────────────────────────┼───────────────┘
                                    │                         │
                  ┌─────────────────▼──────────┐              │
                  │   SERVICE 2: mediasoup SFU │              │
                  │   (Docker on EC2/Railway)  │              │
                  │                            │              │
                  │   • Socket.io signaling    │              │
                  │   • WebRTC transport mgmt  │              │
                  │   • Producer/Consumer relay│              │
                  │   • UDP ports 20000–20050  │              │
                  └────────────────────────────┘              │
                                                              │
                  ┌───────────────────────────────────────────▼───────────
                  │           SERVICE 1: Next.js App (server.js)          │
                  │                                                       │
                  │   • Custom HTTPS + Socket.io server                   │
                  │   • App Router pages (dashboard, rooms, recordings)   │
                  │   • REST API (room CRUD, upload init, presigned URLs) │
                  │   • NextAuth.js (email magic links via Resend)        │
                  │   • BullMQ producer (enqueues combine jobs)           │
                  │                                                       │
                  │           ┌──────────┐    ┌──────────────┐            │
                  │           │ Prisma 7 │    │   AWS S3     │            │
                  │           │ (PG/Neon)│    │  raw/        │            │
                  │           └──────────┘    │  combined/   │            │
                  │                           └──────────────┘            │
                  └─────────────────────────────┬─────────────────────────┘
                                                │
                              BullMQ job via Redis (Upstash / local)
                                                │
                  ┌─────────────────────────────▼──────────────────────────┐
                  │           SERVICE 3: FFmpeg Worker (Docker)            │
                  │                                                        │
                  │   • BullMQ consumer on "combine-queue"                 │
                  │   • Downloads participant recordings from S3           │
                  │   • Builds dynamic xstack filter (N-way grid)          │
                  │   • Offset-aware sync via tpad + adelay                │
                  │   • Uploads combined MP4 back to S3                    │
                  │   • Concurrency: 2 (tunable per instance size)         │
                  │   • Graceful SIGTERM handling for zero-downtime deploys│
                  └────────────────────────────────────────────────────────┘
```

### Recording Flow (step by step)

```
1. Host clicks "Start Recording"
   └──▶ Socket.io emits `start-recording`

2. Server generates sharedStartTime (ms epoch)
   └──▶ Broadcasts to ALL participants in the room

3. Each browser starts MediaRecorder on localStream
   └──▶ ondataavailable fires every 5s, buffered until ≥5 MB

4. 5 MB chunks uploaded via S3 multipart presigned URLs
   └──▶ init-upload → part-url → PUT to S3 → save-etag

5. Host clicks "Stop Recording"
   └──▶ Final chunk flushed + upload completed
   └──▶ POST /api/recordings/{id}/complete

6. When all participants' uploads complete:
   └──▶ combineQueue.add('combine', { roomId })

7. Worker processes the job:
   └──▶ Downloads all WebM files from S3
   └──▶ FFmpeg xstack: N-way grid at 1280×720, libx264 CRF 23
   └──▶ Uploads combined MP4 to S3 under combined/{roomId}/

8. Room.combineStatus transitions: PENDING → PROCESSING → READY
   └──▶ Dashboard polls /api/rooms/{id}/combined for status
```

---

## Tech Stack

| Layer | Technology | Purpose |
|:---|:---|:---|
| **Framework** | Next.js 16 (App Router) | SSR, API routes, file-based routing |
| **Runtime** | React 19, TypeScript 5 | UI components, type safety |
| **Styling** | Tailwind CSS v4 | Utility-first styling |
| **Real-time (signaling)** | Socket.io 4 | WebRTC signaling + recording coordination |
| **Video Calls** | mediasoup 3 (SFU) + mediasoup-client | Scalable multi-party media relay |
| **Recording** | MediaRecorder API | Browser-side raw stream capture |
| **Object Storage** | AWS S3 (multipart upload) | Raw recordings, combined outputs |
| **Transcoding** | FFmpeg via `fluent-ffmpeg` | WebM → MP4, xstack composition |
| **Job Queue** | BullMQ + Redis/Upstash | Async combine pipeline with retries |
| **Database** | PostgreSQL (Neon-compatible) | Users, rooms, recordings, upload parts |
| **ORM** | Prisma 7 | Type-safe DB access, migrations |
| **Auth** | NextAuth.js v4 (JWT) | Passwordless email magic links |
| **Email** | Resend | Transactional email delivery |
| **HTTPS (dev)** | `selfsigned` | Self-signed certs for `getUserMedia` |
| **CI/CD** | GitHub Actions | Automated Docker builds → GHCR |
| **Containerization** | Docker | mediasoup SFU + FFmpeg worker images |

---

## Database Schema

```
User ──────────────────────────────────────────────────
│  id, name, email, emailVerified, image
│  createdAt, updatedAt
│
├── has many → Account (NextAuth OAuth — auto-managed)
├── has many → Session (NextAuth sessions — auto-managed)
├── has many → Room (as host, via "HostRooms")
├── has many → Recording
└── many-to-many → Room (as participant, via "RoomParticipants")

Room ──────────────────────────────────────────────────
│  id, name, description, inviteCode (unique)
│  status: WAITING | LIVE | ENDED
│  combineStatus: PENDING | PROCESSING | READY | FAILED
│  combinedS3Key, combinedUrl
│  hostId → User, createdAt, updatedAt, endedAt
│
├── has many → Recording
└── many-to-many → User (participants)

Recording ─────────────────────────────────────────────
│  id, fileName, s3Key, cdnUrl, mimeType
│  status: UPLOADING | PROCESSING | READY | FAILED
│  duration, fileSize (BigInt), startTime (shared sync)
│  s3UploadId, uploadComplete
│  roomId → Room, userId → User
│
├── has many → VideoQuality
└── has many → UploadPart

VideoQuality ──────────────────────────────────────────
│  id, label (1080p/720p/etc), width, height, bitrate
│  s3Key, cdnUrl, hlsUrl, fileSize
│  recordingId → Recording

UploadPart ────────────────────────────────────────────
   id, recordingId, partNumber, etag
   @@unique([recordingId, partNumber])
```

---

## Quick Start

### Prerequisites

| Requirement | Version | Notes |
|:---|:---|:---|
| **Node.js** | 18+ | LTS recommended |
| **PostgreSQL** | 14+ | Local or hosted ([Neon](https://neon.tech/), Supabase, etc.) |
| **Redis** | 6+ | Local via Docker or hosted ([Upstash](https://upstash.com/)) |
| **AWS Account** | — | S3 bucket with appropriate IAM permissions |
| **FFmpeg** | 6+ | Required for the worker service |
| **Resend Account** | — | For email magic link authentication |

### 1. Clone & Install

```bash
git clone https://github.com/NiravShah1729/Recordly.git
cd Recordly

# Install main app dependencies
npm install

# Install worker dependencies
cd worker && npm install && cd ..

# Install mediasoup SFU dependencies (if running locally)
cd mediasoup-backend && npm install && cd ..
```

### 2. Configure Environment

Copy the example and fill in your values:

```bash
cp .env.example .env
```

```env
# ── Database ────────────────────────────────────────
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"

# ── NextAuth ────────────────────────────────────────
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
NEXTAUTH_URL="https://localhost:3001"

# ── mediasoup ───────────────────────────────────────
NEXT_PUBLIC_MEDIASOUP_URL="http://127.0.0.1:3000"

# ── AWS S3 ──────────────────────────────────────────
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
AWS_S3_BUCKET_NAME="recordly-uploads"

# ── Email (Resend) ──────────────────────────────────
RESEND_API_KEY="re_..."
EMAIL_FROM="Recordly <noreply@yourdomain.com>"

# ── Redis (BullMQ) ──────────────────────────────────
# Local:    redis://localhost:6379
# Upstash:  rediss://default:PASSWORD@endpoint.upstash.io:6379
REDIS_URL="redis://localhost:6379"
```

### 3. Initialize Database

```bash
npx prisma generate
npx prisma migrate dev
```

### 4. Start All Services

Open **three terminal windows**:

```bash
# Terminal 1 — Next.js app (HTTPS + Socket.io signaling)
npm run dev

# Terminal 2 — mediasoup SFU (WebRTC media relay)
cd mediasoup-backend && npm start

# Terminal 3 — FFmpeg combine worker
cd worker && npm run dev
```

The app starts at `https://localhost:3001` with a self-signed certificate (required for `getUserMedia`). Accept the browser security warning to proceed.

> **📱 Mobile/LAN testing:** Use the network URL printed in Terminal 1 (e.g., `https://192.168.x.x:3001`). Both devices must accept the self-signed certificate warning.

---

## Project Structure

```
recordly/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/     # NextAuth catch-all route
│   │   ├── invite/                 # Email invitation endpoint
│   │   ├── recordings/
│   │   │   ├── init-upload/        # Initialize S3 multipart upload
│   │   │   ├── part-url/           # Generate presigned URL for chunk
│   │   │   ├── save-etag/          # Persist chunk ETag
│   │   │   ├── [id]/complete/      # Finalize upload + trigger combine
│   │   │   └── route.ts            # List recordings
│   │   └── rooms/
│   │       ├── create/             # Create new room
│   │       ├── [id]/combined/      # Poll combine status
│   │       ├── [id]/set-recording-count/
│   │       └── route.ts            # List rooms
│   ├── auth/signin/                # Custom sign-in page
│   ├── dashboard/                  # Room management dashboard
│   ├── recordings/                 # Recording gallery + per-room view
│   ├── room/[inviteCode]/          # Live room (WebRTC + recording UI)
│   ├── layout.tsx                  # Root layout with session provider
│   └── page.tsx                    # Landing page
├── components/
│   ├── CopyButton/                 # Clipboard copy with feedback
│   ├── DeviceCheck/                # Camera/mic permission checker
│   ├── Navbar/                     # Navigation bar
│   ├── SessionProvider/            # NextAuth session wrapper
│   └── ui/                         # Shared UI primitives (Button, etc.)
├── hooks/
│   └── useChunkedRecorder.ts       # Core recording hook (5 MB chunked upload)
├── lib/
│   ├── auth.ts                     # NextAuth config (Resend email provider)
│   ├── prisma.ts                   # Prisma client singleton
│   ├── redis.ts                    # ioredis connection (HMR-safe)
│   ├── s3.ts                       # S3 client + presigned URL helper
│   └── queues/
│       └── combineQueue.ts         # BullMQ producer (combine job queue)
├── worker/                         # ── SERVICE 3: FFmpeg Worker ──
│   ├── src/index.ts                # BullMQ consumer + FFmpeg pipeline
│   ├── package.json
│   └── Dockerfile                  # node:20-slim + ffmpeg + openssl
├── mediasoup-backend/              # ── SERVICE 2: mediasoup SFU ──
│   ├── server.js                   # SFU with room/peer/transport mgmt
│   ├── docker-compose.yml          # Deployment config (UDP 20000–20050)
│   ├── Dockerfile
│   └── package.json
├── prisma/
│   ├── schema.prisma               # Full database schema
│   └── migrations/                 # Migration history
├── types/
│   └── next-auth.d.ts              # NextAuth type augmentation
├── server.js                       # Custom HTTPS + Socket.io server
├── Dockerfile.worker               # Docker image for FFmpeg worker
├── triggerCombine.ts               # CLI utility: manually trigger combine
├── .github/workflows/
│   └── docker-mediasoup.yml        # CI: build + push mediasoup to GHCR
└── .env.example                    # Environment variable template
```

---

## API Reference

### Rooms

| Method | Endpoint | Auth | Description |
|:---|:---|:---:|:---|
| `GET` | `/api/rooms` | ✅ | List rooms for the authenticated user |
| `POST` | `/api/rooms/create` | ✅ | Create a new room (returns invite code) |
| `PATCH` | `/api/rooms/[id]` | ✅ | Update room status (`WAITING` → `LIVE` → `ENDED`) |
| `GET` | `/api/rooms/[id]/combined` | ✅ | Poll combined recording status + presigned URL |
| `POST` | `/api/rooms/[id]/set-recording-count` | ✅ | Set expected participant recording count |

### Recordings

| Method | Endpoint | Auth | Description |
|:---|:---|:---:|:---|
| `GET` | `/api/recordings` | ✅ | List recordings for the authenticated user |
| `POST` | `/api/recordings/init-upload` | ✅ | Initialize S3 multipart upload (returns `recordingId` + `uploadId`) |
| `POST` | `/api/recordings/part-url` | ✅ | Get presigned URL for a specific chunk part |
| `POST` | `/api/recordings/save-etag` | ✅ | Persist chunk ETag after successful S3 PUT |
| `POST` | `/api/recordings/[id]/complete` | ✅ | Complete multipart upload + enqueue combine job |
| `GET` | `/api/recordings/[id]` | ✅ | Get recording details with presigned playback URL |

### Invitations

| Method | Endpoint | Auth | Description |
|:---|:---|:---:|:---|
| `POST` | `/api/invite` | ✅ | Send email invitation to join a room |

### Socket.io Events (Signaling Server)

| Event | Direction | Payload | Description |
|:---|:---|:---|:---|
| `join-room` | Client → Server | `roomId` | Join a signaling room |
| `user-joined` | Server → Client | `{ socketId }` | Notify peers of new participant |
| `offer` | Client ↔ Server | `{ offer, to/from }` | WebRTC SDP offer relay |
| `answer` | Client ↔ Server | `{ answer, to/from }` | WebRTC SDP answer relay |
| `ice-candidate` | Client ↔ Server | `{ candidate, to/from }` | ICE candidate relay |
| `start-recording` | Bidirectional | `{ sharedStartTime }` | Synchronized recording start |
| `stop-recording` | Client → Server → Clients | — | Trigger recording stop |
| `user-left` | Server → Client | `{ socketId }` | Peer disconnection notification |

### mediasoup SFU Events

| Event | Direction | Payload | Description |
|:---|:---|:---|:---|
| `join-room` | Client → Server | `{ roomId, isHost }` | Join SFU room (returns `rtpCapabilities`) |
| `createWebRtcTransport` | Client → Server | `{ sender }` | Create send/recv transport |
| `transport-connect` | Client → Server | `{ transportId, dtlsParameters }` | Complete DTLS handshake |
| `transport-produce` | Client → Server | `{ transportId, kind, rtpParameters }` | Start producing media |
| `new-producer` | Server → Client | `{ producerId, socketId, kind }` | Notify peers of new media track |
| `getProducers` | Client → Server | — | List existing producers in room |
| `consume` | Client → Server | `{ transportId, producerId, rtpCapabilities }` | Start consuming remote media |
| `consumer-resume` | Client → Server | `{ consumerId }` | Resume a paused consumer |
| `host-start-recording` | Client → Server | `{ roomId }` | Host-only: broadcast recording start |
| `host-stop-recording` | Client → Server | `{ roomId }` | Host-only: broadcast recording stop |
| `end-session` | Client → Server | — | End room session for all peers |

---

## Deployment

### Service 1 — Next.js App

Deploy to **Vercel**, **Railway**, or any Node.js host. Requires:

- `DATABASE_URL` pointing to a PostgreSQL instance
- `REDIS_URL` pointing to Redis (Upstash recommended for serverless)
- AWS credentials and S3 bucket
- `NEXTAUTH_SECRET` and `NEXTAUTH_URL`
- `RESEND_API_KEY` for email auth

```bash
npm run build
npm run start
```

### Service 2 — mediasoup SFU

Deploy via Docker (EC2 recommended for UDP port control):

```bash
cd mediasoup-backend
docker build -t recordly-mediasoup .
docker run -d \
  -p 3000:3000 \
  -p 20000-20050:20000-20050/udp \
  -p 20000-20050:20000-20050/tcp \
  -e ANNOUNCED_IP=<your-public-ip> \
  recordly-mediasoup
```

> **⚠️ Important:** `ANNOUNCED_IP` must be set to the server's public IP address. mediasoup uses this to tell browsers where to send media packets.

The GitHub Actions workflow (`.github/workflows/docker-mediasoup.yml`) automatically builds and pushes to `ghcr.io/niravshah1729/recordly-mediasoup:latest` on every push to `main`.

### Service 3 — FFmpeg Worker

Deploy via Docker on any host with sufficient CPU:

```bash
docker build -f Dockerfile.worker -t recordly-worker .
docker run -d \
  -e DATABASE_URL="..." \
  -e REDIS_URL="..." \
  -e AWS_REGION="..." \
  -e AWS_ACCESS_KEY_ID="..." \
  -e AWS_SECRET_ACCESS_KEY="..." \
  -e AWS_S3_BUCKET_NAME="..." \
  recordly-worker
```

The worker runs with **concurrency 2** by default. Adjust in [worker/src/index.ts](file:///c:/Users/nirav/OneDrive/Attachments/Desktop/MyProjects/recordly/worker/src/index.ts) based on instance CPU/memory.

---

## Scripts

| Command | Context | Description |
|:---|:---|:---|
| `npm run dev` | Root | Start Next.js dev server (HTTPS + Socket.io) |
| `npm run build` | Root | Build production bundle |
| `npm run start` | Root | Start production server |
| `npm run lint` | Root | Run ESLint |
| `npm start` | `mediasoup-backend/` | Start mediasoup SFU server |
| `npm run dev` | `worker/` | Start FFmpeg worker (watch mode) |
| `npm run start` | `worker/` | Start FFmpeg worker (production) |
| `npx tsx triggerCombine.ts <roomId>` | Root | Manually re-trigger combine for a room |

---

## Contributing

Contributions are welcome. Please follow these guidelines:

1. **Fork** the repository and create a feature branch from `main`.
2. Follow existing code conventions and TypeScript strict mode.
3. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages (`feat:`, `fix:`, `docs:`, etc.).
4. Ensure `npm run lint` passes before submitting a pull request.
5. Open an **issue first** for large changes or architectural modifications.
6. Include relevant updates to this README for new features.

---

## License

This project is proprietary. All rights reserved.

---

<div align="center">

**Built for podcasters, interviewers, and remote teams who refuse to compromise on recording quality.**

</div>
