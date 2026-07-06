import { NextResponse } from "next/server";
import { UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "@/lib/s3";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { recordingId, uploadId, partNumber } = body;

    if (!recordingId || !uploadId || typeof partNumber !== "number") {
      return NextResponse.json(
        { error: "recordingId, uploadId, and partNumber are required" },
        { status: 400 }
      );
    }

    // Retrieve the recording from Prisma to get the S3 object key
    const recording = await prisma.recording.findUnique({
      where: { id: recordingId },
    });

    if (!recording) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    if (!process.env.AWS_S3_BUCKET_NAME) {
      throw new Error("AWS_S3_BUCKET_NAME is not configured");
    }

    // Generate a presigned URL for the specific part
    const command = new UploadPartCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: recording.s3Key,
      PartNumber: partNumber,
      UploadId: uploadId,
    });

    // URL expires in 15 minutes (900 seconds)
    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 900,
    });

    return NextResponse.json({ presignedUrl });
  } catch (error) {
    console.error("Error generating presigned URL for part:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
