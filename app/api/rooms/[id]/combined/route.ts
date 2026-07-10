import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getPresignedUrl } from "@/lib/s3";
import { enqueueCombineJob } from "@/lib/queues/combineQueue";

/**
 * GET /api/rooms/[id]/combined
 *
 * Returns the room's combine status and combined video URL.
 * The frontend polls this every 5 seconds while combining
 * is in progress, so it knows when the video is ready.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const room = await prisma.room.findUnique({
    where: { id },
    select: {
      combineStatus: true,
      combinedUrl: true,
      combinedS3Key: true,
    },
  });

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  // If the combined video is ready, generate a presigned URL
  // so the browser can access it directly from S3
  let presignedUrl = room.combinedUrl;
  if (room.combineStatus === "READY" && room.combinedS3Key) {
    try {
      presignedUrl = await getPresignedUrl(room.combinedS3Key);
    } catch (error) {
      console.error("Failed to generate presigned URL for combined video:", error);
    }
  }

  return NextResponse.json({
    combineStatus: room.combineStatus,
    combinedUrl: presignedUrl,
  });
}

/**
 * POST /api/rooms/[id]/combined
 *
 * Triggers/Retries the recording combine process for the room.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const room = await prisma.room.findUnique({
      where: { id },
    });

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    // Update room combine status back to PENDING before enqueuing
    await prisma.room.update({
      where: { id },
      data: { combineStatus: "PENDING" },
    });

    // Enqueue a new combine job using the BullMQ queue
    await enqueueCombineJob(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to trigger combine retry:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

