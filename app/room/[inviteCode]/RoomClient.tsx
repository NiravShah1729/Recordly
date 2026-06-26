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

  // ── Recording refs ──────────────────────────────────────────
  // MediaRecorder records the local camera+mic stream
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  // Chunks of recorded data collected every 1 second
  const recordedChunksRef = useRef<Blob[]>([]);
  // Timer interval that ticks the on-screen counter
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  // The shared start timestamp — same value on both host and guest
  // so we can later align the recordings with FFmpeg
  const sharedStartTimeRef = useRef<number | null>(null);

  // State
  const router = useRouter();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("waiting");
  const [mediaError, setMediaError] = useState("");
  const [remoteSocketId, setRemoteSocketId] = useState<string | null>(null);
  const [currentRoomStatus, setCurrentRoomStatus] = useState(room.status);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  // Upload state — shown while the file is being sent to S3
  const [isUploading, setIsUploading] = useState(false);
  // Brief "Upload complete" message
  const [uploadComplete, setUploadComplete] = useState(false);

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

  // ──────────────────────────────────────────────────────────
  // startLocalRecording — records THIS browser's localStream
  // Called on BOTH host and guest when the "start-recording"
  // socket event fires. The sharedStartTime is passed in so
  // both sides store the same timestamp.
  // ──────────────────────────────────────────────────────────
  const startLocalRecording = useCallback((sharedStartTime: number) => {
    // Safety: need a local camera/mic stream to record
    if (!localStreamRef.current) {
      console.warn("[Recording] No local stream available to record.");
      return;
    }

    // Store the shared start time so we can include it in the upload
    sharedStartTimeRef.current = sharedStartTime;

    // Pick the best codec the browser supports
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";

    // Create a MediaRecorder that records only OUR local camera+mic
    const recorder = new MediaRecorder(localStreamRef.current, { mimeType });
    mediaRecorderRef.current = recorder;
    recordedChunksRef.current = [];

    // Every 1 second the recorder gives us a chunk of data
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };

    // ── When the recorder stops: upload to S3 ──────────────
    // Instead of downloading the file, we upload it to our
    // /api/recordings/upload endpoint which puts it in S3
    // and saves the record in the database.
    recorder.onstop = async () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      recordedChunksRef.current = [];

      // Build the form data with the file, room ID, and start time
      const formData = new FormData();
      formData.append("file", blob, "recording.webm");
      formData.append("roomId", room.id);
      // Include the shared start time so the server can save it
      // for FFmpeg sync later
      if (sharedStartTimeRef.current !== null) {
        formData.append("startTime", sharedStartTimeRef.current.toString());
      }

      // Show uploading indicator
      setIsUploading(true);

      try {
        const res = await fetch("/api/recordings/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (data.success) {
          // Show a brief "Upload complete" message
          setUploadComplete(true);
          setTimeout(() => setUploadComplete(false), 3000);
          // Refresh the page data so the recordings list updates
          router.refresh();
        } else {
          console.error("Upload failed:", data.error);
          alert("Upload failed: " + (data.error || "Unknown error"));
        }
      } catch (err) {
        console.error("Server error:", err);
        alert("Server error uploading recording.");
      } finally {
        setIsUploading(false);
      }
    };

    // Start recording with a 1-second timeslice
    recorder.start(1000);
    setIsRecording(true);
    setRecordingTime(0);

    // Tick the on-screen timer every second
    recordingTimerRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);
  }, [room.id, router]);

  // ──────────────────────────────────────────────────────────
  // stopLocalRecording — stops the MediaRecorder and timer.
  // The recorder.onstop handler (above) will automatically
  // upload the file to S3.
  // ──────────────────────────────────────────────────────────
  const stopLocalRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
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

      // ────────────────────────────────────────────────────────
      // RECORDING SOCKET EVENTS
      // Both host and guest listen for these. The server generates
      // a sharedStartTime and sends it to everyone in the room.
      // Both sides then independently start their own MediaRecorder
      // on their own localStream, using the same sharedStartTime.
      // ────────────────────────────────────────────────────────

      // ── start-recording (received from server) ─────────────
      // The server sends { sharedStartTime } to BOTH host and guest
      socket.on("start-recording", ({ sharedStartTime }: { sharedStartTime: number }) => {
        console.log("[Recording] Received start-recording event, sharedStartTime:", sharedStartTime);
        startLocalRecording(sharedStartTime);
      });

      // ── stop-recording (received from server) ──────────────
      socket.on("stop-recording", () => {
        console.log("[Recording] Received stop-recording event");
        stopLocalRecording();
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
  }, [room.id, createPeerConnection, startLocalRecording, stopLocalRecording]);

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

  // ──────────────────────────────────────────────────────────
  // HOST-ONLY button handlers
  // When the host clicks Record, the host emits "start-recording"
  // to the server. The server generates a sharedStartTime and
  // broadcasts it back to BOTH host and guest via the
  // "start-recording" event. So the host does NOT call
  // startLocalRecording directly — it waits for the server's
  // broadcast just like the guest does.
  // Same pattern for Stop.
  // ──────────────────────────────────────────────────────────
  const handleHostStartRecording = () => {
    if (!localStreamRef.current) {
      alert("Cannot start recording — camera/mic not available.");
      return;
    }
    // Tell the server to generate a sharedStartTime and broadcast
    // "start-recording" to everyone in the room (including us)
    socketRef.current?.emit("start-recording");
  };

  const handleHostStopRecording = () => {
    // Tell the server to broadcast "stop-recording" to everyone
    socketRef.current?.emit("stop-recording");
    // Also stop our own recording right away (don't wait for the round-trip)
    stopLocalRecording();
  };

  // ── Format seconds into MM:SS for the timer display ──────
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

      {/* ── Recording Indicator ──────────────────────────────
           Shown on BOTH host and guest while recording is active
           so everyone knows they are being recorded. */}
      {isRecording && (
        <div className="mb-6 flex items-center gap-3 bg-red-900/30 border border-red-700 rounded-lg px-4 py-3">
          <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          <span className="text-red-100 font-semibold">Recording</span>
          <span className="font-mono text-red-200">{formatTime(recordingTime)}</span>
        </div>
      )}

      {/* ── Uploading Indicator ──────────────────────────────
           Shown on BOTH host and guest while their file is
           being uploaded to S3 after recording stops. */}
      {isUploading && (
        <div className="mb-6 flex items-center gap-3 bg-blue-900/30 border border-blue-700 rounded-lg px-4 py-3">
          <svg className="animate-spin h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-blue-100 font-medium">Uploading recording to S3...</span>
        </div>
      )}

      {/* ── Upload Complete Message ──────────────────────────
           Briefly shown after a successful upload. */}
      {uploadComplete && (
        <div className="mb-6 flex items-center gap-3 bg-green-900/30 border border-green-700 rounded-lg px-4 py-3">
          <span className="text-green-400 text-lg">✓</span>
          <span className="text-green-100 font-medium">Upload complete!</span>
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
        {/* ── Record button — HOST only, shown when connected
             and not currently recording or uploading ──────── */}
        {isHost && connectionStatus === "connected" && !isRecording && !isUploading && (
          <button
            onClick={handleHostStartRecording}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2"
          >
            ⏺ Start Recording
          </button>
        )}

        {/* ── Stop button — HOST only, shown while recording ─ */}
        {isHost && isRecording && (
          <button
            onClick={handleHostStopRecording}
            className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 border border-red-700"
          >
            ⏹ Stop Recording
          </button>
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
                    <p className="text-xs text-gray-500" suppressHydrationWarning>
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
