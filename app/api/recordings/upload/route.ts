import { writeFile, mkdir } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  // Get the logged in user
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  // Find the user in the database by email
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Save the file
  const formData = await req.formData();
  const file = formData.get("file") as File;
  const roomId = formData.get("roomId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file received" }, { status: 400 });
  }

  // Validate roomId if provided
  if (roomId) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const filename = `recording-${Date.now()}.webm`;
  const folderPath = path.join(process.cwd(), "public", "recordings");
  const filepath = path.join(folderPath, filename);

  await mkdir(folderPath, { recursive: true });
  await writeFile(filepath, buffer);

  // Save recording info to database
  const recording = await prisma.recording.create({
    data: {
      userId: user.id,
      roomId: roomId || undefined,
      fileName: filename,
      s3Key: `local/recordings/${filename}`,
      mimeType: "video/webm",
      status: "READY",
    },
  });

  return NextResponse.json({ success: true, filename, recordingId: recording.id });
}