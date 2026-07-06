import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { recordingId, partNumber, eTag } = body;

    if (!recordingId || typeof partNumber !== "number" || !eTag) {
      return NextResponse.json(
        { error: "recordingId, partNumber, and eTag are required" },
        { status: 400 }
      );
    }

    // Save the new UploadPart (RecordingPart) in Prisma
    await prisma.uploadPart.create({
      data: {
        recordingId,
        partNumber,
        etag: eTag,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving eTag for part:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
