"use client";

import { useEffect, useState, useRef } from "react";
import Button from "@/components/ui/Button";
import CameraPreview from "./CameraPreview";
import DeviceSelector from "./DeviceSelector";
import MicrophoneMeter from "./MicrophoneMeter";

interface DeviceCheckDialogProps {
  userName: string;
  role: string;
  onJoin: (devices: { videoDeviceId?: string; audioDeviceId?: string }) => void;
}

export default function DeviceCheckDialog({
  userName,
  role,
  onJoin,
}: DeviceCheckDialogProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [selectedAudioId, setSelectedAudioId] = useState<string>("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>("");
  
  const [headphones, setHeadphones] = useState<boolean>(true);
  const [permissionError, setPermissionError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Initial permission check and stream setup
  useEffect(() => {
    let activeStream: MediaStream | null = null;

    async function initMedia() {
      try {
        setLoading(true);
        // Request permissions first
        activeStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        
        setStream(activeStream);
        setPermissionError("");

        // Get default devices after permission is granted
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === "videoinput");
        const audioDevices = devices.filter((d) => d.kind === "audioinput");
        const speakerDevices = devices.filter((d) => d.kind === "audiooutput");

        if (videoDevices.length > 0) setSelectedVideoId(videoDevices[0].deviceId);
        if (audioDevices.length > 0) setSelectedAudioId(audioDevices[0].deviceId);
        if (speakerDevices.length > 0) setSelectedSpeakerId(speakerDevices[0].deviceId);

      } catch (err: any) {
        console.error("Media permission error:", err);
        setPermissionError(
          "Could not access camera or microphone. Please allow permissions in your browser settings and reload."
        );
      } finally {
        setLoading(false);
      }
    }

    initMedia();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Handle device change
  useEffect(() => {
    let newStream: MediaStream | null = null;

    async function updateStream() {
      if (!selectedVideoId && !selectedAudioId) return;

      try {
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
        }

        newStream = await navigator.mediaDevices.getUserMedia({
          video: selectedVideoId ? { deviceId: { exact: selectedVideoId } } : false,
          audio: selectedAudioId ? { deviceId: { exact: selectedAudioId } } : false,
        });

        // Apply toggles to new stream
        newStream.getVideoTracks().forEach((t) => (t.enabled = cameraEnabled));
        newStream.getAudioTracks().forEach((t) => (t.enabled = micEnabled));

        setStream(newStream);
      } catch (err) {
        console.error("Error updating stream:", err);
      }
    }

    // Only update if we already passed the initial loading phase and aren't errored
    if (!loading && !permissionError && (selectedVideoId || selectedAudioId)) {
      updateStream();
    }

    return () => {
      // We don't cleanup the stream here on every dependency change, 
      // only let the next update or unmount handle it to avoid flickering
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVideoId, selectedAudioId]);


  const toggleCamera = () => {
    if (stream) {
      stream.getVideoTracks().forEach((track) => {
        track.enabled = !cameraEnabled;
      });
      setCameraEnabled(!cameraEnabled);
    }
  };

  const toggleMic = () => {
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !micEnabled;
      });
      setMicEnabled(!micEnabled);
    }
  };

  const handleJoin = () => {
    // Cleanup local stream tracks before handing off to room client
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    onJoin({
      videoDeviceId: selectedVideoId,
      audioDeviceId: selectedAudioId,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <p className="text-[var(--text-secondary)]">Checking devices...</p>
      </div>
    );
  }

  if (permissionError) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-6">
        <div className="max-w-md bg-[var(--bg-secondary)] shadow-[var(--shadow-elevated)] rounded-[var(--radius-lg)] p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-medium text-white mb-3">Permission Denied</h2>
          <p className="text-[var(--text-secondary)] mb-8 text-sm leading-relaxed">
            {permissionError}
          </p>
          <Button variant="primary" onClick={() => window.location.reload()} className="w-full">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col md:flex-row items-center justify-center gap-8 lg:gap-12 p-6">
      
      {/* ── Left Side: Camera Preview ── */}
      <div className="w-full max-w-2xl relative aspect-video flex-shrink-0">
        <CameraPreview stream={stream} cameraEnabled={cameraEnabled} />
        
        {/* Toggle buttons over video */}
        <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4">
          <button
            onClick={toggleCamera}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              cameraEnabled ? "bg-gray-800/80 text-white hover:bg-gray-700" : "bg-red-500 text-white hover:bg-red-600"
            }`}
          >
            {cameraEnabled ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /><path strokeLinecap="round" strokeLinejoin="round" d="M4 4l16 16" /></svg>
            )}
          </button>
          <button
            onClick={toggleMic}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              micEnabled ? "bg-gray-800/80 text-white hover:bg-gray-700" : "bg-red-500 text-white hover:bg-red-600"
            }`}
          >
            {micEnabled ? (
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            ) : (
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M4 4l16 16" /></svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Right Side: Device Selection ── */}
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-medium text-white mb-6">Let's check your devices</h1>
          <div className="flex items-center justify-between bg-[var(--bg-secondary)] shadow-sm rounded-[var(--radius-sm)] px-4 py-3 mb-6">
            <span className="text-white font-medium truncate max-w-[200px]">{userName}</span>
            <span className="text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-2 py-1 rounded">
              {role}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <DeviceSelector
            kind="videoinput"
            selectedDeviceId={selectedVideoId}
            onChange={setSelectedVideoId}
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
          />
          
          <div className="space-y-2">
            <DeviceSelector
              kind="audiooutput"
              selectedDeviceId={selectedSpeakerId}
              onChange={setSelectedSpeakerId}
              icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>}
            />
          </div>

          <div className="space-y-2">
            <DeviceSelector
              kind="audioinput"
              selectedDeviceId={selectedAudioId}
              onChange={setSelectedAudioId}
              icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>}
            />
            <MicrophoneMeter stream={stream} micEnabled={micEnabled} />
          </div>
        </div>

        <div className="flex items-center justify-between bg-[var(--bg-secondary)] shadow-sm rounded-[var(--radius-sm)] p-4 mt-4">
          <span className="text-sm text-[var(--text-secondary)]">Using headphones?</span>
          <div className="flex gap-2">
            <button
              onClick={() => setHeadphones(true)}
              className={`px-4 py-1.5 rounded text-sm transition-colors ${
                headphones ? "bg-[var(--bg-tertiary)] text-white shadow-sm" : "bg-transparent text-[var(--text-tertiary)] hover:text-white"
              }`}
            >
              Yes
            </button>
            <button
              onClick={() => setHeadphones(false)}
              className={`px-4 py-1.5 rounded text-sm transition-colors ${
                !headphones ? "bg-[var(--bg-tertiary)] text-white shadow-sm" : "bg-transparent text-[var(--text-tertiary)] hover:text-white"
              }`}
            >
              No
            </button>
          </div>
        </div>

        <Button
          variant="primary"
          size="lg"
          className="w-full mt-6 py-4 text-base font-medium shadow-[var(--shadow-elevated)]"
          onClick={handleJoin}
        >
          Join studio
        </Button>
      </div>
    </div>
  );
}
