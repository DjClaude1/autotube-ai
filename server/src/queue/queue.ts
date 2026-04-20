import { Queue, QueueEvents } from "bullmq";
import { createRedisConnection } from "../lib/redis.js";

export const VIDEO_QUEUE_NAME = "autotube:videos";

export interface VideoJobData {
  videoId: string;
  userId: string;
  topic: string;
}

let _queue: Queue<VideoJobData> | null = null;
let _events: QueueEvents | null = null;

export function getVideoQueue(): Queue<VideoJobData> {
  if (!_queue) {
    _queue = new Queue<VideoJobData>(VIDEO_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: { count: 1000, age: 60 * 60 * 24 * 7 },
        removeOnFail: { count: 1000, age: 60 * 60 * 24 * 30 },
      },
    });
  }
  return _queue;
}

export function getQueueEvents(): QueueEvents {
  if (!_events) {
    _events = new QueueEvents(VIDEO_QUEUE_NAME, { connection: createRedisConnection() });
  }
  return _events;
}
