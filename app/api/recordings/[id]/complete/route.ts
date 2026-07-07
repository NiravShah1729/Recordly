import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { ListPartsCommand, CompleteMultipartUploadCommand, Part } from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/s3";
import prisma from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Validate session
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const recordingId = params.id;

    // 2. Fetch the Recording
    const recording = await prisma.recording.findUnique({
      where: { id: recordingId },
    });

    if (!recording) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (recording.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!recording.s3UploadId || !recording.s3Key) {
      return NextResponse.json(
        { error: "Upload was never initialized (missing s3UploadId or s3Key)" },
        { status: 400 }
      );
    }

    if (!process.env.AWS_S3_BUCKET_NAME) {
      return NextResponse.json({ error: "AWS_S3_BUCKET_NAME is not configured" }, { status: 500 });
    }

    // 3. Call ListPartsCommand
    let s3Parts: Part[] = [];
    let isTruncated = true;
    let partNumberMarker: string | undefined = undefined;

    while (isTruncated) {
      const listRes: any = await s3Client.send(
        new ListPartsCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: recording.s3Key,
          UploadId: recording.s3UploadId,
          PartNumberMarker: partNumberMarker,
        })
      );

      if (listRes.Parts) {
        s3Parts = s3Parts.concat(listRes.Parts);
      }
      isTruncated = listRes.IsTruncated ?? false;
      if (isTruncated) {
        partNumberMarker = listRes.NextPartNumberMarker?.toString();
      }
    }

    // 4. Fetch all UploadPart rows from DB
    const dbParts = await prisma.uploadPart.findMany({
      where: { recordingId },
    });

    // 5. Reconcile lists
    const s3PartsMap = new Map<number, string>();
    s3Parts.forEach((p) => {
      if (p.PartNumber !== undefined && p.ETag) {
        // Keep original ETag for CompleteMultipartUpload
        s3PartsMap.set(p.PartNumber, p.ETag);
      }
    });

    const dbPartsMap = new Map<number, string>();
    dbParts.forEach((p) => {
      dbPartsMap.set(p.partNumber, p.etag);
    });

    const partsToInsert = [];
    for (const [partNumber, etag] of s3PartsMap.entries()) {
      if (!dbPartsMap.has(partNumber)) {
        partsToInsert.push({
          recordingId,
          partNumber,
          etag: etag.replace(/"/g, ""), // DB typically stores it without quotes
        });
      }
    }

    // Insert missing parts in DB
    if (partsToInsert.length > 0) {
      await prisma.uploadPart.createMany({
        data: partsToInsert,
      });
      // Update dbPartsMap to reflect what is now in DB
      partsToInsert.forEach((p) => dbPartsMap.set(p.partNumber, p.etag));
    }

    // Check for parts in DB that S3 does NOT have
    const missingPartNumbers: number[] = [];
    for (const partNumber of dbPartsMap.keys()) {
      if (!s3PartsMap.has(partNumber)) {
        missingPartNumbers.push(partNumber);
      }
    }

    if (missingPartNumbers.length > 0) {
      return NextResponse.json(
        { error: "missing_parts", missingPartNumbers },
        { status: 409 }
      );
    }

    // 6. Build Parts array and complete upload
    const sortedParts = Array.from(s3PartsMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([partNumber, etag]) => ({
        PartNumber: partNumber,
        ETag: etag,
      }));

    if (sortedParts.length === 0) {
      return NextResponse.json({ error: "No parts found for upload" }, { status: 400 });
    }

    await s3Client.send(
      new CompleteMultipartUploadCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: recording.s3Key,
        UploadId: recording.s3UploadId,
        MultipartUpload: {
          Parts: sortedParts,
        },
      })
    );

    // 7. Update the Recording
    await prisma.recording.update({
      where: { id: recordingId },
      data: { uploadComplete: true },
    });

    // 8. Room completion check
    if (recording.roomId) {
      const room = await prisma.room.findUnique({
        where: { id: recording.roomId },
        include: { participants: true },
      });

      if (room) {
        const allRoomRecordings = await prisma.recording.findMany({
          where: { roomId: room.id },
        });

        const completedCount = allRoomRecordings.filter((r) => r.uploadComplete).length;

        if (
          allRoomRecordings.length === room.participants.length &&
          completedCount === room.participants.length
        ) {
          console.log(
            `All participants complete for room ${room.id} — ready to enqueue combine job`
          );

          await prisma.recording.updateMany({
            where: { roomId: room.id },
            data: { status: "PROCESSING" },
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error completing recording:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
