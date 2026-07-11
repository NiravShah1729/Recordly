/**
 * Note: The Worker side (Part 8 - FFmpeg combine worker) will import the same 
 * lib/redis.ts connection and listen on this same 'combine-queue' name. 
 * This queue name is a contract between the Next.js API (producer) and the Worker (consumer).
 */
import { Queue } from 'bullmq';
import { redis } from '@/lib/redis';

export const combineQueue = new Queue('combine-queue', {
  connection: redis as unknown as import('bullmq').ConnectionOptions,
});

export async function enqueueCombineJob(roomId: string) {
  try {
    const job = await combineQueue.add(
      'combine',
      { roomId },
      {
        // idempotency mechanism: If the Complete API fires twice for the same room 
        // (e.g., two recordings complete at the exact same time), BullMQ uses this jobId
        // to prevent creating a duplicate job.
        jobId: roomId,
        
        // Combining files from S3 and running FFmpeg can be flaky, so we want retries
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        
        // Sane bounds so the queue doesn't grow infinitely in Redis over time
        removeOnComplete: {
          age: 3600, // keep for 1 hour
          count: 50, // or keep the last 50
        },
        removeOnFail: {
          age: 24 * 3600, // keep for 24 hours
          count: 200,     // or keep the last 200
        },
      }
    );
    
    console.log(`[Queue] Successfully enqueued combine job for room ${roomId} (Job ID: ${job.id})`);
    return job;
  } catch (error) {
    // We log the error but don't throw it back to the Complete API caller.
    // The recording is successfully marked complete in the DB, so we don't want to fail the response.
    // TODO: In a production system, implement a monitoring/alerting story for truly dropped jobs here.
    console.error(`[Queue Error] Failed to enqueue combine job for room ${roomId}:`, error);
    return null;
  }
}
