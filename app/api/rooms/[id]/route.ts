import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const room = await prisma.room.findUnique({
    where: { id },
  });

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  if (room.hostId !== user.id) {
    return NextResponse.json({ error: "Only the host can update the room" }, { status: 403 });
  }

  const body = await request.json();
  const { status } = body;

  if (!status || !["WAITING", "LIVE", "ENDED"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updatedRoom = await prisma.room.update({
    where: { id },
    data: { 
      status,
      endedAt: status === "ENDED" ? new Date() : undefined
    },
  });

  return NextResponse.json(updatedRoom);
}
