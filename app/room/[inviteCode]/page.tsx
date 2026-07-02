import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import RoomClient from "./RoomClient";
import { getPresignedUrl } from "@/lib/s3";

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
    include: {
      host: true,
      recordings: {
        include: { user: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!room) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-red-400 text-xl">Room not found.</p>
      </div>
    );
  }

  const isHost = session.user.email === room.host.email;

  if (!isHost) {
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
    });
    if (currentUser) {
      await prisma.room.update({
        where: { id: room.id },
        data: {
          participants: {
            connect: { id: currentUser.id },
          },
        },
      });
    }
  }

  if (room.status === "ENDED") {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8 text-center">
        <h1 className="text-4xl font-bold mb-4">Session Ended</h1>
        <p className="text-gray-400 mb-8 max-w-md">
          This recording session has concluded. You can no longer join the room.
        </p>
        <Link 
          href="/dashboard"
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  // Serialize data for the client component (dates → strings, BigInt → string)
  const serializedRecordings = await Promise.all(
    room.recordings.map(async (r) => {
      let presignedUrl = null;
      try {
        if (r.s3Key) {
          presignedUrl = await getPresignedUrl(r.s3Key);
        }
      } catch (error) {
        console.error("Failed to generate presigned URL for", r.id, error);
      }
      return {
        id: r.id,
        fileName: r.fileName,
        cdnUrl: presignedUrl || r.cdnUrl,
        createdAt: r.createdAt.toISOString(),
        user: {
          name: r.user.name,
          email: r.user.email,
        },
      };
    })
  );

  const serializedRoom = {
    id: room.id,
    name: room.name,
    description: room.description,
    inviteCode: room.inviteCode,
    status: room.status,
    host: {
      name: room.host.name,
      email: room.host.email,
    },
    recordings: serializedRecordings,
  };

  return (
    <RoomClient
      room={serializedRoom}
      isHost={isHost}
      nextAuthUrl={process.env.NEXTAUTH_URL || "http://localhost:3000"}
      currentUserName={session.user.name || session.user.email}
    />
  );
}