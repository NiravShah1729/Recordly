import fs from "fs";
import path from "path";
import os from "os";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { GetObjectCommand, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "./s3";
import prisma from "./prisma";
import ffmpeg from "./ffmpeg";

export async function processRecording(recordingId: string) {
  try {
    const recording = await prisma.recording.findUnique({
      where: { id: recordingId },
      include: { user: true },
    });

    if (!recording) throw new Error("Recording not found");

    // 1. Mark as PROCESSING
    await prisma.recording.update({
      where: { id: recordingId },
      data: { status: "PROCESSING" },
    });

    const bucketName = process.env.AWS_S3_BUCKET_NAME;
    if (!bucketName) throw new Error("Missing AWS_S3_BUCKET_NAME");

    // 2. Download raw webm to local temp
    const rawS3Key = recording.s3Key;
    const tempDir = os.tmpdir();
    const rawPath = path.join(tempDir, `raw-${recording.id}.webm`);
    const mp4Path = path.join(tempDir, `processed-${recording.id}.mp4`);
    const thumbName = `thumb-${recording.id}.jpg`;
    const thumbPath = path.join(tempDir, thumbName);

    console.log(`[FFmpeg] Downloading raw recording from S3: ${rawS3Key}`);
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: rawS3Key,
    });
    const s3Object = await s3Client.send(getCommand);
    
    if (s3Object.Body) {
      await pipeline(s3Object.Body as Readable, fs.createWriteStream(rawPath));
    } else {
      throw new Error("No body in S3 object");
    }

    // 3. Extract Duration
    let duration = 0;
    await new Promise<void>((resolve, reject) => {
      ffmpeg.ffprobe(rawPath, (err, metadata) => {
        if (err) {
          console.warn("[FFmpeg] ffprobe error, defaulting duration to 0:", err);
          return resolve();
        }
        const parsedDuration = Number(metadata?.format?.duration);
        duration = isNaN(parsedDuration) ? 0 : Math.floor(parsedDuration);
        resolve();
      });
    });

    // 4. Transcode to MP4 (compress)
    console.log("[FFmpeg] Transcoding to MP4...");
    await new Promise<void>((resolve, reject) => {
      ffmpeg(rawPath)
        .output(mp4Path)
        .videoCodec("libx264")
        .addOptions(["-crf 28", "-preset fast"])
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    })

    // 5. Extract Thumbnail
    console.log("[FFmpeg] Extracting thumbnail...");
    const thumbTimestamp = duration > 1 ? 1 : 0;
    await new Promise<void>((resolve, reject) => {
      ffmpeg(rawPath)
        .screenshots({
          count: 1,
          timestamps: [thumbTimestamp],
          folder: tempDir,
          filename: thumbName,
        })
        .on("end", () => resolve())
        .on("error", (err) => reject(err));
    });

    // 6. Upload MP4 to S3
    console.log("[FFmpeg] Uploading MP4 to S3...");
    const mp4Key = `processed/${recording.userId}/${recording.id}.mp4`;
    const mp4Buffer = await fs.promises.readFile(mp4Path);
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: mp4Key,
      Body: mp4Buffer,
      ContentType: "video/mp4",
    }));

    // 7. Upload Thumbnail to S3
    console.log("[FFmpeg] Uploading Thumbnail to S3...");
    const thumbKey = `thumbnails/${recording.userId}/${recording.id}.jpg`;
    const thumbBuffer = await fs.promises.readFile(thumbPath);
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: thumbKey,
      Body: thumbBuffer,
      ContentType: "image/jpeg",
    }));

    // 8. Delete Raw WebM from S3
    console.log("[FFmpeg] Deleting raw webm from S3...");
    await s3Client.send(new DeleteObjectCommand({
      Bucket: bucketName,
      Key: rawS3Key,
    }));

    // 9. Clean up temp local files
    await fs.promises.unlink(rawPath).catch(() => {});
    await fs.promises.unlink(mp4Path).catch(() => {});
    await fs.promises.unlink(thumbPath).catch(() => {});

    // 10. Update Database
    const region = process.env.AWS_REGION;
    const mp4CdnUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${mp4Key}`;
    const thumbCdnUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${thumbKey}`;

    await prisma.recording.update({
      where: { id: recordingId },
      data: {
        status: "READY",
        s3Key: mp4Key,
        cdnUrl: mp4CdnUrl,
        thumbnailUrl: thumbCdnUrl,
        duration: duration,
        mimeType: "video/mp4",
        fileName: recording.fileName.replace(".webm", ".mp4"),
      },
    });

    console.log(`[FFmpeg] Processing complete for recording ${recordingId}`);

    // ── Check if all participants have uploaded ─────────────
    // If this recording belongs to a room, check whether all
    // participants' recordings are now READY. If yes, trigger
    // the combineRecordings job to create the final combined video.
    if (recording.roomId && recording.startTime) {
      try {
        // Find all recordings for this room with a similar startTime
        // (within 10 seconds — accounts for slight network delay
        // between when each browser starts recording)
        const tenSeconds = 10 * 1000; // 10 seconds in milliseconds
        const startMs = recording.startTime.getTime();

        const roomRecordings = await prisma.recording.findMany({
          where: {
            roomId: recording.roomId,
            startTime: {
              gte: new Date(startMs - tenSeconds),
              lte: new Date(startMs + tenSeconds),
            },
          },
        });

        // Count how many distinct users uploaded
        const distinctUsers = new Set(roomRecordings.map((r) => r.userId));
        // Count how many of those have status READY
        const readyCount = roomRecordings.filter((r) => r.status === "READY").length;

        console.log(
          `[Combine Check] Room ${recording.roomId}: ` +
          `${readyCount}/${distinctUsers.size} recordings READY`
        );

        // If we have at least 2 participants and ALL are READY → combine!
        if (distinctUsers.size >= 2 && readyCount === distinctUsers.size) {
          console.log(`[Combine Check] All participants ready — triggering combine`);
          // Fire and forget — don't await
          import("./combineRecordings").then(({ combineRecordings }) => {
            combineRecordings(recording.roomId!).catch((err) => {
              console.error("[Combine Check] Background combine failed:", err);
            });
          });
        }
      } catch (combineCheckError) {
        // Don't let a combine-check failure break the individual processing
        console.error("[Combine Check] Error checking combine readiness:", combineCheckError);
      }
    }
  } catch (error) {
    console.error(`[FFmpeg] Error processing recording ${recordingId}:`, error);
    try {
      await prisma.recording.update({
        where: { id: recordingId },
        data: { status: "FAILED" },
      });
    } catch (dbError) {
      console.error("Failed to update status to FAILED:", dbError);
    }
  }
}
