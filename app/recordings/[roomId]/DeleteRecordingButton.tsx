"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

interface DeleteRecordingButtonProps {
  recordingId: string;
}

export default function DeleteRecordingButton({
  recordingId,
}: DeleteRecordingButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this recording?")) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/recordings/${recordingId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        router.refresh();
      } else {
        alert("Failed to delete recording.");
      }
    } catch (err) {
      console.error("Error deleting recording:", err);
      alert("Failed to delete recording.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={loading}
      onClick={handleDelete}
      className="text-[var(--status-failed)] hover:bg-red-500/10 hover:text-red-400 border border-transparent"
    >
      Delete
    </Button>
  );
}
