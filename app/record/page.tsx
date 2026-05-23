"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

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
        setError("Could not access camera or microphone. Please allow permissions.");
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

  async function saveToServer() {
    if (!downloadUrl) return;

    const response = await fetch(downloadUrl);
    const blob = await response.blob();

    const formData = new FormData();
    formData.append("file", blob, "recording.webm");
    if (roomId) {
      formData.append("roomId", roomId);
    }

    const res = await fetch("/api/recordings/upload", {
      method: "POST",
      body: formData,
    });

    const rawText = await res.text();
    console.log("Server response:", rawText);

    try {
      const data = JSON.parse(rawText);
      if (data.success) {
        alert(`Saved! File: ${data.filename}`);
      } else {
        alert("Upload failed.");
      }
    } catch (err) {
      alert("Server error — check console for details");
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-6">Record</h1>

      {error && (
        <p className="text-red-400 mb-4">{error}</p>
      )}

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full max-w-2xl rounded-xl border border-gray-700"
      />

      {hasPermission && (
        <div className="mt-6 flex gap-4">
          {!isRecording ? (
            <button
              onClick={startRecording}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold"
            >
              ⏺ Start Recording
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-semibold"
            >
              ⏹ Stop Recording
            </button>
          )}
        </div>
      )}

      {downloadUrl && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="text-green-400 font-semibold">✅ Recording complete!</p>
          <video
            src={downloadUrl}
            controls
            className="w-full max-w-2xl rounded-xl border border-gray-700"
          />
          <a
            href={downloadUrl}
            download="recording.webm"
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold"
          >
            ⬇ Download Recording
          </a>
          <button
            onClick={saveToServer}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold"
          >
            ☁ Save to Server
          </button>
        </div>
      )}
    </div>
  );
}

export default function RecordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>}>
      <RecordPageInner />
    </Suspense>
  );
}