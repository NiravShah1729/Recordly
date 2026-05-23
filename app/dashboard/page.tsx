"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

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

const statusStyles: Record<Room["status"], string> = {
  WAITING: "bg-yellow-100 text-yellow-800",
  LIVE: "bg-green-100 text-green-800",
  ENDED: "bg-gray-100 text-gray-600",
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
    return <p className="p-8 text-gray-500">Loading...</p>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">
            Welcome back, {session?.user?.name ?? session?.user?.email}
          </p>
        </div>
        <Link
          href="/rooms/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          + New Room
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
          <h2 className="text-xl font-semibold text-gray-800">Your Rooms</h2>
          <Link href="/rooms/new" className="text-sm text-blue-600 hover:underline">
            Create new
          </Link>
        </div>

        {loadingRooms ? (
          <p className="text-gray-400 text-sm">Loading rooms...</p>
        ) : rooms.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400">
            <p className="text-lg">No rooms yet</p>
            <p className="text-sm mt-1">Create a room to start recording with guests.</p>
            <Link
              href="/rooms/new"
              className="mt-4 inline-block bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
            >
              Create your first room
            </Link>
          </div>
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
          <h2 className="text-xl font-semibold text-gray-800">Recent Recordings</h2>
          <Link href="/recordings" className="text-sm text-blue-600 hover:underline">
            View all
          </Link>
        </div>

        {loadingRecs ? (
          <p className="text-gray-400 text-sm">Loading recordings...</p>
        ) : recordings.length === 0 ? (
          <p className="text-gray-400 text-sm">No recordings yet.</p>
        ) : (
          <ul className="space-y-2">
            {recordings.map((rec) => (
              <li
                key={rec.id}
                className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3"
              >
                <span className="text-sm text-gray-700 truncate">{rec.filename}</span>
                <span className="text-xs text-gray-400 ml-4 shrink-0">
                  {new Date(rec.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function RoomCard({ room }: { room: Room }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">{room.name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(room.createdAt).toLocaleDateString()}
          </p>
        </div>
        <span
          className={`text-xs font-medium px-2 py-1 rounded-full ${statusStyles[room.status]}`}
        >
          {room.status}
        </span>
      </div>

      <p className="text-xs text-gray-500">
        {room._count.recordings} recording{room._count.recordings !== 1 ? "s" : ""}
      </p>

      <div className="flex gap-2 mt-auto">
        <Link
          href={`/room/${room.inviteCode}`}
          className="flex-1 text-center bg-blue-600 hover:bg-blue-700 text-white text-sm py-1.5 rounded-lg transition"
        >
          Open Room
        </Link>
        <button
          onClick={() => navigator.clipboard.writeText(
            `${window.location.origin}/room/${room.inviteCode}`
          )}
          className="flex-1 text-center border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm py-1.5 rounded-lg transition"
        >
          Copy Link
        </button>
      </div>
    </div>
  );
}