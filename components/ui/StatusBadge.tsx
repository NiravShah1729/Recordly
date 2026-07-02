type RoomStatus = "WAITING" | "LIVE" | "ENDED";
type RecordingStatus = "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
type CombineStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

type StatusType = RoomStatus | RecordingStatus | CombineStatus | "COMBINED";

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

const statusConfig: Record<
  StatusType,
  { label: string; dotColor: string; textColor: string; bgColor: string }
> = {
  // Room statuses
  WAITING: {
    label: "Waiting",
    dotColor: "bg-yellow-500",
    textColor: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
  },
  LIVE: {
    label: "Live",
    dotColor: "bg-green-500",
    textColor: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  ENDED: {
    label: "Ended",
    dotColor: "bg-[var(--text-tertiary)]",
    textColor: "text-[var(--text-tertiary)]",
    bgColor: "bg-[var(--text-tertiary)]/10",
  },

  // Recording statuses
  UPLOADING: {
    label: "Uploading",
    dotColor: "bg-yellow-500 animate-pulse",
    textColor: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
  },
  PROCESSING: {
    label: "Processing",
    dotColor: "bg-yellow-500 animate-pulse",
    textColor: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
  },
  READY: {
    label: "Ready",
    dotColor: "bg-green-500",
    textColor: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  FAILED: {
    label: "Failed",
    dotColor: "bg-red-500",
    textColor: "text-red-500",
    bgColor: "bg-red-500/10",
  },

  // Combine statuses
  PENDING: {
    label: "Pending",
    dotColor: "bg-yellow-500",
    textColor: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
  },
  COMBINED: {
    label: "Combined",
    dotColor: "bg-green-500",
    textColor: "text-green-500",
    bgColor: "bg-green-500/10",
  },
};

export default function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.ENDED;

  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        px-2.5 py-1 rounded-full text-xs font-medium
        ${config.bgColor} ${config.textColor}
        ${className}
      `}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
      {config.label}
    </span>
  );
}
