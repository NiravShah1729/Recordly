<div align="center">

# Recordly

**Browser-based video recording studio with real-time WebRTC calls, per-participant local recording, and automated FFmpeg post-production.**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red)](#license)

</div>

---

## Overview

Recordly is a full-stack web application that enables two participants to join a live video call, independently record their own high-quality local streams, and automatically produce a combined side-by-side video -- all from the browser, with no desktop software required.

Unlike screen-recording tools that capture compressed WebRTC output, Recordly records each participant's raw camera and microphone feed locally via the MediaRecorder API, uploads the individual files to S3, transcodes them server-side with FFmpeg, and then combines them into a single synchronized output.

---

## Key Features

| Feature | Description |
|---|---|
| **Real-time Video Calls** | Peer-to-peer WebRTC connections via Socket.io signaling with STUN-based NAT traversal |
| **Local-quality Recording** | Each participant records their own raw MediaStream -- no WebRTC compression artifacts |
| **Synchronized Capture** | Server-generated shared timestamp ensures frame-accurate alignment across participants |
| **Automated Transcoding** | Background FFmpeg pipeline converts WebM uploads to optimized MP4 with thumbnail extraction |
| **Combined Video Output** | Side-by-side FFmpeg composition with offset-aware phased layout (full-screen to split-screen) |
| **Invite-based Rooms** | Create rooms with auto-generated invite codes; share a link for guests to join |
| **Room Lifecycle** | Rooms transition through `WAITING` -> `LIVE` -> `ENDED` states with host controls |
| **Presigned URL Delivery** | Secure, time-limited S3 presigned URLs for video playback and downloads |
| **Authentication** | NextAuth.js with JWT sessions and Prisma adapter for user persistence |
| **Responsive Dashboard** | Room management, recording history, and combined video access in one place |

---

## Architecture

```
Browser A (Host)                    Browser B (Guest)
+-----------------+                 +-----------------+
| getUserMedia()  |                 | getUserMedia()  |
| localStream ----|--- WebRTC ------|---- localStream |
|                 |   (live call)   |                 |
| MediaRecorder   |                 | MediaRecorder   |
| (records local) |                 | (records local) |
+--------+--------+                 +--------+--------+
         |                                   |
         |  upload webm                      |  upload webm
         v                                   v
+--------------------------------------------------+
|              Next.js API  +  Socket.io            |
|                                                   |
|  /api/recordings/upload   (receives raw files)    |
|  processRecording()       (webm -> mp4 + thumb)   |
|  combineRecordings()      (side-by-side merge)    |
+-------------------------+------------------------+
                          |
              +-----------+-----------+
              |      AWS S3 Bucket    |
              |  raw/    processed/   |
              |  thumbnails/          |
              |  combined/            |
              +-----------+-----------+
                          |
              +-----------+-----------+
              |     PostgreSQL        |
              |  (Prisma ORM)         |
              |  Users, Rooms,        |
              |  Recordings,          |
              |  VideoQualities       |
              +-----------------------+
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Runtime | React 19, TypeScript 5 |
| Styling | Tailwind CSS v4 |
| Real-time | Socket.io 4 (custom `server.js`) |
| Video Calls | WebRTC (native browser API) |
| Recording | MediaRecorder API (browser-side) |
| Transcoding | FFmpeg via `fluent-ffmpeg` |
| Database | PostgreSQL (Neon-compatible) |
| ORM | Prisma 7 |
| Auth | NextAuth.js v4 (JWT + Prisma Adapter) |
| Storage | AWS S3 |
| HTTPS (dev) | Self-signed certs via `selfsigned` |

---

## Database Schema

```
User
 |-- id, name, email, image
 |-- has many -> Room (as host)
 |-- has many -> Recording
 |-- many-to-many -> Room (as participant)

Room
 |-- id, name, description, inviteCode, status
 |-- hostId -> User
 |-- combineStatus, combinedS3Key, combinedUrl
 |-- has many -> Recording

Recording
 |-- id, fileName, s3Key, cdnUrl, status, duration
 |-- startTime (shared timestamp for FFmpeg sync)
 |-- roomId -> Room
 |-- userId -> User
 |-- has many -> VideoQuality

VideoQuality
 |-- id, label, width, height, bitrate
 |-- s3Key, cdnUrl, hlsUrl
 |-- recordingId -> Recording
```

**Enums:**

| Enum | Values |
|---|---|
| `RoomStatus` | `WAITING`, `LIVE`, `ENDED` |
| `ProcessingStatus` | `UPLOADING`, `PROCESSING`, `READY`, `FAILED` |
| `CombineStatus` | `PENDING`, `PROCESSING`, `READY`, `FAILED` |

---

## Getting Started

### Prerequisites

- **Node.js** v18+
- **PostgreSQL** database (local or hosted, e.g., [Neon](https://neon.tech/))
- **AWS Account** with an S3 bucket configured
- **FFmpeg** installed and available in `PATH` (or use the bundled `@ffmpeg-installer/ffmpeg`)

### 1. Clone the repository

```bash
git clone https://github.com/NiravShah1729/Recordly.git
cd Recordly
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root:

```env
# Database
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"

# NextAuth
NEXTAUTH_SECRET="your-random-secret-key"
NEXTAUTH_URL="https://localhost:3000"

# AWS S3
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
AWS_S3_BUCKET_NAME="your-bucket-name"
```

### 4. Initialize the database

```bash
npx prisma generate
npx prisma migrate dev
```

### 5. Start the development server

```bash
npm run dev
```

The server starts with a self-signed HTTPS certificate (required for `getUserMedia` on non-localhost origins). Open `https://localhost:3000` and accept the browser security warning.

> **Tip:** To test with a second device on your local network, use the network URL printed in the terminal (e.g., `https://192.168.x.x:3000`). Both devices must accept the self-signed certificate warning.

---

## Project Structure

```
recordly/
|-- app/
|   |-- api/
|   |   |-- auth/             # NextAuth API routes
|   |   |-- recordings/       # Upload + list endpoints
|   |   |-- rooms/            # CRUD + status endpoints
|   |-- auth/signin/          # Custom sign-in page
|   |-- dashboard/            # Room management + stats
|   |-- recordings/           # Recording gallery with combined videos
|   |-- room/[inviteCode]/    # Live room (WebRTC + recording UI)
|   |-- layout.tsx            # Root layout with providers
|   |-- page.tsx              # Landing page
|-- components/
|   |-- CopyButton/           # Clipboard copy utility
|   |-- Navbar/               # Navigation bar
|   |-- SessionProvider/      # NextAuth session wrapper
|-- lib/
|   |-- auth.ts               # NextAuth configuration
|   |-- combineRecordings.ts  # FFmpeg side-by-side merge pipeline
|   |-- ffmpeg.ts             # FFmpeg + ffprobe setup
|   |-- prisma.ts             # Prisma client singleton
|   |-- processRecording.ts   # WebM -> MP4 transcoding pipeline
|   |-- s3.ts                 # S3 client + presigned URL helper
|-- prisma/
|   |-- schema.prisma         # Database schema
|   |-- migrations/           # Migration history
|-- server.js                 # Custom HTTPS + Socket.io server
|-- next.config.ts            # Next.js configuration
```

---

## How Recording Works

1. **Host clicks "Start Recording"** -- emits a `start-recording` event to the Socket.io server.

2. **Server generates a shared timestamp** and broadcasts `start-recording` with `sharedStartTime` to all participants in the room.

3. **Each browser independently** creates a `MediaRecorder` on its own `localStream` (camera + mic), not the compressed WebRTC remote stream.

4. **On stop**, each browser uploads its raw WebM blob to `/api/recordings/upload`, tagged with the room ID, user ID, and shared start time.

5. **Background processing** triggers automatically:
   - `processRecording()` -- transcodes WebM to MP4, extracts duration and thumbnail, replaces the raw file in S3.
   - Once all participants' recordings reach `READY` status, `combineRecordings()` fires.

6. **FFmpeg combines** the recordings into a single 1280x720 output:
   - If both started simultaneously: full split-screen for the entire duration.
   - If the guest joined late: Phase 1 (host full-screen) concatenated with Phase 2 (split-screen), using the timestamp offset for alignment.

7. **Combined video** is uploaded to S3 under `combined/` and the room record is updated with the final URL.

---

## API Routes

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/rooms` | List rooms for the authenticated user |
| `POST` | `/api/rooms/create` | Create a new room |
| `PATCH` | `/api/rooms/[id]` | Update room status |
| `GET` | `/api/rooms/[id]/combined` | Poll combined recording status |
| `GET` | `/api/recordings` | List recordings for the authenticated user |
| `POST` | `/api/recordings/upload` | Upload a recording blob to S3 |

---

## Socket.io Events

| Event | Direction | Payload | Description |
|---|---|---|---|
| `join-room` | Client -> Server | `roomId` | Join a signaling room |
| `user-joined` | Server -> Client | `{ socketId }` | Notify existing peers of a new participant |
| `offer` | Client -> Server -> Client | `{ offer, to }` | WebRTC SDP offer relay |
| `answer` | Client -> Server -> Client | `{ answer, to }` | WebRTC SDP answer relay |
| `ice-candidate` | Client -> Server -> Client | `{ candidate, to }` | ICE candidate relay |
| `start-recording` | Bidirectional | `{ sharedStartTime }` | Trigger synchronized recording start |
| `stop-recording` | Client -> Server -> Client | -- | Trigger recording stop |
| `user-left` | Server -> Client | `{ socketId }` | Notify peers of a disconnection |

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server (HTTPS + Socket.io) |
| `npm run build` | Build production bundle |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

---

## Contributing

Contributions are welcome. Please follow these guidelines:

1. Fork the repository and create a feature branch.
2. Follow existing code conventions and TypeScript strict mode.
3. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.
4. Ensure `npm run lint` passes before submitting a pull request.
5. Open an issue first for large changes or architectural modifications.

---

## License

This project is proprietary. All rights reserved.
