import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/s3";

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
  const startTimeStr = formData.get("startTime") as string | null;

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
  const s3Key = `raw/${user.id}/${filename}`;
  const bucketName = process.env.AWS_S3_BUCKET_NAME;

  if (!bucketName) {
    return NextResponse.json({ error: "S3 Bucket not configured" }, { status: 500 });
  }

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: buffer,
      ContentType: "video/webm",
    });

    await s3Client.send(command);

    const cdnUrl = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    // Parse startTime: it's a Unix timestamp in milliseconds (e.g. 1719312000000)
    // Convert to a Date object for Prisma, or null if not provided
    const startTime = startTimeStr ? new Date(parseInt(startTimeStr, 10)) : null;

    // Save recording info to database
    const recording = await prisma.recording.create({
      data: {
        userId: user.id,
        roomId: roomId || undefined,
        fileName: filename,
        s3Key: s3Key,
        cdnUrl: cdnUrl,
        mimeType: "video/webm",
        status: "UPLOADING",
        // Save the shared start time so we can use it for FFmpeg sync later
        startTime: startTime,
      },
    });

    // Fire and forget background processing
    import("@/lib/processRecording").then(({ processRecording }) => {
      processRecording(recording.id).catch((err) => {
        console.error("Background processing failed:", err);
      });
    });

    return NextResponse.json({ success: true, filename, recordingId: recording.id, cdnUrl });
  } catch (error) {
    console.error("Error uploading to S3:", error);
    return NextResponse.json({ error: "Failed to upload to S3" }, { status: 500 });
  }
}