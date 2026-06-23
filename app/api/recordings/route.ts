import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const recordings = await prisma.recording.findMany({
    where: {
      OR: [
        { userId: user.id },
        { room: { participants: { some: { id: user.id } } } },
        { room: { hostId: user.id } }
      ]
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(recordings);
}
