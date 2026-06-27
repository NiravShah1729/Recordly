import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getPresignedUrl } from "@/lib/s3";

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
