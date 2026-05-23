"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import Link from "next/link";
import CopyButton from "@/components/CopyButton/index";

// ── Types ──────────────────────────────────────────────────────
type RecordingData = {
  id: string;
  fileName: string;
  createdAt: string;
  user: {
    name: string | null;
    email: string;
  };
};

type RoomData = {
  id: string;
  name: string;
  description: string | null;
  inviteCode: string;
  status: string;
  host: {
    name: string | null;
    email: string;
  };
  recordings: RecordingData[];
};

type ConnectionStatus = "waiting" | "connected" | "disconnected";

interface RoomClientProps {
  room: RoomData;
  isHost: boolean;
  nextAuthUrl: string;
}

// ── Component ──────────────────────────────────────────────────
export default function RoomClient({ room, isHost, nextAuthUrl }: RoomClientProps) {
  // Refs for video elements and WebRTC objects
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // State
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("waiting");
  const [mediaError, setMediaError] = useState("");
  const [remoteSocketId, setRemoteSocketId] = useState<string | null>(null);

  // ── ICE Servers (STUN for NAT traversal) ─────────────────
  const iceServers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  // ── Create Peer Connection ────────────────────────────────
  const createPeerConnection = useCallback((remoteId: string) => {
    // Clean up existing connection if any
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    const pc = new RTCPeerConnection(iceServers);
    peerConnectionRef.current = pc;

    // Add local tracks to the connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // When we receive remote tracks, display them
    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Send ICE candidates to the remote peer via Socket.io
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit("ice-candidate", {
          candidate: event.candidate,
          to: remoteId,
        });
      }
    };

    // Track connection state changes
    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case "connected":
          setConnectionStatus("connected");
          break;
        case "disconnected":
        case "failed":
        case "closed":
          setConnectionStatus("disconnected");
          break;
      }
    };

    return pc;
  }, []);

  // ── Main Effect: Setup media + socket ─────────────────────
  useEffect(() => {
    let isMounted = true;

    async function init() {
      // 1. Get local media stream
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Media error:", err);
        setMediaError("Could not access camera/microphone. Please allow permissions.");
        return;
      }

      // 2. Connect to Socket.io server
      const socket = io(window.location.origin, {
        transports: ["websocket", "polling"],
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        console.log("[WebRTC] Socket connected:", socket.id);
        // Join the room
        socket.emit("join-room", room.id);
      });

      // ── When another user joins the room ──────────────────
      // We are the existing user, so WE create the offer
      socket.on("user-joined", async ({ socketId }: { socketId: string }) => {
        console.log("[WebRTC] User joined, creating offer for:", socketId);
        setRemoteSocketId(socketId);

        const pc = createPeerConnection(socketId);

        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("offer", { offer, to: socketId });
        } catch (err) {
          console.error("[WebRTC] Error creating offer:", err);
        }
      });

      // ── Receive an offer from the other peer ──────────────
      socket.on("offer", async ({ offer, from }: { offer: RTCSessionDescriptionInit; from: string }) => {
        console.log("[WebRTC] Received offer from:", from);
        setRemoteSocketId(from);

        const pc = createPeerConnection(from);

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("answer", { answer, to: from });
        } catch (err) {
          console.error("[WebRTC] Error handling offer:", err);
        }
      });

      // ── Receive an answer ─────────────────────────────────
      socket.on("answer", async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
        console.log("[WebRTC] Received answer");
        const pc = peerConnectionRef.current;
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          } catch (err) {
            console.error("[WebRTC] Error setting remote description:", err);
          }
        }
      });

      // ── Receive ICE candidate ─────────────────────────────
      socket.on("ice-candidate", async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
        const pc = peerConnectionRef.current;
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error("[WebRTC] Error adding ICE candidate:", err);
          }
        }
      });

      // ── User left ─────────────────────────────────────────
      socket.on("user-left", ({ socketId }: { socketId: string }) => {
        console.log("[WebRTC] User left:", socketId);
        setConnectionStatus("disconnected");
        setRemoteSocketId(null);

        // Clean up peer connection
        if (peerConnectionRef.current) {
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
        }

        // Clear remote video
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
        }
      });
    }

    init();

    // ── Cleanup ─────────────────────────────────────────────
    return () => {
      isMounted = false;

      // Stop all local media tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      // Close peer connection
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }

      // Disconnect socket
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [room.id, createPeerConnection]);

  // ── Status indicator config ───────────────────────────────
  const statusConfig = {
    waiting: { label: "Waiting for peer...", color: "bg-yellow-500", icon: "🟡" },
    connected: { label: "Connected", color: "bg-green-500", icon: "🟢" },
    disconnected: { label: "Disconnected", color: "bg-red-500", icon: "🔴" },
  };
  const currentStatus = statusConfig[connectionStatus];

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      {/* Room Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{room.name}</h1>
        {room.description && (
          <p className="text-gray-400 mt-1">{room.description}</p>
        )}
        <p className="text-sm text-gray-500 mt-2">
          Host: {room.host.name || room.host.email}
        </p>
        <div className="flex items-center gap-3 mt-2">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-700 text-green-200">
            {room.status}
          </span>
          {/* Role badge */}
          {isHost ? (
            <span className="bg-purple-700 text-purple-200 px-3 py-1 rounded-full text-xs font-semibold">
              👑 Host
            </span>
          ) : (
            <span className="bg-blue-700 text-blue-200 px-3 py-1 rounded-full text-xs font-semibold">
              🎙 Guest
            </span>
          )}
        </div>
      </div>

      {/* Connection Status */}
      <div className="mb-6 flex items-center gap-2">
        <span className={`w-3 h-3 rounded-full ${currentStatus.color} inline-block`} />
        <span className="text-sm text-gray-300">
          {currentStatus.icon} {currentStatus.label}
        </span>
      </div>

      {/* Media Error */}
      {mediaError && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-6">
          <p className="text-red-300">{mediaError}</p>
        </div>
      )}

      {/* Video Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {/* Local Video */}
        <div className="relative">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full rounded-xl border border-gray-700 bg-gray-800"
          />
          <span className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-xs">
            You {isHost ? "(Host)" : "(Guest)"}
          </span>
        </div>

        {/* Remote Video */}
        <div className="relative">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full rounded-xl border border-gray-700 bg-gray-800"
          />
          {!remoteSocketId ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 rounded-xl border border-gray-700">
              <p className="text-gray-500 text-sm">Waiting for peer to join...</p>
            </div>
          ) : (
            <span className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-xs">
              Peer {isHost ? "(Guest)" : "(Host)"}
            </span>
          )}
        </div>
      </div>

      {/* Invite Link — only show to host */}
      {isHost && (
        <div className="bg-gray-800 rounded-xl p-6 mb-8">
          <p className="text-sm text-gray-400 mb-2">
            Share this invite link with your guest:
          </p>
          <div className="flex items-center gap-3">
            <code className="bg-gray-700 px-4 py-2 rounded-lg text-sm flex-1 overflow-auto">
              {`${nextAuthUrl}/room/${room.inviteCode}`}
            </code>
            <CopyButton text={`${nextAuthUrl}/room/${room.inviteCode}`} />
          </div>
        </div>
      )}

      {/* Record button */}
      <Link
        href={`/record?roomId=${room.id}`}
        className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold inline-block"
      >
        ⏺ Start Recording
      </Link>

      {/* Recordings Section */}
      <div className="mt-12">
        <h2 className="text-2xl font-bold mb-6">
          📹 Recordings ({room.recordings.length})
        </h2>

        {room.recordings.length === 0 ? (
          <p className="text-gray-500">No recordings yet. Be the first to record!</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {room.recordings.map((recording) => (
              <div
                key={recording.id}
                className="bg-gray-800 rounded-xl p-4 flex flex-col gap-3"
              >
                <video
                  src={`/recordings/${recording.fileName}`}
                  controls
                  className="w-full rounded-lg border border-gray-700"
                />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">
                      {recording.user.name || recording.user.email}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(recording.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <a
                    href={`/recordings/${recording.fileName}`}
                    download={recording.fileName}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                  >
                    ⬇ Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
