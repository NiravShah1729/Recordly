import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";
import Link from "next/link";

const prisma = new PrismaClient();

export default async function DashboardPage() {
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
    take: 3, // only show latest 3
  });

  const totalRecordings = await prisma.recording.count({
    where: { userId: user?.id },
  });

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          Welcome back, {user?.name || session.user?.email} 👋
        </h1>
        <p className="text-gray-400 mt-1">Here's what's going on with your recordings.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-gray-800 rounded-xl p-6">
          <p className="text-gray-400 text-sm">Total Recordings</p>
          <p className="text-4xl font-bold mt-1">{totalRecordings}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-6">
          <p className="text-gray-400 text-sm">Storage Used</p>
          <p className="text-4xl font-bold mt-1">Local</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-6">
          <p className="text-gray-400 text-sm">Status</p>
          <p className="text-4xl font-bold mt-1 text-green-400">Active</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-4 mb-10">
        <Link
          href="/record"
          className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold"
        >
          ⏺ New Recording
        </Link>
        <Link
          href="/recordings"
          className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold"
        >
          📁 View All Recordings
        </Link>
        <Link
          href="/rooms/new"
          className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold"
        >
          🎙 Create Room
        </Link>
      </div>

      {/* Recent Recordings */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Recordings</h2>

        {recordings.length === 0 ? (
          <p className="text-gray-400">No recordings yet. Start by recording something!</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {recordings.map((recording) => (
              <div
                key={recording.id}
                className="bg-gray-800 rounded-xl p-4 flex flex-col gap-3"
              >
                <video
                  src={`/recordings/${recording.fileName}`}
                  controls
                  className="w-full rounded-lg"
                />
                <p className="text-sm text-gray-400">
                  {new Date(recording.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
