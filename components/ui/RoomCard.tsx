"use client";

import Link from "next/link";
import Card from "./Card";
import StatusBadge from "./StatusBadge";
import Button from "./Button";

type RoomStatus = "WAITING" | "LIVE" | "ENDED";

interface RoomCardProps {
  room: {
    id: string;
    name: string;
    inviteCode: string;
    status: RoomStatus;
    createdAt: string;
    _count: { recordings: number };
  };
}

export default function RoomCard({ room }: RoomCardProps) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-[var(--text-primary)]">
            {room.name}
          </h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            {new Date(room.createdAt).toLocaleDateString()}
          </p>
        </div>
        <StatusBadge status={room.status} />
      </div>

      <p className="text-xs text-[var(--text-secondary)]">
        {room._count.recordings} recording
        {room._count.recordings !== 1 ? "s" : ""}
      </p>

      <div className="flex gap-2 mt-auto">
        <Link href={`/room/${room.inviteCode}`} className="flex-1">
          <Button variant="primary" size="sm" className="w-full">
            Open Room
          </Button>
        </Link>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() =>
            navigator.clipboard.writeText(
              `${window.location.origin}/room/${room.inviteCode}`
            )
          }
        >
          Copy Link
        </Button>
      </div>
    </Card>
  );
}
