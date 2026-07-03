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
 * into a single unified video grid (supports 2, 3, 4, or more users).
 */
export async function combineRecordings(roomId: string) {
  console.log(`[Combine] Starting combine for room ${roomId}`);

  let downloadedFiles: string[] = [];
  const tempDir = os.tmpdir();
  const uniqueId = Date.now().toString() + "-" + Math.floor(Math.random() * 1000);
  const outputPath = path.join(tempDir, `combined-${roomId}-${uniqueId}.mp4`);

  try {
    // ── 1. Mark room as PROCESSING ──────────────────────────
    const currentRoom = await prisma.room.findUnique({
      where: { id: roomId },
      select: { combineStatus: true }
    });
    
    if (currentRoom?.combineStatus === "PROCESSING" || currentRoom?.combineStatus === "READY") {
      console.log(`[Combine] Room ${roomId} already processing or ready. Skipping.`);
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
          orderBy: { startTime: 'asc' }, 
          include: { user: true },
        },
      },
    });

    if (!room) throw new Error(`Room ${roomId} not found`);

    const numUsers = room.recordings.length;
    if (numUsers < 2) {
      console.log(`[Combine] Only ${numUsers} recording(s) — skipping combine`);
      return;
    }

    // ── 3. Calculate offsets and grid dimensions ────────────
    const earliestStart = room.recordings[0].startTime?.getTime() || 0;
    
    const cols = Math.ceil(Math.sqrt(numUsers));
    const rows = Math.ceil(numUsers / cols);
    const cellW = Math.floor(1280 / cols);
    const cellH = Math.floor(720 / rows);
    
    console.log(`[Combine] Generating a ${cols}x${rows} grid for ${numUsers} users. (Cell: ${cellW}x${cellH})`);

    // ── 4. Download all files from S3 concurrently ──────────
    const bucketName = process.env.AWS_S3_BUCKET_NAME;
    if (!bucketName) throw new Error("Missing AWS_S3_BUCKET_NAME");

    console.log(`[Combine] Downloading ${numUsers} recordings from S3...`);
    
    downloadedFiles = room.recordings.map((_, i) => 
      path.join(tempDir, `combine-input-${i}-${roomId}-${uniqueId}.mp4`)
    );

    await Promise.all(
      room.recordings.map(async (recording, i) => {
        const obj = await s3Client.send(
          new GetObjectCommand({ Bucket: bucketName, Key: recording.s3Key })
        );
        if (!obj.Body) throw new Error(`No body in S3 object: ${recording.s3Key}`);
        await pipeline(obj.Body as Readable, fs.createWriteStream(downloadedFiles[i]));
      })
    );

    // ── 5. Build Dynamic FFmpeg Filtergraph ─────────────────
    const command = ffmpeg();
    downloadedFiles.forEach(file => command.input(file));

    const filtergraph: string[] = [];
    const layoutCoords: string[] = [];
    const vOutputs: string[] = [];
    const aOutputs: string[] = [];

    room.recordings.forEach((recording, i) => {
      const startTime = recording.startTime?.getTime() || earliestStart;
      const offsetSec = Math.max(0, (startTime - earliestStart) / 1000);
      const offsetMs = Math.floor(offsetSec * 1000);

      // --- Video Filter ---
      // Use rgb24 here so empty space defaults to black (RGB 0,0,0) instead of green
      if (offsetSec > 0) {
        filtergraph.push(`[${i}:v]scale=${cellW}:${cellH},setsar=1,format=rgb24,tpad=start_duration=${offsetSec}:color=black[v${i}]`);
      } else {
        filtergraph.push(`[${i}:v]scale=${cellW}:${cellH},setsar=1,format=rgb24[v${i}]`);
      }
      vOutputs.push(`[v${i}]`);

      // --- Calculate position in the grid ---
      const col = i % cols;
      const row = Math.floor(i / cols);
      
      let x = col * cellW;
      let y = row * cellH;

      const itemsInThisRow = (row === rows - 1) ? (numUsers - row * cols) : cols;
      if (itemsInThisRow < cols) {
        const emptySpace = 1280 - (itemsInThisRow * cellW);
        x += Math.floor(emptySpace / 2); 
      }
      layoutCoords.push(`${x}_${y}`);

      // --- Audio Filter ---
      if (offsetMs > 0) {
        filtergraph.push(`[${i}:a]adelay=${offsetMs}|${offsetMs}[a${i}]`);
      } else {
        filtergraph.push(`[${i}:a]anull[a${i}]`); 
      }
      aOutputs.push(`[a${i}]`);
    });

    // Combine Video streams using xstack (removed :fill=black to prevent older FFmpeg crashes)
    filtergraph.push(`${vOutputs.join('')}xstack=inputs=${numUsers}:layout=${layoutCoords.join('|')}[vout_stack]`);
    
    // Format back to yuv420p for final MP4 compatibility
    filtergraph.push(`[vout_stack]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p[vout]`);

    // Combine Audio streams
    filtergraph.push(`${aOutputs.join('')}amix=inputs=${numUsers}:duration=longest[aout]`);

    // ── 6. Run FFmpeg ───────────────────────────────────────
    console.log(`[Combine] Running FFmpeg combine...`);

    await new Promise<void>((resolve, reject) => {
      command
        .complexFilter(filtergraph)
        .outputOptions([
          "-map", "[vout]",
          "-map", "[aout]",
          "-c:v", "libx264",
          "-crf", "18",
          "-preset", "fast",
          "-c:a", "aac",
          "-b:a", "192k",
          "-movflags", "+faststart",
        ])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });

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

  } catch (error) {
    console.error(`[Combine] ❌ Error combining recordings for room ${roomId}:`, error);
    try {
      await prisma.room.update({
        where: { id: roomId },
        data: { combineStatus: "FAILED" },
      });
    } catch (dbError) {
      console.error("[Combine] Failed to update combineStatus to FAILED:", dbError);
    }
  } finally {
    // ── 9. Clean up all temp files dynamically ──────────────
    console.log(`[Combine] Cleaning up temp files...`);
    for (const file of downloadedFiles) {
      await fs.promises.unlink(file).catch(() => {});
    }
    await fs.promises.unlink(outputPath).catch(() => {});
  }
}