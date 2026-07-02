import fs from "fs";
import path from "path";
import os from "os";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "./s3";
import prisma from "./prisma";
import ffmpeg from "./ffmpeg";

/**
 * combineRecordings — Combines all participant recordings for a room
 * into a single side-by-side video.
 *
 * Layout logic:
 *   - If the guest was there from the start (offset = 0):
 *       → Full split-screen for the entire duration
 *       → Host on left (640×720), Guest on right (640×720)
 *
 *   - If the guest joined late (offset > 0):
 *       → Phase 1: Host full-screen (1280×720) from 0s to guestAppearsAt
 *       → Phase 2: Split-screen from guestAppearsAt onward
 *       → Both phases concatenated into one final video
 *
 *   Audio:
 *       → Host audio plays for the full duration
 *       → Guest audio mixed in from guestAppearsAt onward using amix
 */
export async function combineRecordings(roomId: string) {
  console.log(`[Combine] Starting combine for room ${roomId}`);

  try {
    // ── 1. Mark room as PROCESSING ──────────────────────────
    // Fetch first to check if already processing
    const currentRoom = await prisma.room.findUnique({
      where: { id: roomId },
      select: { combineStatus: true }
    });
    
    if (currentRoom?.combineStatus === "PROCESSING" || currentRoom?.combineStatus === "READY") {
      console.log(`[Combine] Room ${roomId} already processing or ready (status: ${currentRoom.combineStatus}). Skipping.`);
      return;
    }

    await prisma.room.update({
      where: { id: roomId },
      data: { combineStatus: "PROCESSING" },
    });

    // ── 2. Fetch room + all READY recordings ────────────────
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        recordings: {
          where: { status: "READY" },
          include: { user: true },
        },
      },
    });

    if (!room) throw new Error(`Room ${roomId} not found`);

    // We need at least 2 recordings to combine
    if (room.recordings.length < 2) {
      console.log(`[Combine] Only ${room.recordings.length} recording(s) — skipping combine`);
      return;
    }

    // ── 3. Identify host vs guest recordings ────────────────
    // Sort recordings by createdAt descending to ensure we combine the latest ones
    // in case there are multiple recordings from previous sessions in this room.
    const sortedRecordings = [...room.recordings].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );

    const hostRecording = sortedRecordings.find((r) => r.userId === room.hostId);
    const guestRecording = sortedRecordings.find((r) => r.userId !== room.hostId);

    if (!hostRecording || !guestRecording) {
      throw new Error("Could not identify host and guest recordings");
    }

    // ── 4. Calculate time offset ────────────────────────────
    // Both recordings have a startTime (set when the socket "start-recording"
    // event fired). The difference tells us how much later the guest's
    // recording started relative to the host's.
    const hostStart = hostRecording.startTime?.getTime() || 0;
    const guestStart = guestRecording.startTime?.getTime() || 0;
    const earliestStart = Math.min(hostStart, guestStart);
    const guestAppearsAt = Math.max(0, (guestStart - earliestStart) / 1000);

    console.log(`[Combine] Host start: ${hostStart}, Guest start: ${guestStart}`);
    console.log(`[Combine] Guest appears at: ${guestAppearsAt}s`);

    // ── 5. Download both files from S3 ──────────────────────
    const bucketName = process.env.AWS_S3_BUCKET_NAME;
    if (!bucketName) throw new Error("Missing AWS_S3_BUCKET_NAME");

    const tempDir = os.tmpdir();
    const uniqueId = Date.now().toString() + "-" + Math.floor(Math.random() * 1000);
    const hostPath = path.join(tempDir, `combine-host-${roomId}-${uniqueId}.mp4`);
    const guestPath = path.join(tempDir, `combine-guest-${roomId}-${uniqueId}.mp4`);
    const outputPath = path.join(tempDir, `combined-${roomId}-${uniqueId}.mp4`);

    // Download host recording
    console.log(`[Combine] Downloading host recording: ${hostRecording.s3Key}`);
    const hostObj = await s3Client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: hostRecording.s3Key })
    );
    if (hostObj.Body) {
      await pipeline(hostObj.Body as Readable, fs.createWriteStream(hostPath));
    } else {
      throw new Error("No body in host S3 object");
    }

    // Download guest recording
    console.log(`[Combine] Downloading guest recording: ${guestRecording.s3Key}`);
    const guestObj = await s3Client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: guestRecording.s3Key })
    );
    if (guestObj.Body) {
      await pipeline(guestObj.Body as Readable, fs.createWriteStream(guestPath));
    } else {
      throw new Error("No body in guest S3 object");
    }

    // ── 6. Run FFmpeg to combine ────────────────────────────
    console.log(`[Combine] Running FFmpeg combine...`);

    if (guestAppearsAt === 0) {
      // ── Case A: Both started at the same time ─────────────
      // Full split-screen for the entire duration
      // Host on the left (640×720), Guest on the right (640×720)
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(hostPath)
          .input(guestPath)
          .complexFilter([
            // Scale both videos to 640×720 (half of 1280×720)
            "[0:v]scale=640:720,setsar=1[left]",
            "[1:v]scale=640:720,setsar=1[right]",
            // Stack them side by side → 1280×720 output
            "[left][right]hstack=inputs=2[vout]",
            // Mix both audio tracks together
            "[0:a][1:a]amix=inputs=2:duration=longest[aout]",
          ])
          .outputOptions([
            "-map", "[vout]",
            "-map", "[aout]",
            "-c:v", "libx264",
            "-crf", "18",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
          ])
          .output(outputPath)
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run();
      });
    } else {
      // ── Case B: Guest joined late ─────────────────────────
      // Phase 1: Host full-screen (1280×720) from 0 to guestAppearsAt
      // Phase 2: Split-screen from guestAppearsAt onward
      // We use FFmpeg's complex filtergraph to handle both phases
      // and concatenate them in a single command.

      const phase1Path = path.join(tempDir, `phase1-${roomId}-${uniqueId}.mp4`);
      const phase2Path = path.join(tempDir, `phase2-${roomId}-${uniqueId}.mp4`);

      // Phase 1: Host full screen for the first guestAppearsAt seconds
      console.log(`[Combine] Phase 1: Host full-screen for ${guestAppearsAt}s`);
      await new Promise<void>((resolve, reject) => {
        ffmpeg(hostPath)
          .outputOptions([
            "-t", guestAppearsAt.toString(),
            "-vf", "scale=1280:720,setsar=1",
            "-c:v", "libx264",
            "-crf", "18",
            "-c:a", "aac",
            "-b:a", "192k",
          ])
          .output(phase1Path)
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run();
      });

      // Phase 2: Split screen from guestAppearsAt onward
      // Host video starts at guestAppearsAt, Guest video starts at 0
      console.log(`[Combine] Phase 2: Split-screen from ${guestAppearsAt}s`);
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(hostPath)
          .inputOptions(["-ss", guestAppearsAt.toString()])
          .input(guestPath)
          .complexFilter([
            "[0:v]scale=640:720,setsar=1[left]",
            "[1:v]scale=640:720,setsar=1[right]",
            "[left][right]hstack=inputs=2[vout]",
            "[0:a][1:a]amix=inputs=2:duration=longest[aout]",
          ])
          .outputOptions([
            "-map", "[vout]",
            "-map", "[aout]",
            "-c:v", "libx264",
            "-crf", "18",
            "-c:a", "aac",
            "-b:a", "192k",
          ])
          .output(phase2Path)
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run();
      });

      // Concatenate Phase 1 + Phase 2 using the concat demuxer
      console.log(`[Combine] Concatenating Phase 1 + Phase 2`);
      const concatListPath = path.join(tempDir, `concat-${roomId}-${uniqueId}.txt`);
      await fs.promises.writeFile(
        concatListPath,
        `file '${phase1Path.replace(/\\/g, "/")}'\nfile '${phase2Path.replace(/\\/g, "/")}'`
      );

      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(concatListPath)
          .inputOptions(["-f", "concat", "-safe", "0"])
          .outputOptions([
            "-c:v", "libx264",
            "-crf", "18",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
          ])
          .output(outputPath)
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run();
      });

      // Clean up phase files
      await fs.promises.unlink(phase1Path).catch(() => {});
      await fs.promises.unlink(phase2Path).catch(() => {});
      await fs.promises.unlink(concatListPath).catch(() => {});
    }

    // ── 7. Upload combined video to S3 ──────────────────────
    console.log(`[Combine] Uploading combined video to S3...`);
    const combinedS3Key = `combined/${roomId}-final.mp4`;
    const combinedBuffer = await fs.promises.readFile(outputPath);

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: combinedS3Key,
        Body: combinedBuffer,
        ContentType: "video/mp4",
      })
    );

    const region = process.env.AWS_REGION;
    const combinedUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${combinedS3Key}`;

    // ── 8. Update Room in database ──────────────────────────
    await prisma.room.update({
      where: { id: roomId },
      data: {
        combinedS3Key,
        combinedUrl,
        combineStatus: "READY",
      },
    });

    console.log(`[Combine] ✅ Combine complete for room ${roomId}: ${combinedUrl}`);

    // ── 9. Clean up temp files ──────────────────────────────
    await fs.promises.unlink(hostPath).catch(() => {});
    await fs.promises.unlink(guestPath).catch(() => {});
    await fs.promises.unlink(outputPath).catch(() => {});
  } catch (error) {
    console.error(`[Combine] ❌ Error combining recordings for room ${roomId}:`, error);

    // Mark as FAILED so the frontend knows something went wrong
    try {
      await prisma.room.update({
        where: { id: roomId },
        data: { combineStatus: "FAILED" },
      });
    } catch (dbError) {
      console.error("[Combine] Failed to update combineStatus to FAILED:", dbError);
    }
  }
}
