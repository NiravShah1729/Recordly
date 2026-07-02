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
  fileName: string;
  createdAt: string;
  status: string;
  duration?: number | null;
  thumbnailUrl?: string | null;
  room?: { name: string } | null;
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
          setRecordings(Array.isArray(data) ? data.slice(0, 5) : []);
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

  const liveRooms = rooms.filter((r) => r.status === "LIVE");

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
              Live Rooms
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
          ) : liveRooms.length === 0 ? (
            <EmptyState
              title="No live rooms"
              description="You don't have any active rooms right now."
              actionLabel="Create a new room"
              actionHref="/rooms/new"
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {liveRooms.map((room) => (
                <RoomCard key={room.id} room={room} />
              ))}
            </div>
          )}
        </section>

        {/* Recent Recordings */}
        <section>
          <div className="mb-4">
            <h2 className="text-base font-medium text-[var(--text-primary)]">
              Recent Recordings
            </h2>
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
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {recordings.map((rec) => (
                  <div
                    key={rec.id}
                    className="flex flex-col group cursor-pointer"
                  >
                    {/* Thumbnail Area */}
                    <div className="relative aspect-video bg-[var(--bg-secondary)] rounded-xl overflow-hidden mb-3 border border-transparent group-hover:border-[var(--border-hover)] transition-colors shadow-[var(--shadow-subtle)]">
                      {rec.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={rec.thumbnailUrl} alt={rec.fileName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[var(--bg-secondary)]">
                          <svg className="w-8 h-8 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      {/* Duration Pill */}
                      <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-medium text-white tracking-wider">
                        {rec.duration ? `${Math.floor(rec.duration / 60).toString().padStart(2, '0')}:${(rec.duration % 60).toString().padStart(2, '0')}` : "00:00"}
                      </div>
                    </div>

                    {/* Meta Area */}
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 pr-2">
                        <h3 className="text-sm font-medium text-[var(--text-primary)] truncate mb-1">
                          {rec.room?.name || rec.fileName || "Untitled Recording"}
                        </h3>
                        <p className="text-[11px] text-[var(--text-tertiary)] mb-1.5">
                          Recorded {new Date(rec.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </p>
                        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                          <span className="truncate">{rec.room?.name || "No Room"}</span>
                        </div>
                      </div>
                      <button className="text-[var(--text-tertiary)] hover:text-white p-1 rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-center pt-2">
                <Link href="/recordings">
                  <Button variant="secondary" className="px-6 rounded-full text-sm font-medium border border-[var(--border)] bg-transparent hover:bg-[var(--bg-tertiary)]">
                    Show more
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}