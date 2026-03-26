import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";
import Link from "next/link";
import CopyButton from "@/components/CopyButton/index";

const prisma = new PrismaClient();

interface Props {
  params: Promise<{ inviteCode: string }>;
}

export default async function RoomPage({ params }: Props) {
  const { inviteCode } = await params;
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    redirect("/");
  }

  const room = await prisma.room.findUnique({
    where: { inviteCode },
    include: { host: true },
  });

  if (!room) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-red-400 text-xl">Room not found.</p>
      </div>
    );
  }

  const isHost = session.user.email === room.host.email;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      {/* Room Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{room.name}</h1>
        {room.description && (
          <p className="text-gray-400 mt-1">{room.description}</p>
        )}
        <p className="text-sm text-gray-500 mt-2">
          Host: {room.host.name || room.host.email}
        </p>
        <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold bg-green-700 text-green-200">
          {room.status}
        </span>
      </div>

      {/* Invite Link — only show to host */}
      {isHost && (
        <div className="bg-gray-800 rounded-xl p-6 mb-8">
          <p className="text-sm text-gray-400 mb-2">
            Share this invite link with your guest:
          </p>
          <div className="flex items-center gap-3">
            <code className="bg-gray-700 px-4 py-2 rounded-lg text-sm flex-1 overflow-auto">
              {`${process.env.NEXTAUTH_URL}/room/${room.inviteCode}`}
            </code>
            <CopyButton text={`${process.env.NEXTAUTH_URL}/room/${room.inviteCode}`} />
          </div>
        </div>
      )}

      {/* Role badge */}
      <div className="mb-6">
        {isHost ? (
          <span className="bg-purple-700 text-purple-200 px-3 py-1 rounded-full text-sm font-semibold">
            👑 You are the Host
          </span>
        ) : (
          <span className="bg-blue-700 text-blue-200 px-3 py-1 rounded-full text-sm font-semibold">
            🎙 You are a Guest
          </span>
        )}
      </div>

      {/* Record button */}
      <Link
        href="/record"
        className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold inline-block"
      >
        ⏺ Start Recording
      </Link>
    </div>
  );
}