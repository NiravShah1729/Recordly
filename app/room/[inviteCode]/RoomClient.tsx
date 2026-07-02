"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";
import type { types as mediasoupTypes } from "mediasoup-client";
import Link from "next/link";
import CopyButton from "@/components/CopyButton/index";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import DeviceCheckDialog from "@/components/DeviceCheck/DeviceCheckDialog";
import { useRouter } from "next/navigation";

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
      className="w-full rounded-xl border border-gray-700 bg-gray-800"
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

  // ── Recording refs (UNCHANGED from P2P version) ───────────────
  // MediaRecorder records the local camera+mic stream
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  // Chunks of recorded data collected every 1 second
  const recordedChunksRef = useRef<Blob[]>([]);
  // Timer interval that ticks the on-screen counter
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  // The shared start timestamp — same value on both host and guest
  // so we can later align the recordings with FFmpeg
  const sharedStartTimeRef = useRef<number | null>(null);

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

  // Recording State (UNCHANGED from P2P version)
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  // Upload state — shown while the file is being sent to S3
  const [isUploading, setIsUploading] = useState(false);
  // Brief "Upload complete" message
  const [uploadComplete, setUploadComplete] = useState(false);

  // ── Combined Recording State (UNCHANGED from P2P version) ────
  // Tracks the status of FFmpeg combining all participants' recordings
  const [combineStatus, setCombineStatus] = useState<string>("PENDING");
  const [combinedUrl, setCombinedUrl] = useState<string | null>(null);

  // ──────────────────────────────────────────────────────────────
  // startLocalRecording — records THIS browser's localStream
  // Called on BOTH host and guest when the "start-recording"
  // socket event fires. The sharedStartTime is passed in so
  // both sides store the same timestamp.
  // (UNCHANGED from P2P version)
  // ──────────────────────────────────────────────────────────────
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

    // Reset combined video state so the client polls for the new one
    setCombineStatus("PENDING");
    setCombinedUrl(null);

    // Tick the on-screen timer every second
    recordingTimerRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);
  }, [room.id, router]);

  // ──────────────────────────────────────────────────────────────
  // stopLocalRecording — stops the MediaRecorder and timer.
  // The recorder.onstop handler (above) will automatically
  // upload the file to S3.
  // (UNCHANGED from P2P version)
  // ──────────────────────────────────────────────────────────────
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
      const response: any = await new Promise((resolve) => {
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

      // Add this track to the remote peer's MediaStream.
      // If this is the first track from this peer, create a new MediaStream.
      // If it's the second (e.g. audio after video), add to the existing one.
      setRemoteStreams((prev) => {
        const updated = new Map(prev);
        const existingStream = updated.get(socketId);
        if (existingStream) {
          // Peer already has a stream (e.g. we got video, now getting audio)
          // We mutate the existing stream. The RemoteVideo component will handle the rest.
          existingStream.addTrack(consumer.track);
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
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err: any) {
        console.error("Media error:", err);
        setMediaError(err.message || "Could not access camera/microphone. Please allow permissions.");
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
          const joinResponse: any = await new Promise((resolve) => {
            socket.emit("join-room", { roomId: room.id }, resolve);
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
          const sendTransportResponse: any = await new Promise((resolve) => {
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
            }, (response: any) => {
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
            }, (response: any) => {
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
          const recvTransportResponse: any = await new Promise((resolve) => {
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
            }, (response: any) => {
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
          // STEP 8: Consume existing producers in the room
          // If other peers are already in the room when we join,
          // the server gives us a list of their producers.
          // We consume each one to see/hear them.
          // ──────────────────────────────────────────────────
          const existingProducers: ProducerInfo[] = await new Promise((resolve) => {
            socket.emit("getProducers", resolve);
          });

          console.log(`[Mediasoup] Found ${existingProducers.length} existing producers`);

          for (const producerInfo of existingProducers) {
            await consumeProducer(socket, recvTransport, device, producerInfo);
          }

          // ──────────────────────────────────────────────────
          // STEP 9: Listen for NEW producers
          // When someone joins after us or starts a new track,
          // the server broadcasts "new-producer". We consume it.
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

          // ──────────────────────────────────────────────────
          // STEP 10: Listen for peers leaving
          // When someone disconnects, remove their stream
          // from our remoteStreams Map so their video disappears.
          // ──────────────────────────────────────────────────
          socket.on("peer-left", ({ socketId }: { socketId: string }) => {
            console.log("[Mediasoup] Peer left:", socketId);

            setRemoteStreams((prev) => {
              const updated = new Map(prev);
              // Stop all tracks before removing
              const stream = updated.get(socketId);
              if (stream) {
                stream.getTracks().forEach((t) => t.stop());
              }
              updated.delete(socketId);

              // If no remote peers left, set status to disconnected
              if (updated.size === 0) {
                setConnectionStatus("disconnected");
              }

              return updated;
            });
          });

        } catch (err) {
          console.error("[Mediasoup] Setup error:", err);
        }
      });

      // ────────────────────────────────────────────────────────
      // RECORDING SOCKET EVENTS (UNCHANGED from P2P version)
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
  }, [room.id, consumeProducer, startLocalRecording, stopLocalRecording]);

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
    // Only poll if there are recordings and status is not final
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
      router.push("/dashboard");
    } catch (err) {
      console.error("Error ending session:", err);
    }
  };

  // ── HOST-ONLY button handlers (UNCHANGED from P2P version) ──
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
  function formatTime(ms: number) {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const s = (totalSeconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  // ── Status indicator config ───────────────────────────────
  const statusConfig = {
    waiting: { label: "Waiting for participants...", color: "bg-yellow-500", icon: "🟡" },
    connected: { label: "Connected", color: "bg-green-500", icon: "🟢" },
    disconnected: { label: "Disconnected", color: "bg-red-500", icon: "🔴" },
  };
  const currentStatus = statusConfig[connectionStatus];

  // ── Video grid layout ─────────────────────────────────────
  // Total participants = 1 (you) + number of remote streams
  const totalParticipants = 1 + remoteStreams.size;
  // Pick a grid layout based on how many people are in the room
  const gridCols =
    totalParticipants === 1 ? "grid-cols-1" :
    totalParticipants === 2 ? "grid-cols-1 md:grid-cols-2" :
    totalParticipants === 3 ? "grid-cols-1 md:grid-cols-3" :
    "grid-cols-1 md:grid-cols-2"; // 4+ people: 2 columns, wrapping

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
    <div className="min-h-[calc(100vh-57px)] bg-[var(--bg-primary)] text-[var(--text-primary)] p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Room Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{room.name}</h1>
            {room.description && (
              <p className="text-[var(--text-secondary)] mt-1">{room.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <StatusBadge status={currentRoomStatus as any} />
              <span className="text-xs text-[var(--text-tertiary)] bg-[var(--bg-secondary)] px-3 py-1.5 rounded-full">
                {isHost ? "Host" : "Participant"}
              </span>
              <span className="text-xs text-[var(--text-tertiary)] bg-[var(--bg-secondary)] px-3 py-1.5 rounded-full">
                {totalParticipants} participant{totalParticipants !== 1 ? "s" : ""}
              </span>
              <span className="text-xs text-[var(--text-tertiary)] hidden sm:inline ml-1">
                Hosted by {room.host.name || room.host.email}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${currentStatus.color.replace('bg-yellow-500', 'bg-yellow-500').replace('bg-green-500', 'bg-green-500').replace('bg-red-500', 'bg-red-500')}`} />
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              {currentStatus.label.replace('Waiting for participants...', 'Waiting')}
            </span>
          </div>
        </div>

        {/* Media Error */}
        {mediaError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-[var(--radius-sm)] p-4 mb-6">
            <p className="text-sm text-red-400">{mediaError}</p>
          </div>
        )}

        {/* ── Indicators ────────────────────────────── */}
        <div className="flex flex-col gap-3 mb-6">
          {isRecording && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-[var(--radius-sm)] px-4 py-3 max-w-sm">
              <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
              <span className="text-red-400 font-medium text-sm">Recording</span>
              <span className="font-mono text-red-400/80 text-sm ml-auto">{formatTime(recordingTime)}</span>
            </div>
          )}

          {isUploading && (
            <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-[var(--radius-sm)] px-4 py-3 max-w-sm">
              <svg className="animate-spin h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-blue-400 font-medium text-sm">Uploading to S3...</span>
            </div>
          )}

          {uploadComplete && (
            <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-[var(--radius-sm)] px-4 py-3 max-w-sm">
              <span className="text-green-400 text-lg">✓</span>
              <span className="text-green-400 font-medium text-sm">Upload complete</span>
            </div>
          )}
        </div>

        {/* ── Video Grid ─────────────────────────────────────── */}
        <div className={`grid ${gridCols} gap-6 mb-8`}>
          {/* Local Video */}
          <div className="relative aspect-video bg-[var(--bg-secondary)] rounded-[var(--radius)] shadow-[var(--shadow-subtle)] overflow-hidden">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover transform -scale-x-100"
            />
            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-md">
              <span className="text-xs font-medium text-white">You {isHost ? "(Host)" : ""}</span>
            </div>
          </div>

          {/* Remote Videos */}
          {remoteStreams.size === 0 && (
            <div className="relative aspect-video bg-[var(--bg-secondary)] rounded-[var(--radius)] flex items-center justify-center shadow-[var(--shadow-subtle)]">
              <div className="text-center">
                <p className="text-[var(--text-tertiary)] text-sm mb-3">Waiting for participants</p>
                {isHost && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <code className="bg-[var(--bg-tertiary)] px-4 py-2 rounded-md text-sm">
                      {`${nextAuthUrl}/room/${room.inviteCode}`}
                    </code>
                    <CopyButton text={`${nextAuthUrl}/room/${room.inviteCode}`} />
                  </div>
                )}
              </div>
            </div>
          )}
          {Array.from(remoteStreams.entries()).map(([socketId, stream]) => (
            <div key={socketId} className="relative aspect-video bg-[var(--bg-secondary)] rounded-[var(--radius)] shadow-[var(--shadow-subtle)] overflow-hidden">
              <RemoteVideo stream={stream} socketId={socketId} />
              <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-md">
                <span className="text-xs font-medium text-white">Participant</span>
              </div>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-4 mt-12 mb-6">
          {isHost && connectionStatus === "connected" && !isRecording && !isUploading && (
            <Button variant="primary" size="lg" onClick={handleHostStartRecording} className="bg-red-600 hover:bg-red-700 text-white border-transparent">
              <span className="w-2.5 h-2.5 bg-white rounded-full inline-block mr-1" />
              Start Recording
            </Button>
          )}

          {isHost && isRecording && (
            <Button variant="secondary" size="lg" onClick={handleHostStopRecording} className="border-red-500/50 hover:bg-red-500/10 text-red-400">
              <span className="w-2.5 h-2.5 bg-red-400 rounded-sm inline-block mr-1" />
              Stop Recording
            </Button>
          )}

          {isHost && (
            <Button variant="secondary" size="lg" onClick={handleEndSession}>
              End Session
            </Button>
          )}

          {/* Link to recordings */}
          <div className="ml-auto">
            <Link href={`/recordings/${room.id}`}>
              <Button variant="ghost" size="md">
                View Recordings →
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
