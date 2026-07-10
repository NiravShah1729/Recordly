"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";

interface CombinedRecordingPlayerProps {
  roomId: string;
  roomName: string;
  initialStatus: string;
  initialUrl: string | null;
}

export default function CombinedRecordingPlayer({
  roomId,
  roomName,
  initialStatus,
  initialUrl,
}: CombinedRecordingPlayerProps) {
  const [status, setStatus] = useState(initialStatus);
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    // Only poll if combineStatus is PENDING or PROCESSING
    if (status !== "PENDING" && status !== "PROCESSING") return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/rooms/${roomId}/combined`);
        if (!res.ok) return;
        const data = await res.json();
        
        setStatus(data.combineStatus);
        setUrl(data.combinedUrl);
      } catch (error) {
        console.error("Error polling combined recording status:", error);
      }
    };

    // Poll immediately, then every 3 seconds
    poll();
    const interval = setInterval(poll, 3000);

    return () => clearInterval(interval);
  }, [roomId, status]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/combined`, {
        method: "POST",
      });
      if (res.ok) {
        setStatus("PENDING");
        setUrl(null);
      } else {
        alert("Failed to restart combining process.");
      }
    } catch (error) {
      console.error("Error retrying combine process:", error);
      alert("An error occurred while retrying.");
    } finally {
      setRetrying(false);
    }
  };

  if (status === "PENDING" || status === "PROCESSING") {
    return (
      <div className="mb-12">
        <h2 className="text-lg font-medium text-[var(--text-primary)] mb-4">
          Combined Recording
        </h2>
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[var(--radius)] p-8 flex flex-col items-center justify-center min-h-[220px]">
          <div className="flex items-center gap-3">
            <svg
              className="animate-spin h-6 w-6 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-[var(--text-primary)] font-medium">
              Processing your recording...
            </span>
          </div>
          <p className="text-xs text-[var(--text-tertiary)] mt-2">
            FFmpeg is compiling all participant tracks into a single grid. This may take a moment.
          </p>
        </div>
      </div>
    );
  }

  if (status === "FAILED") {
    return (
      <div className="mb-12">
        <h2 className="text-lg font-medium text-[var(--text-primary)] mb-4">
          Combined Recording
        </h2>
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[var(--radius)] p-8 flex flex-col items-center justify-center min-h-[220px] gap-4">
          <div className="flex items-center gap-2 text-red-500">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="font-medium">Failed to combine recordings</span>
          </div>
          <p className="text-xs text-[var(--text-tertiary)] max-w-md text-center">
            Something went wrong while stitching the participant tracks together.
          </p>
          <Button
            variant="secondary"
            onClick={handleRetry}
            loading={retrying}
            className="mt-2 text-xs border border-[var(--border)]"
          >
            Retry Combining
          </Button>
        </div>
      </div>
    );
  }

  if (status === "READY" && url) {
    return (
      <div className="mb-12">
        <h2 className="text-lg font-medium text-[var(--text-primary)] mb-4">
          Combined Recording
        </h2>
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[var(--radius)] overflow-hidden">
          <div className="p-1">
            <video
              src={url}
              controls
              className="w-full rounded-[var(--radius-sm)] bg-black max-h-[500px]"
            />
          </div>
          <div className="p-4 flex items-center justify-between border-t border-[var(--border)] bg-[var(--bg-primary)]">
            <div>
              <p className="font-medium text-[var(--text-primary)]">Full Session</p>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                Stitched grid view of all participants
              </p>
            </div>
            <a
              href={url}
              download={`${roomName}-combined.mp4`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white px-4 py-2 rounded-[var(--radius-sm)] text-sm font-medium transition-colors border border-[var(--border)]"
            >
              Download
            </a>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
