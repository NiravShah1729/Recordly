"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewRoomPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!name) {
      setError("Please enter a room name");
      return;
    }

    setLoading(true);
    setError("");

    const res = await fetch("/api/rooms/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });

    const data = await res.json();

    if (data.success) {
      router.push(`/room/${data.room.inviteCode}`);
    } else {
      setError(data.error || "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8">
      <div className="bg-gray-800 rounded-xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6">Create a New Room</h1>

        {error && (
          <p className="text-red-400 mb-4">{error}</p>
        )}

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-sm text-gray-400 mb-1 block">Room Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Interview with John"
              className="w-full bg-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-1 block">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Podcast episode 12"
              className="w-full bg-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold mt-2 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Room"}
          </button>
        </div>
      </div>
    </div>
  );
}