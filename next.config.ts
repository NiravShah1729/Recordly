import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // This tells Next.js HMR to allow WebSocket connections from your phone's IP
  allowedDevOrigins: ['192.168.1.7', 'localhost', '127.0.0.1', '10.20.94.87', '10.1.72.6','192.168.1.31','10.1.72.233','10.1.75.133','172.17.128.1','192.168.1.18','10.1.72.1'],
  rewrites: async () => {
    return [
      {
        source: "/mediasoup-socket/:path*",
        destination: "http://127.0.0.1:3000/socket.io/:path*",
      }
    ]
  }
};

export default nextConfig;
