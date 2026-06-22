import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import { generate } from "selfsigned";
import next from "next";
import { Server as SocketServer } from "socket.io";
import { networkInterfaces } from "os";

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  let serverOptions = {};
  let isHttps = false;

  if (dev) {
    try {
      console.log("> Generating self-signed certificate for local HTTPS...");
      const pems = await generate([{ name: 'commonName', value: 'localhost' }], { days: 365, keySize: 2048 });
      serverOptions = {
        key: pems.private,
        cert: pems.cert
      };
      isHttps = true;
    } catch (err) {
      console.error("> Failed to generate self-signed cert, falling back to HTTP:", err);
    }
  }

  const httpServer = isHttps 
    ? createHttpsServer(serverOptions, (req, res) => handle(req, res))
    : createHttpServer((req, res) => handle(req, res));

  // ── Socket.io Setup ──────────────────────────────────────────
  const io = new SocketServer(httpServer, {
    cors: { origin: "*" },
    destroyUpgrade: false,
  });

  // Track which users are in which rooms
  // Map<roomId, Set<socketId>>
  const rooms = new Map();

  io.on("connection", (socket) => {
    console.log(`[Socket.io] Connected: ${socket.id}`);

    // ── join-room ────────────────────────────────────────────
    // Client sends { roomId } when they enter a room page
    socket.on("join-room", (roomId) => {
      socket.join(roomId);
      
      // Track this socket's room for cleanup on disconnect
      socket.data.roomId = roomId;

      // Get existing users in the room
      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }
      const roomUsers = rooms.get(roomId);

      // Notify existing users that someone new joined
      // This tells the existing user to create an offer
      socket.to(roomId).emit("user-joined", { socketId: socket.id });

      // Add this user to the room
      roomUsers.add(socket.id);

      console.log(`[Socket.io] ${socket.id} joined room ${roomId} (${roomUsers.size} users)`);
    });

    // ── offer ────────────────────────────────────────────────
    // Initiator sends their SDP offer to a specific peer
    socket.on("offer", ({ offer, to }) => {
      console.log(`[Socket.io] Offer from ${socket.id} to ${to}`);
      socket.to(to).emit("offer", { offer, from: socket.id });
    });

    // ── answer ───────────────────────────────────────────────
    // Responder sends their SDP answer back
    socket.on("answer", ({ answer, to }) => {
      console.log(`[Socket.io] Answer from ${socket.id} to ${to}`);
      socket.to(to).emit("answer", { answer, from: socket.id });
    });

    // ── ice-candidate ────────────────────────────────────────
    // Both sides relay ICE candidates for NAT traversal
    socket.on("ice-candidate", ({ candidate, to }) => {
      socket.to(to).emit("ice-candidate", { candidate, from: socket.id });
    });

    // ── disconnect ───────────────────────────────────────────
    // Clean up when a user leaves
    socket.on("disconnect", () => {
      const roomId = socket.data.roomId;
      if (roomId) {
        // Remove from tracking
        const roomUsers = rooms.get(roomId);
        if (roomUsers) {
          roomUsers.delete(socket.id);
          if (roomUsers.size === 0) {
            rooms.delete(roomId);
          }
        }

        // Notify the other peer
        socket.to(roomId).emit("user-left", { socketId: socket.id });
        console.log(`[Socket.io] ${socket.id} left room ${roomId}`);
      }
      console.log(`[Socket.io] Disconnected: ${socket.id}`);
    });
  });

  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url && req.url.startsWith("/_next/")) {
      app.getUpgradeHandler()(req, socket, head);
    }
  });

  httpServer.listen(port, "0.0.0.0", () => {
    const protocol = isHttps ? "https" : "http";
    console.log(`> Server listening at ${protocol}://localhost:${port} as ${dev ? "development" : process.env.NODE_ENV}`);
    
    // Print the local network IP address
    const nets = networkInterfaces();
    let networkIp = "";
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
        if (net.family === "IPv4" && !net.internal) {
          networkIp = net.address;
          break;
        }
      }
      if (networkIp) break;
    }
    
    if (networkIp) {
      console.log(`> Network link available at ${protocol}://${networkIp}:${port}`);
      if (isHttps) {
        console.log(`> NOTE: You will see a "Your connection is not private" warning in your browser. Click 'Advanced' -> 'Proceed' to bypass it.`);
      }
    }
  });
});
