import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ['fluent-ffmpeg', '@ffmpeg-installer/ffmpeg', '@ffprobe-installer/ffprobe'],
  experimental: {
    // Some versions put it here, but let's put it on the root as well just in case Next.js types complain
  },
  // This tells Next.js HMR to allow WebSocket connections from your phone's IP
  allowedDevOrigins: ['192.168.1.7', 'localhost', '127.0.0.1', '10.20.94.87', '10.1.72.6','192.168.1.31','10.1.72.233'],
} as any; // Cast to any to avoid strict TS errors if types are not up-to-date

export default nextConfig;
