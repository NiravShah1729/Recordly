import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { CreateMultipartUploadCommand } from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/s3";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { roomId, sharedStartTime } = body;

    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const participantId = session.user.id;

    if (!roomId) {
      return NextResponse.json(
        { error: "roomId is required" },
        { status: 400 }
      );
    }

    const fileName = `${participantId}-${Date.now()}.webm`;
    const s3Key = `raw/${roomId}/${participantId}/${fileName}`;

    if (!process.env.AWS_S3_BUCKET_NAME) {
      throw new Error("AWS_S3_BUCKET_NAME is not configured");
    }

    // Initialize multipart upload in S3
    const command = new CreateMultipartUploadCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: s3Key,
      ContentType: "video/webm",
    });

    const s3Response = await s3Client.send(command);
    const uploadId = s3Response.UploadId;

    if (!uploadId) {
      throw new Error("Failed to get UploadId from S3");
    }

    // Create a new Recording record in Prisma
    const recording = await prisma.recording.create({
      data: {
        roomId,
        userId: participantId,
        fileName,
        s3Key,
        s3UploadId: uploadId,
        mimeType: "video/webm",
        status: "UPLOADING",
        startTime: sharedStartTime ? new Date(sharedStartTime) : null,
      },
    });

    return NextResponse.json({
      recordingId: recording.id,
      uploadId,
    });
  } catch (error) {
    console.error("Error initiating multipart upload:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
