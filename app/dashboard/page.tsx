"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import StatCard from "@/components/ui/StatCard";
import RoomCard from "@/components/ui/RoomCard";
import EmptyState from "@/components/ui/EmptyState";

type Room = {
  id: string;
  name: string;
  inviteCode: string;
  status: "WAITING" | "LIVE" | "ENDED";
  createdAt: string;
  _count: { recordings: number };
};

type Recording = {
  id: string;
  filename: string;
  createdAt: string;
  status: string;
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingRecs, setLoadingRecs] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;

    fetch("/api/rooms")
      .then((r) => r.json())
      .then((data) => {
        setRooms(Array.isArray(data) ? data : []);
        setLoadingRooms(false);
      });

    fetch("/api/recordings")
      .then((r) => r.json())
      .then((data) => {
        setRecordings(Array.isArray(data) ? data.slice(0, 3) : []);
        setLoadingRecs(false);
      });
  }, [status]);

  if (status === "loading") {
    return (
      <div className="min-h-[calc(100vh-57px)] bg-[var(--bg-primary)] flex items-center justify-center">
        <p className="text-[var(--text-secondary)] text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-57px)] bg-[var(--bg-primary)]">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
              Dashboard
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Welcome back, {session?.user?.name ?? session?.user?.email}
            </p>
          </div>
          <Link href="/rooms/new">
            <Button variant="primary" size="md">
              + New Room
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label="Total Rooms" value={rooms.length} />
          <StatCard
            label="Live Rooms"
            value={rooms.filter((r) => r.status === "LIVE").length}
          />
          <StatCard label="Total Recordings" value={recordings.length} />
        </div>

        {/* Rooms Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-medium text-[var(--text-primary)]">
              Your Rooms
            </h2>
            <Link
              href="/rooms/new"
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Create new
            </Link>
          </div>

          {loadingRooms ? (
            <p className="text-[var(--text-tertiary)] text-sm">
              Loading rooms...
            </p>
          ) : rooms.length === 0 ? (
            <EmptyState
              title="No rooms yet"
              description="Create a room to start recording with guests."
              actionLabel="Create your first room"
              actionHref="/rooms/new"
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {rooms.map((room) => (
                <RoomCard key={room.id} room={room} />
              ))}
            </div>
          )}
        </section>

        {/* Recent Recordings */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-medium text-[var(--text-primary)]">
              Recent Recordings
            </h2>
            <Link
              href="/recordings"
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              View all
            </Link>
          </div>

          {loadingRecs ? (
            <p className="text-[var(--text-tertiary)] text-sm">
              Loading recordings...
            </p>
          ) : recordings.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">
              No recordings yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {recordings.map((rec) => (
                <li
                  key={rec.id}
                  className="flex items-center justify-between bg-[var(--card-bg)] border border-[var(--border)] rounded-[var(--radius-sm)] px-4 py-3"
                >
                  <span className="text-sm text-[var(--text-primary)] truncate">
                    {rec.filename}
                  </span>
                  <span className="text-xs text-[var(--text-tertiary)] ml-4 shrink-0">
                    {new Date(rec.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}