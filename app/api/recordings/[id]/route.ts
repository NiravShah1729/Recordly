import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const recording = await prisma.recording.findUnique({
    where: { id },
    include: { room: true },
  });

  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  // Check permissions: Must be owner of recording OR host of the room
  if (recording.userId !== user.id && recording.room?.hostId !== user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    // 1. Delete from S3 if keys exist
    if (
      process.env.AWS_REGION &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_S3_BUCKET_NAME
    ) {
      const s3Client = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });

      // Try deleting the main file
      if (recording.s3Key) {
        try {
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: process.env.AWS_S3_BUCKET_NAME,
              Key: recording.s3Key,
            })
          );
        } catch (e) {
          console.error("Failed to delete from S3:", recording.s3Key, e);
        }
      }

      // Try deleting the raw webm if the s3Key is for an mp4 (naming convention hack for now, or just ignore errors)
      if (recording.s3Key && recording.s3Key.endsWith(".mp4")) {
         try {
            await s3Client.send(
              new DeleteObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: recording.s3Key.replace(".mp4", ".webm"),
              })
            );
          } catch (e) {
            // ignore
          }
      }
    }

    // 2. Delete from database
    await prisma.recording.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete recording error:", error);
    return NextResponse.json(
      { error: "Failed to delete recording" },
      { status: 500 }
    );
  }
}
