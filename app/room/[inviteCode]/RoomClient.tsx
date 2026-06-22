"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import Link from "next/link";
import CopyButton from "@/components/CopyButton/index";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────
type RecordingData = {
  id: string;
  fileName: string;
  cdnUrl?: string | null;
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
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const animationFrameIdRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // State
  const router = useRouter();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("waiting");
  const [mediaError, setMediaError] = useState("");
  const [remoteSocketId, setRemoteSocketId] = useState<string | null>(null);
  const [currentRoomStatus, setCurrentRoomStatus] = useState(room.status);
  
  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

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
        remoteStreamRef.current = event.streams[0];
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
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setMediaError("Media devices API not available (requires HTTPS or localhost). Please use ngrok or enable Chrome's insecure origins flag.");
          return;
        }

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
      } catch (err: any) {
        console.error("Media error:", err);
        setMediaError(err.message || "Could not access camera/microphone. Please allow permissions.");
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

      // Cleanup recording resources
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
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

  // ── Auto-LIVE on connect ─────────────────────────────────
  useEffect(() => {
    if (isHost && connectionStatus === "connected" && currentRoomStatus === "WAITING") {
      setCurrentRoomStatus("LIVE");
      fetch(`/api/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "LIVE" }),
      }).catch(err => console.error("Error setting room LIVE:", err));
    }
  }, [isHost, connectionStatus, currentRoomStatus, room.id]);

  // ── End Session ─────────────────────────────────────────
  const handleEndSession = async () => {
    if (!confirm("Are you sure you want to end this session?")) return;
    
    try {
      setCurrentRoomStatus("ENDED");
      await fetch(`/api/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ENDED" }),
      });
      router.push("/dashboard");
    } catch (err) {
      console.error("Error ending session:", err);
    }
  };

  // ── Recording Methods ───────────────────────────────────
  const startRecording = async () => {
    if (!localStreamRef.current || !remoteStreamRef.current) {
      alert("Cannot start recording until both peers are connected.");
      return;
    }

    try {
      // 1. Audio mixing
      const audioCtx = new window.AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      audioCtx.createMediaStreamSource(localStreamRef.current).connect(dest);
      audioCtx.createMediaStreamSource(remoteStreamRef.current).connect(dest);

      // 2. Canvas drawing
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 360;
      const ctx = canvas.getContext("2d")!;

      const drawFrame = () => {
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        if (localVideoRef.current) {
          ctx.drawImage(localVideoRef.current, 0, 0, 640, 360);
        }
        if (remoteVideoRef.current) {
          ctx.drawImage(remoteVideoRef.current, 640, 0, 640, 360);
        }
        animationFrameIdRef.current = requestAnimationFrame(drawFrame);
      };
      drawFrame();

      // 3. Create MediaRecorder
      const canvasStream = canvas.captureStream(30);
      const combinedTracks = [
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ];
      const combinedStream = new MediaStream(combinedTracks);

      const recorder = new MediaRecorder(combinedStream, { mimeType: "video/webm" });
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        recordedChunksRef.current = [];
        
        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", blob, "recording.webm");
        formData.append("roomId", room.id);

        try {
          const res = await fetch("/api/recordings/upload", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (data.success) {
            router.refresh(); // Refresh to show new recording
          } else {
            console.error("Upload failed:", data.error);
            alert("Upload failed.");
          }
        } catch (err) {
          console.error("Server error:", err);
          alert("Server error uploading recording.");
        } finally {
          setIsUploading(false);
        }
      };

      recorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Error starting recording:", err);
      alert("Error starting recording. Ensure your browser allows AudioContext.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    setIsRecording(false);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

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
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
            currentRoomStatus === 'LIVE' ? 'bg-green-700 text-green-200' :
            currentRoomStatus === 'ENDED' ? 'bg-gray-700 text-gray-200' :
            'bg-yellow-700 text-yellow-200'
          }`}>
            {currentRoomStatus}
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

      {/* Action Buttons */}
      <div className="flex items-center gap-4">
        {isHost && connectionStatus === "connected" && !isRecording && !isUploading && (
          <button
            onClick={startRecording}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2"
          >
            ⏺ Start Recording
          </button>
        )}

        {isHost && isRecording && (
          <div className="flex items-center gap-4 bg-red-900/40 border border-red-700 rounded-lg px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="font-mono text-red-100">{formatTime(recordingTime)}</span>
            </div>
            <button
              onClick={stopRecording}
              className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              ⏹ Stop
            </button>
          </div>
        )}

        {isHost && isUploading && (
          <div className="flex items-center gap-3 bg-blue-900/40 border border-blue-700 rounded-lg px-6 py-3">
            <svg className="animate-spin h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-blue-100 font-medium">Uploading to S3...</span>
          </div>
        )}
        
        {isHost && (
          <button
            onClick={handleEndSession}
            className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold inline-block transition-colors"
          >
            🛑 End Session
          </button>
        )}
      </div>

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
                  src={recording.cdnUrl || `/recordings/${recording.fileName}`}
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
                    href={recording.cdnUrl || `/recordings/${recording.fileName}`}
                    download={recording.fileName}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                  >
                    ⬇ Download / View
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

