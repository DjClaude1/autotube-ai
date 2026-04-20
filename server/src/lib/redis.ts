import { Redis, RedisOptions } from "ioredis";
import { env } from "../env.js";

const commonOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
};

export const redis = new Redis(env.REDIS_URL, commonOptions);

export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, commonOptions);
}
