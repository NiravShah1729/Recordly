"use client";

import { useEffect, useState } from "react";

interface DeviceSelectorProps {
  kind: "videoinput" | "audioinput" | "audiooutput";
  selectedDeviceId: string;
  onChange: (deviceId: string) => void;
  icon?: React.ReactNode;
}

export default function DeviceSelector({
  kind,
  selectedDeviceId,
  onChange,
  icon,
}: DeviceSelectorProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    async function getDevices() {
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const filtered = allDevices.filter((d) => d.kind === kind);
        setDevices(filtered);
      } catch (err) {
        console.error("Error enumerating devices:", err);
      }
    }

    getDevices();
    navigator.mediaDevices.addEventListener("devicechange", getDevices);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", getDevices);
    };
  }, [kind]);

  if (devices.length === 0) {
    return (
      <div className="flex items-center gap-2 bg-[var(--card-bg)] border border-[var(--border)] rounded-[var(--radius-sm)] px-4 py-2 text-sm text-[var(--text-tertiary)] w-full">
        {icon && <span className="shrink-0">{icon}</span>}
        No devices found
      </div>
    );
  }

  return (
    <div className="relative w-full flex items-center bg-[var(--card-bg)] border border-[var(--border)] rounded-[var(--radius-sm)] overflow-hidden focus-within:border-[var(--border-hover)] transition-colors">
      {icon && <div className="pl-4 text-[var(--text-secondary)]">{icon}</div>}
      <select
        value={selectedDeviceId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent text-[var(--text-primary)] text-sm px-4 py-3 appearance-none focus:outline-none"
      >
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId} className="bg-[var(--bg-primary)]">
            {device.label || `Device ${device.deviceId.slice(0, 5)}...`}
          </option>
        ))}
      </select>
      <div className="pr-4 pointer-events-none text-[var(--text-secondary)]">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}
