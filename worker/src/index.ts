import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { redis } from '../../lib/redis';
import prisma from '../../lib/prisma';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import ffmpeg from 'fluent-ffmpeg';


/**
 * Builds the FFmpeg filter_complex string dynamically based on the recordings' start times
 * and participant count. Uses xstack for an infinite grid and tpad/adelay for syncing.
 */
export function buildFilterComplex(recordings: { startTime: Date | null }[]): string[] {
  const numUsers = recordings.length;
  if (numUsers === 0) return [];

  // Sort recordings by startTime to find the earliest (though they might already be sorted)
  const sortedRecordings = [...recordings].sort(
    (a, b) => (a.startTime?.getTime() || 0) - (b.startTime?.getTime() || 0)
  );
  
  const earliestStart = sortedRecordings[0].startTime?.getTime() || 0;

  const cols = Math.ceil(Math.sqrt(numUsers));
  const rows = Math.ceil(numUsers / cols);
  const cellW = Math.floor(1280 / cols);
  const cellH = Math.floor(720 / rows);

  const filtergraph: string[] = [];
  const layoutCoords: string[] = [];
  const vOutputs: string[] = [];
  const aOutputs: string[] = [];

  recordings.forEach((recording, i) => {
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

  if (numUsers === 1) {
    // If only 1 user, no need for xstack
    filtergraph.push(`[v0]format=yuv420p[vout]`);
    filtergraph.push(`[a0]anull[aout]`);
  } else {
    // Combine Video streams using xstack
    filtergraph.push(`${vOutputs.join('')}xstack=inputs=${numUsers}:layout=${layoutCoords.join('|')}[vout_stack]`);
    
    // Format back to yuv420p for final MP4 compatibility
    filtergraph.push(`[vout_stack]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p[vout]`);

    // Combine Audio streams
    filtergraph.push(`${aOutputs.join('')}amix=inputs=${numUsers}:duration=longest[aout]`);
  }

  return filtergraph;
}

// Ensure bucket name is available
const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
if (!BUCKET_NAME) {
  throw new Error('AWS_S3_BUCKET_NAME is not configured');
}

/**
 * Downloads a file from S3 to a local path
 */
async function downloadFromS3(key: string, downloadPath: string) {
  const getObjectResponse = await s3Client.send(
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
  );

  if (!getObjectResponse.Body) {
    throw new Error(`Failed to download ${key} from S3`);
  }

  const writeStream = fs.createWriteStream(downloadPath);
  await pipeline(getObjectResponse.Body as NodeJS.ReadableStream, writeStream);
}

/**
 * The BullMQ Worker instance
 * Concurrency is explicitly set to 2 to limit CPU saturation on FFmpeg tasks.
 * Tune this value depending on the Railway instance size.
 */
const combineWorker = new Worker(
  'combine-queue',
  async (job: Job) => {
    const { roomId } = job.data;
    console.log(`[Job ${job.id}] Starting combine process for room: ${roomId}`);

    let tempDir = '';

    try {
      // 1. Fetch Room and completed Recordings
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          recordings: {
            where: { uploadComplete: true },
          },
        },
      });

      if (!room) {
        throw new Error(`Room ${roomId} not found`);
      }

      if (room.recordings.length === 0) {
        throw new Error(`No completed recordings found for room ${roomId}`);
      }

      // 2. Update Room status to PROCESSING
      await prisma.room.update({
        where: { id: roomId },
        data: { combineStatus: 'PROCESSING' },
      });

      // 3. Setup Temp Directory
      const timestamp = Date.now();
      tempDir = path.join('/tmp', `combine-${roomId}-${timestamp}`);
      fs.mkdirSync(tempDir, { recursive: true });

      // 4. Download S3 Chunks
      console.log(`[Job ${job.id}] Downloading ${room.recordings.length} recordings...`);
      const downloadedFiles: string[] = [];

      for (let i = 0; i < room.recordings.length; i++) {
        const recording = room.recordings[i];
        const ext = path.extname(recording.s3Key) || '.webm';
        const localPath = path.join(tempDir, `input_${i}${ext}`);
        
        await downloadFromS3(recording.s3Key, localPath);
        downloadedFiles.push(localPath);
      }

      // 5. Build FFmpeg command and filter
      const outputPath = path.join(tempDir, 'output.mp4'); // Switch to .mp4 for libx264
      console.log(`[Job ${job.id}] Building dynamic FFmpeg filter for ${room.recordings.length} inputs...`);
      
      const filterComplex = buildFilterComplex(room.recordings);
      
      await new Promise<void>((resolve, reject) => {
        const command = ffmpeg();
        
        downloadedFiles.forEach(file => {
          command.input(file);
        });

        if (filterComplex.length > 0) {
          command.complexFilter(filterComplex);
          
          command.outputOptions([
            "-map", "[vout]",
            "-map", "[aout]",
            "-c:v", "libx264",
            "-crf", "23",
            "-preset", "fast",
            "-c:a", "aac",
            "-b:a", "192k",
            "-async", "1",
            "-movflags", "+faststart",
          ]);
        }

        command
          .output(outputPath)
          .on('end', () => {
            console.log(`[Job ${job.id}] FFmpeg processing completed.`);
            resolve();
          })
          .on('error', (err: any) => {
            console.error(`[Job ${job.id}] FFmpeg processing failed:`, err);
            reject(err);
          })
          .run();
      });

      // 6. Upload output back to S3
      console.log(`[Job ${job.id}] Uploading combined video to S3...`);
      const combinedS3Key = `combined/${roomId}/${timestamp}-combined.mp4`;
      
      const fileStream = fs.createReadStream(outputPath);
      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: combinedS3Key,
          Body: fileStream,
          ContentType: 'video/mp4',
        })
      );

      const combinedUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${combinedS3Key}`;

      // 7. Update Room status to READY and recordings to COMPLETED
      console.log(`[Job ${job.id}] Marking room ${roomId} as READY.`);
      await prisma.$transaction([
        prisma.room.update({
          where: { id: roomId },
          data: {
            combineStatus: 'READY',
            combinedS3Key,
            combinedUrl,
          },
        }),
        prisma.recording.updateMany({
          where: { roomId: roomId },
          data: { status: 'READY' },
        })
      ]);

    } catch (error) {
      console.error(`[Job ${job.id}] Combine job failed:`, error);
      
      // Update room status to FAILED
      await prisma.room.update({
        where: { id: roomId },
        data: { combineStatus: 'FAILED' },
      }).catch((err: any) => console.error('Failed to update room to FAILED status:', err));

      // Rethrow to let BullMQ handle exponential backoff retries
      throw error;
    } finally {
      // 8. Cleanup Temp Directory
      if (tempDir && fs.existsSync(tempDir)) {
        console.log(`[Job ${job.id}] Cleaning up temp directory: ${tempDir}`);
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  },
  {
    connection: redis as any,
    concurrency: 2, // Explicit concurrency limit
  }
);

console.log(`[Worker] Started combine worker on queue "combine-queue" with concurrency 2`);

// Graceful Shutdown on Railway redeploys
const gracefulShutdown = async (signal: string) => {
  console.log(`[Worker] Received ${signal}, closing worker gracefully...`);
  await combineWorker.close();
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
