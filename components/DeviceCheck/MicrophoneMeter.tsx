"use client";

import { useEffect, useRef } from "react";

interface MicrophoneMeterProps {
  stream: MediaStream | null;
  micEnabled: boolean;
}

export default function MicrophoneMeter({ stream, micEnabled }: MicrophoneMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    if (!micEnabled || !stream || stream.getAudioTracks().length === 0) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      return;
    }

    const AudioContextClass = window.AudioContext || ((window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const audioContext = new AudioContextClass();
    audioContextRef.current = audioContext;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    try {
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;
    } catch (e) {
      console.error("Failed to connect audio stream to analyser", e);
      return;
    }

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      if (!analyser || !ctx || !canvas) return;
      animationRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      
      // Normalize to 0-1
      const volume = Math.min(1, average / 128);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Background track
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Fill based on volume
      ctx.fillStyle = "#22C55E"; // green-500
      ctx.fillRect(0, 0, canvas.width * volume, canvas.height);
    }

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (sourceRef.current) sourceRef.current.disconnect();
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [stream, micEnabled]);

  return (
    <div className="w-full h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
      {!micEnabled ? (
        <div className="w-full h-full bg-red-500/20" />
      ) : (
        <canvas ref={canvasRef} width={200} height={6} className="w-full h-full block" />
      )}
    </div>
  );
}
