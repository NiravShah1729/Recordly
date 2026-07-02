import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getPresignedUrl } from "@/lib/s3";
import AutoRefresh from "../AutoRefresh";
import RecordingCard from "@/components/ui/RecordingCard";
import StatusBadge from "@/components/ui/StatusBadge";
import DeleteRecordingButton from "./DeleteRecordingButton";

interface Props {
  params: Promise<{ roomId: string }>;
}

export default async function RoomRecordingsPage({ params }: Props) {
  const { roomId } = await params;
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

  // Fetch the room and verify the user has access
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      host: true,
      participants: true,
      recordings: {
        include: { user: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!room) {
    return (
      <div className="min-h-[calc(100vh-57px)] bg-[var(--bg-primary)] flex items-center justify-center">
        <p className="text-[var(--text-secondary)]">Room not found.</p>
      </div>
    );
  }

  const isHost = room.hostId === user.id;
  const isParticipant = room.participants.some((p) => p.id === user.id);

  if (!isHost && !isParticipant) {
    return (
      <div className="min-h-[calc(100vh-57px)] bg-[var(--bg-primary)] flex items-center justify-center">
        <p className="text-[var(--text-secondary)]">Access denied.</p>
      </div>
    );
  }

  // Generate presigned URLs for recordings
  const recordingsWithUrls = await Promise.all(
    room.recordings.map(async (recording) => {
      let presignedUrl = null;
      try {
        if (recording.s3Key) {
          presignedUrl = await getPresignedUrl(recording.s3Key);
        }
      } catch (error) {
        console.error("Failed to generate presigned URL for", recording.id, error);
      }
      return {
        ...recording,
        displayUrl: presignedUrl || recording.cdnUrl || `/recordings/${recording.fileName}`,
      };
    })
  );

  const isAnyProcessing = recordingsWithUrls.some(
    (r) => r.status === "UPLOADING" || r.status === "PROCESSING"
  );

  // Generate presigned URL for combined recording
  let combinedUrl = null;
  if (room.combineStatus === "READY" && room.combinedS3Key) {
    try {
      combinedUrl = await getPresignedUrl(room.combinedS3Key);
    } catch (error) {
      console.error("Failed to generate combined URL", error);
    }
  }

  return (
    <div className="min-h-[calc(100vh-57px)] bg-[var(--bg-primary)]">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <AutoRefresh isProcessing={isAnyProcessing} />

        {/* Back Link */}
        <Link
          href="/recordings"
          className="inline-flex items-center text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6 transition-colors"
        >
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to all rooms
        </Link>

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-[var(--text-primary)] tracking-tight">
                {room.name}
              </h1>
              {room.description && (
                <p className="text-[var(--text-secondary)] mt-2">{room.description}</p>
              )}
            </div>
            <StatusBadge status={room.status} />
          </div>
          <div className="mt-4 flex items-center gap-4 text-sm text-[var(--text-tertiary)]">
            <span>Hosted by {room.host.name || room.host.email}</span>
            <span>·</span>
            <span>Created {new Date(room.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Combined Recording */}
        {room.combineStatus === "READY" && combinedUrl && (
          <div className="mb-12">
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-4">
              Combined Recording
            </h2>
            <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[var(--radius)] overflow-hidden">
              <div className="p-1">
                <video
                  src={combinedUrl}
                  controls
                  className="w-full rounded-[var(--radius-sm)] bg-black max-h-[500px]"
                />
              </div>
              <div className="p-4 flex items-center justify-between border-t border-[var(--border)] bg-[var(--bg-primary)]">
                <div>
                  <p className="font-medium text-[var(--text-primary)]">Full Session</p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                    Side-by-side view of all participants
                  </p>
                </div>
                <a
                  href={combinedUrl}
                  download={`${room.name}-combined.mp4`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white px-4 py-2 rounded-[var(--radius-sm)] text-sm font-medium transition-colors border border-[var(--border)]"
                >
                  Download
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Individual Recordings */}
        <div>
          <h2 className="text-lg font-medium text-[var(--text-primary)] mb-4">
            Individual Tracks ({recordingsWithUrls.length})
          </h2>
          
          {recordingsWithUrls.length === 0 ? (
            <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[var(--radius)] p-8 text-center">
              <p className="text-[var(--text-secondary)]">No recordings found for this room.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {recordingsWithUrls.map((recording) => (
                <div key={recording.id} className="relative group">
                  <RecordingCard
                    recording={{
                      id: recording.id,
                      fileName: recording.fileName,
                      displayUrl: recording.displayUrl,
                      thumbnailUrl: recording.thumbnailUrl,
                      status: recording.status,
                      duration: recording.duration,
                      createdAt: recording.createdAt.toISOString(),
                      userName: recording.user.name || recording.user.email,
                    }}
                  />
                  {/* Delete button overlaid or injected via props in a real impl. 
                      Since RecordingCard takes onDelete, we could pass a server action, 
                      but we'll just position the client component over the card or render it below */}
                   <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <DeleteRecordingButton recordingId={recording.id} />
                   </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
