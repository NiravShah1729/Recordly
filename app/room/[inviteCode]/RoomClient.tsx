"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";
import type { types as mediasoupTypes } from "mediasoup-client";
import Link from "next/link";
import  CopyButton  from "@/components/CopyButton";
import { InviteDialog } from "@/components/ui/InviteDialog";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import DeviceCheckDialog from "@/components/DeviceCheck/DeviceCheckDialog";
import { useRouter } from "next/navigation";
import { useChunkedRecorder } from "@/hooks/useChunkedRecorder";

const RemoteVideo = ({ stream, socketId }: { stream: MediaStream, socketId: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (el && el.srcObject !== stream) {
      el.srcObject = stream;
    }
  }, [stream]);

  // Ensure playback starts when tracks are added dynamically
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const handleAddTrack = (e: MediaStreamTrackEvent) => {
      console.log(`[RemoteVideo] Track added (${e.track.kind}) for peer ${socketId}`);
      el.play().catch(err => {
        if (err.name !== 'AbortError') console.error("[RemoteVideo] Play error:", err);
      });
    };

    stream.addEventListener("addtrack", handleAddTrack);
    // Also try to play immediately just in case
    el.play().catch(err => {
      if (err.name !== 'AbortError') console.error("[RemoteVideo] Initial play error:", err);
    });

    return () => stream.removeEventListener("addtrack", handleAddTrack);
  }, [stream, socketId]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className="w-full h-full object-cover"
    />
  );
};

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
  currentUserName: string;
}

// ── Types for mediasoup server events ──────────────────────────
// What the server sends when a new producer is created by another peer
type ProducerInfo = {
  producerId: string;
  socketId: string;
  kind: string;
};

// Response types for mediasoup socket events
interface SocketErrorResponse {
  error: string;
}

interface TransportParams {
  id: string;
  iceParameters: mediasoupTypes.IceParameters;
  iceCandidates: mediasoupTypes.IceCandidate[];
  dtlsParameters: mediasoupTypes.DtlsParameters;
  sender: boolean;
}

interface TransportResponse {
  error?: string;
  params: TransportParams;
}

interface ConsumeResponseParams {
  id: string;
  producerId: string;
  kind: mediasoupTypes.MediaKind;
  rtpParameters: mediasoupTypes.RtpParameters;
}

interface ConsumeResponse {
  error?: string;
  params: ConsumeResponseParams;
}

interface JoinRoomResponse {
  error?: string;
  rtpCapabilities: mediasoupTypes.RtpCapabilities;
}

interface ProduceResponse {
  error?: string;
  id: string;
}

interface ConnectResponse {
  error?: string;
  success?: boolean;
}

// ── Component ──────────────────────────────────────────────────
export default function RoomClient({ room, isHost, nextAuthUrl, currentUserName }: RoomClientProps) {
  // ── Video refs ────────────────────────────────────────────────
  // localVideoRef — the <video> element showing YOUR camera
  const localVideoRef = useRef<HTMLVideoElement>(null);
  // localStreamRef — the raw MediaStream from getUserMedia (used by MediaRecorder for recording)
  const localStreamRef = useRef<MediaStream | null>(null);

  // ── Socket ref ────────────────────────────────────────────────
  // Single socket connection to the mediasoup server (handles WebRTC + recording signals)
  const socketRef = useRef<Socket | null>(null);

  // ── Mediasoup refs ────────────────────────────────────────────
  // The mediasoup Device — like a "browser capability descriptor" that knows
  // what codecs your browser supports. Created once, used for all transports.
  const deviceRef = useRef<mediasoupClient.Device | null>(null);
  // Send transport — the "upload pipe" that sends your camera/mic to the server
  const sendTransportRef = useRef<mediasoupTypes.Transport | null>(null);
  // Receive transport — the "download pipe" that receives other peoples' streams
  const recvTransportRef = useRef<mediasoupTypes.Transport | null>(null);
  // Store all producers we created (video + audio) so we can close them on unmount
  const producersRef = useRef<mediasoupTypes.Producer[]>([]);
  // Store all consumers we created so we can close them on unmount
  const consumersRef = useRef<mediasoupTypes.Consumer[]>([]);

  // ── Recording State ─────────────────────────────────────────────
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  
  const {
    startRecording,
    stopRecording,
    state: { isRecording, recordingId, uploadedParts }
  } = useChunkedRecorder(localStream, room.id);

  // Ref to track latest functions and state for socket event handler without re-running effects
  const isRecordingRef = useRef(false);
  const startRecordingRef = useRef(startRecording);
  const stopRecordingRef = useRef(stopRecording);

  useEffect(() => {
    isRecordingRef.current = isRecording;
    startRecordingRef.current = startRecording;
    stopRecordingRef.current = stopRecording;
  }, [isRecording, startRecording, stopRecording]);

  // ── State ─────────────────────────────────────────────────────
  const router = useRouter();
  
  // Device Check State
  const [showDeviceCheck, setShowDeviceCheck] = useState(true);
  const [selectedDevices, setSelectedDevices] = useState<{videoDeviceId?: string, audioDeviceId?: string}>({});

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("waiting");
  const [mediaError, setMediaError] = useState("");
  const [currentRoomStatus, setCurrentRoomStatus] = useState(room.status);

  // Remote participants — a Map of socketId → MediaStream
  // Each remote peer gets their own MediaStream containing their video+audio tracks
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  // ── Combined Recording State (UNCHANGED from P2P version) ────
  // Tracks the status of FFmpeg combining all participants' recordings
  const [combineStatus, setCombineStatus] = useState<string>("PENDING");
  const [combinedUrl, setCombinedUrl] = useState<string | null>(null);

  // (Recording functions handled by useChunkedRecorder hook)

  // ──────────────────────────────────────────────────────────────
  // consumeProducer — Downloads a single remote producer's track
  //
  // When someone in the room starts sending their camera or mic,
  // the server tells us "hey, there's a new producer". We call
  // this function to create a Consumer that downloads that track
  // and adds it to a MediaStream for that remote peer.
  //
  // Each remote peer can have TWO producers (video + audio), so
  // we merge both tracks into a single MediaStream per peer.
  // ──────────────────────────────────────────────────────────────
  const consumeProducer = useCallback(async (
    socket: Socket,
    recvTransport: mediasoupTypes.Transport,
    device: mediasoupClient.Device,
    producerInfo: ProducerInfo,
  ) => {
    const { producerId, socketId, kind } = producerInfo;

    try {
      // Ask the server to create a Consumer for this producer
      // We send our transport ID so the server knows which pipe to use,
      // the producer ID we want to consume, and our RTP capabilities
      // so the server can check codec compatibility.
      const response: ConsumeResponse = await new Promise((resolve) => {
        socket.emit("consume", {
          transportId: recvTransport.id,
          producerId,
          rtpCapabilities: device.rtpCapabilities,
        }, resolve);
      });

      if (response.error) {
        console.error("[Mediasoup] consume error:", response.error);
        return;
      }

      const { params } = response;

      // Create the Consumer — this gives us the actual media track
      const consumer = await recvTransport.consume({
        id: params.id,
        producerId: params.producerId,
        kind: params.kind,
        rtpParameters: params.rtpParameters,
      });

      // Store so we can close on unmount
      consumersRef.current.push(consumer);

      // Tell the server to unpause (mediasoup starts consumers paused by default)
      await new Promise<void>((resolve) => {
        socket.emit("consumer-resume", { consumerId: consumer.id }, () => resolve());
      });

      setRemoteStreams((prev) => {
        const updated = new Map(prev);
        const existingStream = updated.get(socketId);
        
        if (existingStream) {
          // CRITICAL FIX: Create a NEW MediaStream instead of mutating the existing one.
          // Mutating a MediaStream doesn't change its reference, so React and the <video> 
          // element might not detect the new track (e.g. when audio is added after video).
          const newStream = new MediaStream([...existingStream.getTracks(), consumer.track]);
          updated.set(socketId, newStream);
        } else {
          // First track from this peer — create new stream
          updated.set(socketId, new MediaStream([consumer.track]));
        }

        return updated;
      });

      // We have at least one remote peer → we're connected
      setConnectionStatus("connected");

      console.log(`[Mediasoup] Consuming ${kind} from peer ${socketId}`);
    } catch (err) {
      console.error("[Mediasoup] Error consuming producer:", err);
    }
  }, []);

  // ── Main Effect: Setup media + mediasoup ──────────────────────
  useEffect(() => {
    if (showDeviceCheck) return;
    
    let isMounted = true;

    async function init() {
      // ────────────────────────────────────────────────────────
      // STEP 1: Get local camera + microphone
      // This is the same getUserMedia call as before.
      // The stream goes into localStreamRef for recording.
      // ────────────────────────────────────────────────────────
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setMediaError("Media devices API not available (requires HTTPS or localhost). Please use ngrok or enable Chrome's insecure origins flag.");
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: selectedDevices.videoDeviceId ? { deviceId: { exact: selectedDevices.videoDeviceId } } : true,
          audio: selectedDevices.audioDeviceId ? { deviceId: { exact: selectedDevices.audioDeviceId } } : true,
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err: unknown) {
        console.error("Media error:", err);
        const message = err instanceof Error ? err.message : "Could not access camera/microphone. Please allow permissions.";
        setMediaError(message);
        return;
      }

      // ────────────────────────────────────────────────────────
      // STEP 2: Connect to the mediasoup server via Socket.io
      // Unlike before (where we connected to the Next.js server),
      // we now connect to the mediasoup Docker server on port 3000.
      // ────────────────────────────────────────────────────────
      // Connect to Mediasoup via Next.js proxy to avoid Mixed Content errors on HTTPS
      const socket = io(window.location.origin, {
        path: "/mediasoup-socket/",
        transports: ["websocket", "polling"],
      });
      socketRef.current = socket;

      socket.on("connect", async () => {
        console.log("[Mediasoup] Socket connected:", socket.id);

        try {
          // ──────────────────────────────────────────────────
          // STEP 3: Join the room on the mediasoup server
          // The server creates a Router for the room (if it
          // doesn't exist) and sends back its RTP capabilities.
          // ──────────────────────────────────────────────────
          const joinResponse: JoinRoomResponse = await new Promise((resolve) => {
            socket.emit("join-room", { roomId: room.id, isHost }, resolve);
          });

          if (joinResponse.error) {
            console.error("[Mediasoup] join-room error:", joinResponse.error);
            return;
          }

          const { rtpCapabilities } = joinResponse;

          // ──────────────────────────────────────────────────
          // STEP 4: Create the mediasoup Device
          // The Device is like a "codec negotiator". It loads
          // the server's RTP capabilities and figures out what
          // codecs we can use for sending/receiving.
          // ──────────────────────────────────────────────────
          const device = new mediasoupClient.Device();
          await device.load({ routerRtpCapabilities: rtpCapabilities });
          deviceRef.current = device;
          console.log("[Mediasoup] Device loaded. Can produce video:", device.canProduce("video"));

          // ──────────────────────────────────────────────────
          // STEP 5: Create Send Transport (upload pipe)
          // This transport handles sending OUR camera+mic
          // to the server. We ask the server to create the
          // server-side transport, then create our local side.
          // ──────────────────────────────────────────────────
          const sendTransportResponse: TransportResponse = await new Promise((resolve) => {
            socket.emit("createWebRtcTransport", { sender: true }, resolve);
          });

          if (sendTransportResponse.error) {
            console.error("[Mediasoup] Send transport error:", sendTransportResponse.error);
            return;
          }

          const sendTransport = device.createSendTransport(sendTransportResponse.params);
          sendTransportRef.current = sendTransport;

          // When mediasoup needs to connect the transport (DTLS handshake),
          // forward the parameters to the server
          sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
            socket.emit("transport-connect", {
              transportId: sendTransport.id,
              dtlsParameters,
            }, (response: ConnectResponse) => {
              if (response.error) {
                errback(new Error(response.error));
              } else {
                callback();
              }
            });
          });

          // When mediasoup wants to produce (send a track), tell the server
          // so it can create a server-side Producer and return its ID
          sendTransport.on("produce", ({ kind, rtpParameters }, callback, errback) => {
            socket.emit("transport-produce", {
              transportId: sendTransport.id,
              kind,
              rtpParameters,
            }, (response: ProduceResponse) => {
              if (response.error) {
                errback(new Error(response.error));
              } else {
                // Give the server's producer ID back to mediasoup
                callback({ id: response.id });
              }
            });
          });

          // ──────────────────────────────────────────────────
          // STEP 6: Create Receive Transport (download pipe)
          // This transport handles receiving OTHER peoples'
          // streams from the server.
          // ──────────────────────────────────────────────────
          const recvTransportResponse: TransportResponse = await new Promise((resolve) => {
            socket.emit("createWebRtcTransport", { sender: false }, resolve);
          });

          if (recvTransportResponse.error) {
            console.error("[Mediasoup] Recv transport error:", recvTransportResponse.error);
            return;
          }

          const recvTransport = device.createRecvTransport(recvTransportResponse.params);
          recvTransportRef.current = recvTransport;

          // Same connect handler as send transport
          recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
            socket.emit("transport-connect", {
              transportId: recvTransport.id,
              dtlsParameters,
            }, (response: ConnectResponse) => {
              if (response.error) {
                errback(new Error(response.error));
              } else {
                callback();
              }
            });
          });

          // ──────────────────────────────────────────────────
          // STEP 7: Produce (send) our local tracks
          // Take the video and audio tracks from getUserMedia
          // and send them through the send transport.
          // ──────────────────────────────────────────────────
          const localStream = localStreamRef.current;
          if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
              const videoProducer = await sendTransport.produce({ track: videoTrack });
              producersRef.current.push(videoProducer);
              console.log("[Mediasoup] Video producer created:", videoProducer.id);
            }

            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
              const audioProducer = await sendTransport.produce({ track: audioTrack });
              producersRef.current.push(audioProducer);
              console.log("[Mediasoup] Audio producer created:", audioProducer.id);
            }
          }

          // ──────────────────────────────────────────────────
          // STEP 8: Listen for NEW producers and peers leaving
          // (Register these BEFORE getting existing producers to avoid race conditions)
          // ──────────────────────────────────────────────────
          socket.on("new-producer", async (producerInfo: ProducerInfo) => {
            console.log("[Mediasoup] New producer:", producerInfo);
            if (deviceRef.current && recvTransportRef.current) {
              await consumeProducer(
                socket,
                recvTransportRef.current,
                deviceRef.current,
                producerInfo,
              );
            }
          });

          socket.on("peer-left", ({ socketId }: { socketId: string }) => {
            console.log("[Mediasoup] Peer left:", socketId);
            setRemoteStreams((prev) => {
              const updated = new Map(prev);
              const stream = updated.get(socketId);
              if (stream) {
                stream.getTracks().forEach((t) => t.stop());
              }
              updated.delete(socketId);
              if (updated.size === 0) setConnectionStatus("disconnected");
              return updated;
            });
          });

          socket.on("session-ended", () => {
            console.log("[Mediasoup] Host ended the session.");
            alert("The host has ended the session.");
            localStreamRef.current?.getTracks().forEach((t) => t.stop());
            router.push('/dashboard');
          });

          // ──────────────────────────────────────────────────
          // STEP 9: Consume existing producers in the room
          // ──────────────────────────────────────────────────
          const existingProducers: ProducerInfo[] = await new Promise((resolve) => {
            socket.emit("getProducers", resolve);
          });

          console.log(`[Mediasoup] Found ${existingProducers.length} existing producers`);

          for (const producerInfo of existingProducers) {
            await consumeProducer(socket, recvTransport, device, producerInfo);
          }



        } catch (err) {
          console.error("[Mediasoup] Setup error:", err);
        }
      });

      // ────────────────────────────────────────────────────────
      // RECORDING SOCKET EVENTS
      // ────────────────────────────────────────────────────────
      
      const handleStartRecording = () => {
        console.log("[Recording] Received start-recording event");
        if (isRecordingRef.current) {
          console.log("[Recording] Ignoring start-recording: already recording");
          return;
        }
        startRecordingRef.current();
      };

      const handleStopRecording = () => {
        console.log("[Recording] Received stop-recording event");
        stopRecordingRef.current();
      };

      socket.on("start-recording", handleStartRecording);
      socket.on("stop-recording", handleStopRecording);
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
      if (socketRef.current) {
        socketRef.current.off("start-recording");
        socketRef.current.off("stop-recording");
      }

      // Close mediasoup producers
      producersRef.current.forEach((p) => {
        try { p.close(); } catch (_) { /* already closed */ }
      });

      // Close mediasoup consumers
      consumersRef.current.forEach((c) => {
        try { c.close(); } catch (_) { /* already closed */ }
      });

      // Close transports (this also cleans up server-side resources)
      if (sendTransportRef.current) {
        try { sendTransportRef.current.close(); } catch (_) { /* already closed */ }
      }
      if (recvTransportRef.current) {
        try { recvTransportRef.current.close(); } catch (_) { /* already closed */ }
      }

      // Disconnect socket
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    room.id,
    showDeviceCheck,
    selectedDevices.videoDeviceId,
    selectedDevices.audioDeviceId
  ]);

  // ── Auto-LIVE on connect (UNCHANGED from P2P version) ─────
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

  // ── Poll for combined recording status (UNCHANGED from P2P version) ─
  useEffect(() => {
    // Only poll if the room has ended, there are recordings, and status is not final
    if (currentRoomStatus !== "ENDED") return;
    if (room.recordings.length === 0) return;
    if (combineStatus === "READY" || combineStatus === "FAILED") return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/rooms/${room.id}/combined`);
        const data = await res.json();

        if (data.combineStatus) {
          setCombineStatus(data.combineStatus);
        }
        if (data.combinedUrl) {
          setCombinedUrl(data.combinedUrl);
        }

        // Stop polling once we have a final status
        if (data.combineStatus === "READY" || data.combineStatus === "FAILED") {
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error("Error polling combine status:", err);
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [room.id, room.recordings.length, combineStatus]);

  // ── End Session (UNCHANGED from P2P version) ────────────────
  const handleEndSession = async () => {
    if (!confirm("Are you sure you want to end this session?")) return;
    
    try {
      setCurrentRoomStatus("ENDED");
      await fetch(`/api/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ENDED" }),
      });
      
      // Notify other peers and stop local tracks
      if (socketRef.current) {
        socketRef.current.emit('end-session');
      }
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      
      router.push("/dashboard");
    } catch (err) {
      console.error("Error ending session:", err);
    }
  };

  // ── HOST-ONLY button handlers ──
  const handleHostStartRecording = async () => {
    if (!localStreamRef.current) {
      alert("Cannot start recording — camera/mic not available.");
      return;
    }

    try {
      // The host + all connected remote peers
      const expectedCount = remoteStreams.size + 1;
      await fetch(`/api/rooms/${room.id}/set-recording-count`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedCount })
      });
    } catch (e) {
      console.error("Failed to set recording count:", e);
    }

    socketRef.current?.emit("host-start-recording", { roomId: room.id });
  };

  const handleHostStopRecording = () => {
    socketRef.current?.emit("host-stop-recording", { roomId: room.id });
  };

  // ── Audio / Video toggle state ─────────────────────────────
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

  const toggleAudio = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = !t.enabled;
      });
      setIsAudioMuted(prev => !prev);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => {
        t.enabled = !t.enabled;
      });
      setIsVideoOff(prev => !prev);
    }
  };

  const handleOpenInviteDialog = () => {
    setIsInviteDialogOpen(true);
  };


  // ── Status indicator config ───────────────────────────────
  const statusConfig = {
    waiting: { label: "Waiting for participants...", color: "bg-yellow-500", icon: "🟡" },
    connected: { label: "Connected", color: "bg-green-500", icon: "🟢" },
    disconnected: { label: "Disconnected", color: "bg-red-500", icon: "🔴" },
  };
  const currentStatus = statusConfig[connectionStatus];

  // ── Video grid layout ─────────────────────────────────────
  const totalParticipants = 1 + remoteStreams.size;

  // ── Render ────────────────────────────────────────────────
  if (showDeviceCheck) {
    return (
      <DeviceCheckDialog
        userName={currentUserName}
        role={isHost ? "Host" : "Participant"}
        onJoin={(devices) => {
          setSelectedDevices(devices);
          setShowDeviceCheck(false);
        }}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#0E0E0E] text-white overflow-hidden">
      {/* ── Top Bar ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-[var(--text-tertiary)] hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          </Link>
          <span className="text-sm font-medium text-[var(--text-secondary)]">{room.name}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Recording indicator in top bar */}
          {isRecording && (
            <div className="flex items-center gap-2 bg-red-500/15 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs font-mono text-red-400">
                Recording {uploadedParts > 0 && `(Parts: ${uploadedParts})`}
              </span>
            </div>
          )}

          {/* Participant count */}
          <div className="flex items-center gap-1.5 bg-[#1A1A1A] px-3 py-1.5 rounded-full">
            <svg className="w-3.5 h-3.5 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
            </svg>
            <span className="text-xs text-[var(--text-secondary)]">{totalParticipants}</span>
          </div>

          {/* Live indicator */}
          {currentRoomStatus === "LIVE" && (
            <div className="flex items-center gap-2 bg-[#1A1A1A] px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium text-white">Live</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Media Error ─────────────────────────────────────── */}
      {mediaError && (
        <div className="mx-5 mb-2 bg-red-500/10 rounded-lg p-3">
          <p className="text-sm text-red-400">{mediaError}</p>
        </div>
      )}

      {/* ── Video Grid Area ─────────────────────────────────── */}
      <div className="flex-1 px-5 pb-2 min-h-0">
        <div className={`h-full gap-3 ${
          totalParticipants === 1
            ? 'flex items-center justify-center'
            : totalParticipants === 2
              ? 'grid grid-cols-2'
              : totalParticipants === 3
                ? 'grid grid-cols-3'
                : 'grid grid-cols-2 grid-rows-2'
        }`}>
          {/* Local Video */}
          <div className={`relative bg-[#1A1A1A] rounded-2xl overflow-hidden ${
            totalParticipants === 1
              ? 'w-full max-w-4xl aspect-video'
              : 'w-full h-full'
          }`}>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover transform -scale-x-100"
            />
            {/* Name label */}
            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-md">
              <span className="text-xs font-medium text-white">{currentUserName || "You"}</span>
            </div>
          </div>

          {/* Remote Videos */}
          {Array.from(remoteStreams.entries()).map(([socketId, stream]) => (
            <div key={socketId} className="relative bg-[#1A1A1A] rounded-2xl overflow-hidden w-full h-full">
              <RemoteVideo stream={stream} socketId={socketId} />
              <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-md">
                <span className="text-xs font-medium text-white">Participant</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom Action Bar ───────────────────────────────── */}
      <div className="flex items-center justify-center gap-2 px-5 py-4 flex-shrink-0">
        {/* Record Button */}
        {isHost && (
          <button
            onClick={isRecording ? handleHostStopRecording : handleHostStartRecording}
            disabled={!isRecording && connectionStatus !== "connected"}
            className={`flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl transition-all ${
              isRecording
                ? 'bg-red-600 hover:bg-red-700'
                : 'hover:bg-[#1A1A1A]'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              isRecording ? 'bg-white/20' : 'bg-red-600'
            }`}>
              {isRecording ? (
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="6" />
                </svg>
              )}
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">
              {isRecording ? 'Stop' : 'Record'}
            </span>
          </button>
        )}

        {/* Audio Button */}
        <button
          onClick={toggleAudio}
          className={`flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl transition-all hover:bg-[#1A1A1A] ${
            isAudioMuted ? 'opacity-50' : ''
          }`}
        >
          <div className="w-9 h-9 rounded-lg bg-[#1A1A1A] flex items-center justify-center relative">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
            {isAudioMuted && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-[1.5px] h-7 bg-red-500 rotate-45 rounded-full" />
              </div>
            )}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">Audio</span>
        </button>

        {/* Video Button */}
        <button
          onClick={toggleVideo}
          className={`flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl transition-all hover:bg-[#1A1A1A] ${
            isVideoOff ? 'opacity-50' : ''
          }`}
        >
          <div className="w-9 h-9 rounded-lg bg-[#1A1A1A] flex items-center justify-center relative">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
            </svg>
            {isVideoOff && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-[1.5px] h-7 bg-red-500 rotate-45 rounded-full" />
              </div>
            )}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">Video</span>
        </button>

        {/* Invite Button */}
        <button
          onClick={handleOpenInviteDialog}
          className="flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl transition-all hover:bg-[#1A1A1A] relative"
        >
          <div className="w-9 h-9 rounded-lg bg-[#1A1A1A] flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
            </svg>
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">Invite</span>
        </button>

        {/* Separator */}
        <div className="w-px h-10 bg-[#2A2A2A] mx-1" />

        {/* End Session (Host) or Leave (Guest) */}
        {isHost ? (
          <button
            onClick={handleEndSession}
            className="flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl transition-all hover:bg-red-500/10"
          >
            <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
              </svg>
            </div>
            <span className="text-[11px] text-red-400">End</span>
          </button>
        ) : (
          <button
            onClick={() => router.push('/dashboard')}
            className="flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl transition-all hover:bg-red-500/10"
          >
            <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
            </div>
            <span className="text-[11px] text-red-400">Leave</span>
          </button>
        )}
      </div>

      <InviteDialog
        isOpen={isInviteDialogOpen}
        onClose={() => setIsInviteDialogOpen(false)}
        inviteUrl={`${nextAuthUrl}/room/${room.inviteCode}`}
      />
    </div>
  );
}
