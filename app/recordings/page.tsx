import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import AutoRefresh from "./AutoRefresh";

export default async function RecordingsPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    redirect("/");
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    redirect("/");
  }

  // Fetch all rooms where the user is host or participant, that have recordings
  const rooms = await prisma.room.findMany({
    where: {
      OR: [
        { hostId: user.id },
        { participants: { some: { id: user.id } } },
      ],
    },
    include: {
      recordings: {
        orderBy: { createdAt: "desc" },
        take: 1, // just need the latest for the "Last recording" date
        select: { createdAt: true, status: true },
      },
      _count: {
        select: { recordings: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Filter to only rooms that have at least one recording
  const roomsWithRecordings = rooms.filter((r) => r._count.recordings > 0);

  // Check if any recording is still processing (for auto-refresh)
  const isAnyProcessing = roomsWithRecordings.some((r) =>
    r.recordings.some(
      (rec) => rec.status === "UPLOADING" || rec.status === "PROCESSING"
    )
  );

  function formatRelativeDate(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  }

  return (
    <div className="min-h-[calc(100vh-57px)] bg-[var(--bg-primary)]">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <AutoRefresh isProcessing={isAnyProcessing} />

        <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-6">
          Recordings
        </h1>

        {roomsWithRecordings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-[var(--text-tertiary)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
                />
              </svg>
            </div>
            <h3 className="text-base font-medium text-[var(--text-primary)] mb-1">
              No recordings yet
            </h3>
            <p className="text-sm text-[var(--text-secondary)] max-w-sm mb-6">
              Start a recording session in a room and your recordings will
              appear here.
            </p>
            <Link
              href="/rooms/new"
              className="bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white px-4 py-2.5 rounded-[var(--radius-sm)] text-sm font-medium transition-colors border border-[var(--border)]"
            >
              Create a Room
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {roomsWithRecordings.map((room) => (
              <Link
                key={room.id}
                href={`/recordings/${room.id}`}
                className="block"
              >
                <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[var(--radius)] p-5 hover:border-[var(--border-hover)] transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-medium text-[var(--text-primary)]">
                        {room.name}
                      </h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-sm text-[var(--text-secondary)]">
                          {room._count.recordings} recording
                          {room._count.recordings !== 1 ? "s" : ""}
                        </span>
                        {room.recordings[0] && (
                          <>
                            <span className="text-[var(--text-tertiary)]">
                              ·
                            </span>
                            <span className="text-sm text-[var(--text-tertiary)]">
                              Last recording:{" "}
                              {formatRelativeDate(room.recordings[0].createdAt)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <svg
                      className="w-5 h-5 text-[var(--text-tertiary)]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m8.25 4.5 7.5 7.5-7.5 7.5"
                      />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
