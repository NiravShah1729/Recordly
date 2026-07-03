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
  { label: string; dotColor: string; textColor: string; bgColor: string; borderColor: string }
> = {
  // Room statuses
  WAITING: {
    label: "Waiting",
    dotColor: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]",
    textColor: "text-amber-300",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
  },
  LIVE: {
    label: "Live",
    dotColor: "bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]",
    textColor: "text-emerald-300",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/25",
  },
  ENDED: {
    label: "Ended",
    dotColor: "bg-zinc-500",
    textColor: "text-zinc-400",
    bgColor: "bg-zinc-800/50",
    borderColor: "border-zinc-700/40",
  },

  // Recording statuses
  UPLOADING: {
    label: "Uploading",
    dotColor: "bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.6)]",
    textColor: "text-amber-300",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
  },
  PROCESSING: {
    label: "Processing",
    dotColor: "bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.6)]",
    textColor: "text-amber-300",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
  },
  READY: {
    label: "Ready",
    dotColor: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]",
    textColor: "text-emerald-300",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
  },
  FAILED: {
    label: "Failed",
    dotColor: "bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.6)]",
    textColor: "text-rose-300",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/20",
  },

  // Combine statuses
  PENDING: {
    label: "Pending",
    dotColor: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]",
    textColor: "text-amber-300",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
  },
  COMBINED: {
    label: "Combined",
    dotColor: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]",
    textColor: "text-emerald-300",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
  },
};

export default function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.ENDED;

  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        px-2.5 py-0.5 rounded-full text-[11px] font-medium tracking-wide
        border ${config.bgColor} ${config.textColor} ${config.borderColor}
        backdrop-blur-sm transition-all duration-200
        ${className}
      `}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
      {config.label}
    </span>
  );
}
