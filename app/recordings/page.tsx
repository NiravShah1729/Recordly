import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";

const prisma = new PrismaClient();

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

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-8">My Recordings</h1>

      {recordings.length === 0 ? (
        <p className="text-gray-400">No recordings yet. Go record something!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recordings.map((recording) => (
            <div
              key={recording.id}
              className="bg-gray-800 rounded-xl p-4 flex flex-col gap-3"
            >
              <video
                src={recording.cdnUrl || `/recordings/${recording.fileName}`}
                controls
                className="w-full rounded-lg"
              />
              <p className="text-sm text-gray-400">
                {new Date(recording.createdAt).toLocaleString()}
              </p>
              <a
                href={recording.cdnUrl || `/recordings/${recording.fileName}`}
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
