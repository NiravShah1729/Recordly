import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { redis } from "@/lib/redis";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { expectedCount } = await req.json();
    if (typeof expectedCount !== "number") {
      return NextResponse.json({ error: "Invalid expectedCount" }, { status: 400 });
    }

    const room = await prisma.room.findUnique({
      where: { id },
    });

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    if (room.hostId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden: Only the host can set the recording count." }, { status: 403 });
    }

    await redis.set(`room:${id}:expectedRecordingCount`, expectedCount);

    return NextResponse.json({ success: true, expectedCount });
  } catch (error: unknown) {
    console.error("Error setting recording count:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
