const io = require('socket.io')(3000, {
  cors: { origin: '*' }
});
const mediasoup = require('mediasoup');

// ── Config ─────────────────────────────────────────
const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
];

// ── State ───────────────────────────────────────────
let worker;

// rooms Map structure:
// roomId → { router, peers: Map { socketId → { socket, producers, consumers, transports } } }
const rooms = new Map();

// ── Initialize Worker ───────────────────────────────
async function createWorker() {
  worker = await mediasoup.createWorker({
    rtcMinPort: 20000,
    rtcMaxPort: 20050,
  });

  worker.on('died', () => {
    console.error('mediasoup Worker died, exiting...');
    setTimeout(() => process.exit(1), 2000);
  });

  console.log('✅ mediasoup Worker created');
  return worker;
}

// ── Room Helpers ────────────────────────────────────

// Get or create a room with its own Router
async function getOrCreateRoom(roomId) {
  if (rooms.has(roomId)) {
    return rooms.get(roomId);
  }

  const router = await worker.createRouter({ mediaCodecs });
  const room = {
    router,
    peers: new Map(),
  };

  rooms.set(roomId, room);
  console.log(`✅ Room created: ${roomId}`);
  return room;
}

// Get a peer from a room
function getPeer(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  return room.peers.get(socketId);
}

// Create a peer in a room
function createPeer(roomId, socket) {
  const room = rooms.get(roomId);
  if (!room) return null;

  const peer = {
    socket,
    producers: new Map(),   // producerId → Producer
    consumers: new Map(),   // consumerId → Consumer
    transports: new Map(),  // transportId → Transport
  };

  room.peers.set(socket.id, peer);
  return peer;
}

// Clean up a peer when they disconnect
function removePeer(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const peer = room.peers.get(socketId);
  if (!peer) return;

  // Close all transports (this also closes producers and consumers)
  peer.transports.forEach(transport => transport.close());
  room.peers.delete(socketId);

  console.log(`🧹 Peer ${socketId} removed from room ${roomId}`);

  // If room is empty, clean it up
  if (room.peers.size === 0) {
    room.router.close();
    rooms.delete(roomId);
    console.log(`🧹 Empty room ${roomId} deleted`);
  }
}

// ── Socket.io ───────────────────────────────────────
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  // Track which room this socket is in
  let currentRoomId = null;

  // ── STEP 0: Join Room ─────────────────────────────
  socket.on('join-room', async ({ roomId }, callback) => {
    try {
      currentRoomId = roomId;
      const room = await getOrCreateRoom(roomId);
      createPeer(roomId, socket);
      socket.join(roomId);

      // Tell the new peer what RTP capabilities the router supports
      callback({
        rtpCapabilities: room.router.rtpCapabilities,
      });

      console.log(`✅ Peer ${socket.id} joined room ${roomId}`);
    } catch (error) {
      console.error('join-room error:', error);
      callback({ error: error.message });
    }
  });

  // ── STEP 1: Create Transport ──────────────────────
  socket.on('createWebRtcTransport', async ({ sender }, callback) => {
    try {
      const room = rooms.get(currentRoomId);
      const peer = getPeer(currentRoomId, socket.id);

      if (!room || !peer) {
        return callback({ error: 'Room or peer not found' });
      }

      const transport = await room.router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: process.env.ANNOUNCED_IP || '10.1.75.133' }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });

      // DEBUG: Log transport details
      console.log(`✅ Transport created for peer ${socket.id} sender:${sender}`);
      console.log(`   announcedIp: ${process.env.ANNOUNCED_IP || '10.1.75.133'}`);
      console.log(`   ICE candidates:`, JSON.stringify(transport.iceCandidates));
      console.log(`   tuple:`, JSON.stringify(transport.tuple));

      // Listen for transport state changes
      transport.on('dtlsstatechange', (dtlsState) => {
        console.log(`🔒 Transport ${transport.id} DTLS state: ${dtlsState}`);
      });

      transport.on('icestatechange', (iceState) => {
        console.log(`🧊 Transport ${transport.id} ICE state: ${iceState}`);
      });

      // Store transport in peer's transports Map
      peer.transports.set(transport.id, transport);

      callback({
        params: {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
          sender, // pass back so browser knows which transport this is
        }
      });
    } catch (error) {
      callback({ error: error.message });
    }
  });

  // ── STEP 2: Connect Transport ─────────────────────
  socket.on('transport-connect', async ({ transportId, dtlsParameters }, callback) => {
    try {
      const peer = getPeer(currentRoomId, socket.id);
      const transport = peer?.transports.get(transportId);

      if (!transport) {
        return callback({ error: 'Transport not found' });
      }

      await transport.connect({ dtlsParameters });
      callback({ success: true });
      console.log(`✅ Transport ${transportId} connected`);
    } catch (error) {
      callback({ error: error.message });
    }
  });

  // ── STEP 3: Produce (send camera/mic) ────────────
  socket.on('transport-produce', async ({ transportId, kind, rtpParameters }, callback) => {
    try {
      const peer = getPeer(currentRoomId, socket.id);
      const transport = peer?.transports.get(transportId);

      if (!transport) {
        return callback({ error: 'Transport not found' });
      }

      const producer = await transport.produce({ kind, rtpParameters });

      // Store in peer's producers Map (supports multiple producers)
      peer.producers.set(producer.id, producer);

      // !! IMPORTANT: Tell all OTHER peers in the room about this new producer
      // They need to know so they can consume it
      socket.to(currentRoomId).emit('new-producer', {
        producerId: producer.id,
        socketId: socket.id,
        kind,
      });

      callback({ id: producer.id });
      console.log(`✅ Producer created: ${producer.id} (${kind})`);
    } catch (error) {
      callback({ error: error.message });
    }
  });

  // ── STEP 4: Get existing producers in room ────────
  // When a new peer joins, they need to know about
  // all producers that already exist in the room
  socket.on('getProducers', (callback) => {
    const room = rooms.get(currentRoomId);
    if (!room) return callback([]);

    const producers = [];

    room.peers.forEach((peer, socketId) => {
      // Don't include this peer's own producers
      if (socketId === socket.id) return;

      peer.producers.forEach((producer) => {
        producers.push({
          producerId: producer.id,
          socketId,
          kind: producer.kind,
        });
      });
    });

    callback(producers);
    console.log(`✅ Sent ${producers.length} existing producers to new peer`);
  });

  // ── STEP 5: Consume (receive others video/audio) ──
  socket.on('consume', async ({ transportId, producerId, rtpCapabilities }, callback) => {
    try {
      const room = rooms.get(currentRoomId);
      const peer = getPeer(currentRoomId, socket.id);
      const transport = peer?.transports.get(transportId);

      if (!room || !transport) {
        return callback({ error: 'Room or transport not found' });
      }

      // Check if this peer can consume this producer
      if (!room.router.canConsume({ producerId, rtpCapabilities })) {
        return callback({ error: 'Cannot consume' });
      }

      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: true, // always start paused, resume after transport connects
      });

      // Store in peer's consumers Map (supports multiple consumers)
      peer.consumers.set(consumer.id, consumer);

      callback({
        params: {
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        }
      });

      console.log(`✅ Consumer created: ${consumer.id} (${consumer.kind})`);
    } catch (error) {
      callback({ error: error.message });
    }
  });

  // ── STEP 6: Resume Consumer ───────────────────────
  socket.on('consumer-resume', async ({ consumerId }, callback) => {
    try {
      const peer = getPeer(currentRoomId, socket.id);
      const consumer = peer?.consumers.get(consumerId);

      if (!consumer) {
        return callback({ error: 'Consumer not found' });
      }

      await consumer.resume();
      callback({ success: true });
      console.log(`▶️ Consumer ${consumerId} resumed`);
    } catch (error) {
      callback({ error: error.message });
    }
  });

  // ── Recording Signals ─────────────────────────────
  // The host emits start-recording → server generates a
  // shared timestamp and broadcasts to everyone in the room.
  // This keeps all participants' MediaRecorder start times
  // aligned for FFmpeg sync later.
  socket.on('start-recording', () => {
    if (currentRoomId) {
      const sharedStartTime = Date.now();
      console.log(`🔴 start-recording in room ${currentRoomId} at ${sharedStartTime}`);
      // Send to everyone ELSE in the room
      socket.to(currentRoomId).emit('start-recording', { sharedStartTime });
      // Also send back to the sender so they use the same timestamp
      socket.emit('start-recording', { sharedStartTime });
    }
  });

  socket.on('stop-recording', () => {
    if (currentRoomId) {
      console.log(`⏹ stop-recording in room ${currentRoomId}`);
      socket.to(currentRoomId).emit('stop-recording');
    }
  });

  socket.on('end-session', () => {
    if (currentRoomId) {
      console.log(`🛑 end-session triggered for room ${currentRoomId}`);
      // Broadcast to all other peers that the session has ended
      socket.to(currentRoomId).emit('session-ended');
    }
  });

  // ── STEP 7: Disconnect ────────────────────────────
  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);

    // Notify others in the room that this peer left
    if (currentRoomId) {
      socket.to(currentRoomId).emit('peer-left', { socketId: socket.id });
      removePeer(currentRoomId, socket.id);
    }
  });
});

// ── Start ───────────────────────────────────────────
createWorker().then(() => {
  console.log('🚀 mediasoup server ready on port 3000');
});