"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

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
    <div className="min-h-[calc(100vh-57px)] bg-[var(--bg-primary)] flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-6">
          Create a New Room
        </h1>

        <Card padding="lg">
          <div className="flex flex-col gap-4">
            <Input
              label="Room Name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Interview with John"
              error={error || undefined}
            />

            <Input
              label="Description (optional)"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Podcast episode 12"
            />

            <Button
              variant="primary"
              size="lg"
              onClick={handleCreate}
              loading={loading}
              disabled={!name}
              className="w-full mt-2"
            >
              Create Room
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}