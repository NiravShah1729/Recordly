"use client";

import Card from "./Card";
import StatusBadge from "./StatusBadge";
import Button from "./Button";

interface RecordingCardProps {
  recording: {
    id: string;
    fileName: string;
    displayUrl?: string | null;
    thumbnailUrl?: string | null;
    status: string;
    duration?: number | null;
    createdAt: string;
    userName?: string | null;
  };
  onDelete?: (id: string) => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function RecordingCard({
  recording,
  onDelete,
}: RecordingCardProps) {
  return (
    <Card className="flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <StatusBadge status={recording.status as any} />
        {recording.duration != null && recording.duration > 0 && (
          <span className="text-xs text-[var(--text-tertiary)] font-mono">
            {formatDuration(recording.duration)}
          </span>
        )}
      </div>

      {/* Video / Placeholder */}
      {recording.status === "READY" && recording.displayUrl ? (
        <video
          src={recording.displayUrl}
          poster={recording.thumbnailUrl || undefined}
          controls
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-black"
        />
      ) : (
        <div className="w-full aspect-video bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)] border border-[var(--border)] flex items-center justify-center">
          <span className="text-sm text-[var(--text-tertiary)]">
            {recording.status === "FAILED"
              ? "Processing failed"
              : "Processing..."}
          </span>
        </div>
      )}

      {/* Info */}
      <div className="flex items-center justify-between">
        <div>
          {recording.userName && (
            <p className="text-sm text-[var(--text-primary)]">
              {recording.userName}
            </p>
          )}
          <p className="text-xs text-[var(--text-tertiary)]" suppressHydrationWarning>
            {new Date(recording.createdAt).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto">
        {recording.status === "READY" && recording.displayUrl && (
          <a
            href={recording.displayUrl}
            download={recording.fileName}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1"
          >
            <Button variant="primary" size="sm" className="w-full">
              Download
            </Button>
          </a>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(recording.id)}
            className="text-[var(--status-failed)] hover:bg-red-500/10"
          >
            Delete
          </Button>
        )}
      </div>
    </Card>
  );
}
