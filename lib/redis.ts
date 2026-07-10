import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Prevent multiple connections during Next.js Hot Module Replacement (HMR)
const globalForRedis = global as unknown as { redis: Redis };

export const redis =
  globalForRedis.redis ||
  new Redis(redisUrl, {
    // BullMQ requires maxRetriesPerRequest to be null
    maxRetriesPerRequest: null,
    // ioredis automatically enables TLS when the URL scheme is 'rediss://' (e.g., Upstash)
    // and disables it for 'redis://' (e.g., local Docker), so no explicit tls object is needed.
  });

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

// Basic error listener so unhandled errors don't crash the process
redis.on('error', (err) => {
  console.error('[Redis Error]', err);
});
