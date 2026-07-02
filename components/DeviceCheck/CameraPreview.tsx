"use client";

import { useEffect, useRef } from "react";

interface CameraPreviewProps {
  stream: MediaStream | null;
  cameraEnabled: boolean;
}

export default function CameraPreview({ stream, cameraEnabled }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!cameraEnabled || !stream || stream.getVideoTracks().length === 0) {
    return (
      <div className="w-full h-full bg-[var(--bg-primary)] flex items-center justify-center rounded-xl overflow-hidden border border-[var(--border)]">
        <p className="text-[var(--text-secondary)] font-medium">Camera is off</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-black rounded-xl overflow-hidden border border-[var(--border)]">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover transform -scale-x-100"
      />
    </div>
  );
}
