import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";
import RoomClient from "./RoomClient";

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

  // Serialize data for the client component (dates → strings, BigInt → string)
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
    recordings: room.recordings.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      createdAt: r.createdAt.toISOString(),
      user: {
        name: r.user.name,
        email: r.user.email,
      },
    })),
  };

  return (
    <RoomClient
      room={serializedRoom}
      isHost={isHost}
      nextAuthUrl={process.env.NEXTAUTH_URL || "http://localhost:3000"}
    />
  );
}