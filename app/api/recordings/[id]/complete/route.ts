import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { ListPartsCommand, CompleteMultipartUploadCommand, Part } from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/s3";
import prisma from "@/lib/prisma";
import { enqueueCombineJob } from "@/lib/queues/combineQueue";
import { redis } from "@/lib/redis";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 1. Validate session
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ success: false, error: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const recordingId = id;

    // 2. Fetch the Recording
    const recording = await prisma.recording.findUnique({
      where: { id: recordingId },
    });

    if (!recording) {
      return NextResponse.json({ success: false, error: "NOT_FOUND", message: "Recording not found" }, { status: 404 });
    }

    // Verify ownership
    if (recording.userId !== userId) {
      return NextResponse.json({ success: false, error: "FORBIDDEN", message: "Forbidden" }, { status: 403 });
    }

    // Idempotency guard
    if (recording.uploadComplete) {
      return NextResponse.json({ success: true, recording });
    }

    // Preconditions
    if (!recording.s3UploadId || !recording.s3Key) {
      return NextResponse.json(
        { success: false, error: "BAD_REQUEST", message: "Upload was never initialized (missing s3UploadId or s3Key)" },
        { status: 400 }
      );
    }

    if (!process.env.AWS_S3_BUCKET_NAME) {
      return NextResponse.json({ success: false, error: "SERVER_ERROR", message: "AWS_S3_BUCKET_NAME is not configured" }, { status: 500 });
    }

    // Parse expectedParts from the request body
    const body = await req.json();
    const expectedParts = body.expectedParts;

    if (typeof expectedParts !== 'number') {
      return NextResponse.json(
        { success: false, error: "BAD_REQUEST", message: "expectedParts must be a number" },
        { status: 400 }
      );
    }

    // 3. Call ListPartsCommand
    let s3Parts: Part[] = [];
    let isTruncated = true;
    let partNumberMarker: string | undefined = undefined;

    // Handle pagination for S3 ListParts (caps at 1000 parts)
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
        s3PartsMap.set(p.PartNumber, p.ETag);
      }
    });

    const dbPartsMap = new Map<number, string>();
    dbParts.forEach((p) => {
      dbPartsMap.set(p.partNumber, p.etag);
    });

    const partsToInsert: { recordingId: string, partNumber: number, etag: string }[] = [];
    
    // a. DB missing part that S3 has -> recovery
    for (const [partNumber, etag] of s3PartsMap.entries()) {
      if (!dbPartsMap.has(partNumber)) {
        partsToInsert.push({
          recordingId,
          partNumber,
          etag: etag.replace(/"/g, ""), // DB typically stores it without quotes
        });
      }
    }

    // b. DB has part that S3 does not -> log it, trust S3
    for (const partNumber of dbPartsMap.keys()) {
      if (!s3PartsMap.has(partNumber)) {
        console.warn(`[Reconciliation Anomaly] DB has part ${partNumber} but S3 does not for recording ${recordingId}. Trusting S3.`);
      }
    }

    // c. Compare reconciled count against expectedParts
    if (s3PartsMap.size < expectedParts) {
      // Find which part numbers are missing (expected 1..expectedParts)
      const missingParts: number[] = [];
      for (let i = 1; i <= expectedParts; i++) {
        if (!s3PartsMap.has(i)) {
          missingParts.push(i);
        }
      }

      // Do NOT complete upload. Client should retry missing parts.
      return NextResponse.json(
        { success: false, error: "MISSING_PARTS", missingParts },
        { status: 409 }
      );
    }

    // 6. Build Parts array and complete upload
    const sortedParts = Array.from(s3PartsMap.entries())
      .sort((a, b) => a[0] - b[0]) // S3 requires ascending order
      .map(([partNumber, etag]) => ({
        PartNumber: partNumber,
        ETag: etag,
      }));

    if (sortedParts.length === 0) {
      return NextResponse.json({ success: false, error: "BAD_REQUEST", message: "No parts found for upload" }, { status: 400 });
    }

    let completeRes;
    try {
      completeRes = await s3Client.send(
        new CompleteMultipartUploadCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: recording.s3Key,
          UploadId: recording.s3UploadId,
          MultipartUpload: {
            Parts: sortedParts,
          },
        })
      );
    } catch (s3Error: any) {
      console.error("S3 CompleteMultipartUploadCommand failed:", s3Error);
      return NextResponse.json(
        { success: false, error: "S3_ERROR", message: s3Error.message || "Failed to complete upload" },
        { status: 500 }
      );
    }

    // 7. On success: Update Recording and insert recovered UploadParts in a transaction
    const finalS3Key = completeRes.Key ?? recording.s3Key;

    const [updatedRecording] = await prisma.$transaction([
      prisma.recording.update({
        where: { id: recordingId },
        data: { 
          uploadComplete: true,
          s3Key: finalS3Key,
        },
      }),
      ...(partsToInsert.length > 0
        ? [prisma.uploadPart.createMany({ data: partsToInsert })]
        : []),
    ]);

    // 8. Room completion check
    if (updatedRecording.roomId) {
      const room = await prisma.room.findUnique({
        where: { id: updatedRecording.roomId },
        include: { participants: true },
      });

      if (room) {
        const allRoomRecordings = await prisma.recording.findMany({
          where: { roomId: room.id },
          orderBy: { createdAt: "desc" }
        });

        const latestRecordingsMap = new Map<string, any>();
        for (const rec of allRoomRecordings) {
          if (!latestRecordingsMap.has(rec.userId)) {
            latestRecordingsMap.set(rec.userId, rec);
          }
        }
        
        const uniqueRecentRecordings = Array.from(latestRecordingsMap.values());
        const completedCount = uniqueRecentRecordings.filter((r) => r.uploadComplete).length;

        const expectedCountStr = await redis.get(`room:${room.id}:expectedRecordingCount`);
        const expectedCount = expectedCountStr ? parseInt(expectedCountStr, 10) : room.participants.length;

        // TODO: A participant whose tab closes before calling Complete will leave the room stuck in PENDING forever under this logic.
        // A grace-period timeout + partial-finalize is deferred to a later version.

        if (completedCount >= expectedCount) {
          console.log(`All participants complete for room ${room.id} — enqueuing combine job`);
          
          await enqueueCombineJob(room.id);

          await prisma.recording.updateMany({
            where: { roomId: room.id },
            data: { status: "PROCESSING" },
          });
        }
      }
    }

    return NextResponse.json({ success: true, recording: updatedRecording });
  } catch (error: any) {
    console.error("Error completing recording:", error);
    return NextResponse.json(
      { success: false, error: "INTERNAL_SERVER_ERROR", message: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

