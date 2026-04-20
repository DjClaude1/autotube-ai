import pino from "pino";
import { env } from "../env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" } }
      : undefined,
  base: { service: "autotube-ai" },
});

export type Logger = typeof logger;
