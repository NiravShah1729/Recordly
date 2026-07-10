"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";

function RecordPageInner() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get("roomId");
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [hasPermission, setHasPermission] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: "video/webm" });
          const url = URL.createObjectURL(blob);
          setDownloadUrl(url);
          chunksRef.current = [];
        };

        setHasPermission(true);
      } catch (err) {
        setError(
          "Could not access camera or microphone. Please allow permissions."
        );
        console.error(err);
      }
    }

    startCamera();
  }, []);

  function startRecording() {
    if (mediaRecorderRef.current) {
      setDownloadUrl("");
      mediaRecorderRef.current.start();
      setIsRecording(true);
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-57px)] bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-semibold mb-6">Record</h1>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-[var(--radius-sm)] p-4 mb-4 max-w-2xl w-full">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full max-w-2xl rounded-[var(--radius)] border border-[var(--border)] bg-black"
      />

      {hasPermission && (
        <div className="mt-6 flex gap-3">
          {!isRecording ? (
            <Button variant="danger" size="lg" onClick={startRecording}>
              Start Recording
            </Button>
          ) : (
            <Button variant="secondary" size="lg" onClick={stopRecording}>
              Stop Recording
            </Button>
          )}
        </div>
      )}

      {downloadUrl && (
        <div className="mt-6 flex flex-col items-center gap-3 w-full max-w-2xl">
          <p className="text-sm text-green-400 font-medium">
            Recording complete
          </p>
          <video
            src={downloadUrl}
            controls
            className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-black"
          />
          <div className="flex gap-3">
            <a href={downloadUrl} download="recording.webm">
              <Button variant="primary" size="md">
                Download
              </Button>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RecordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-57px)] bg-[var(--bg-primary)] text-[var(--text-secondary)] flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <RecordPageInner />
    </Suspense>
  );
}