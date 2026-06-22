import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getPresignedUrl } from "@/lib/s3";

export default async function RecordingsPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    redirect("/");
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  const recordings = await prisma.recording.findMany({
    where: { userId: user?.id },
    orderBy: { createdAt: "desc" },
  });

  const recordingsWithPresignedUrls = await Promise.all(
    recordings.map(async (recording) => {
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

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-8">My Recordings</h1>

      {recordingsWithPresignedUrls.length === 0 ? (
        <p className="text-gray-400">No recordings yet. Go record something!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recordingsWithPresignedUrls.map((recording) => (
            <div
              key={recording.id}
              className="bg-gray-800 rounded-xl p-4 flex flex-col gap-3"
            >
              <video
                src={recording.displayUrl}
                controls
                className="w-full rounded-lg"
              />
              <p className="text-sm text-gray-400">
                {new Date(recording.createdAt).toLocaleString()}
              </p>
              <a
                href={recording.displayUrl}
                download={recording.fileName}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-600 hover:bg-blue-700 text-white text-center px-4 py-2 rounded-lg text-sm font-semibold"
              >
                ⬇ Download / View
              </a>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8">
        <a
          href="/record"
          className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold"
        >
          ⏺ New Recording
        </a>
      </div>
    </div>
  );
}
