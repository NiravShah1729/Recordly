# Recordly

Recordly is a modern web application built with Next.js that allows users to create recording rooms, invite participants via shareable links, and seamlessly record their sessions. It features robust backend integration for handling video uploads, cloud storage, and video transcoding to ensure optimized viewing across devices.

## 🚀 Key Features

- **Authentication**: Secure user login and session management powered by NextAuth.js.
- **Room Management**: Create dedicated rooms with auto-generated, shareable invite codes for participants to join.
- **Live Recording**: Record high-quality video and audio directly from your browser.
- **Video Processing & Transcoding**: Automatic background processing of uploaded videos into multiple resolutions (1080p, 720p, 480p, 360p) using FFmpeg.
- **Optimized Video Delivery**: Support for smooth HLS video streaming and direct MP4 downloads utilizing AWS S3 and CloudFront CDN.
- **Modern & Responsive UI**: Built with React 19 and styled effortlessly with Tailwind CSS for a premium feel.

## 🛠️ Tech Stack

- **Frontend**: [Next.js 16](https://nextjs.org/) (App Router), React 19
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Database & ORM**: PostgreSQL with [Prisma](https://www.prisma.io/)
- **Authentication**: [NextAuth.js (v4)](https://next-auth.js.org/) / [Clerk](https://clerk.dev/)
- **Cloud Infrastructure**: AWS S3 (Storage) & CloudFront (CDN)
- **Video Processing**: FFmpeg

## 🏁 Getting Started

### Prerequisites

Make sure you have the following installed and configured on your local machine:
- Node.js (v18 or higher recommended)
- PostgreSQL Database
- AWS Account (S3 Bucket and CloudFront distribution set up)
- FFmpeg (if running video processing locally)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/NiravShah1729/Recordly.git
   cd recordly
   ```

2. **Install dependencies:**
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory and define the following variables:
   ```env
   # Database Configuration
   DATABASE_URL="postgresql://user:password@localhost:5432/recordly?schema=public"

   # Authentication Configuration (e.g., NextAuth / Clerk keys depending on your active setup)
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="your-super-secret-key"

   # AWS Configuration
   # AWS_REGION="us-east-1"
   # AWS_ACCESS_KEY_ID="your-access-key"
   # AWS_SECRET_ACCESS_KEY="your-secret-key"
   # AWS_S3_BUCKET_NAME="your-bucket-name"
   # AWS_CLOUDFRONT_DOMAIN="your-cloudfront-id.cloudfront.net"
   ```

4. **Initialize the Database:**
   Generate the Prisma client and run migrations to create the required tables in your database.
   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```

5. **Start the Development Server:**
   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 🗄️ Database Schema Overview

The core database architecture includes:
- **`User`**, **`Account`**, **`Session`**: Standard NextAuth.js tables for managing users and OAuth connections.
- **`Room`**: Holds data for recording sessions. It tracks `status` (WAITING, LIVE, ENDED) and generates unique `inviteCodes`.
- **`Recording`**: References uploaded media files inside an S3 bucket and tracks their processing status (UPLOADING, PROCESSING, READY, FAILED).
- **`VideoQuality`**: Keeps references to multiple transcoded video qualities (1080p, 720p, etc.) for each base recording, providing HLS stream URLs and CDN paths.

## 🤝 Contributing

We welcome contributions! Please follow the conventional commit messages and ensure your code is fully tested and properly formatted (`npm run lint`).

## 📄 License

This project is proprietary.
