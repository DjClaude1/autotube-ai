import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.string().default("info"),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().default("autotube-videos"),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),

  // ElevenLabs
  ELEVENLABS_API_KEY: z.string().min(1),
  ELEVENLABS_VOICE_ID: z.string().default("21m00Tcm4TlvDq8ikWAM"),
  ELEVENLABS_MODEL: z.string().default("eleven_turbo_v2_5"),

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_CREDIT_PACKS: z.string().default(""),

  // URLs
  API_URL: z.string().url().default("http://localhost:4000"),
  WEB_URL: z.string().url().default("http://localhost:3000"),

  // Pricing / credits
  FREE_SIGNUP_CREDITS: z.coerce.number().int().nonnegative().default(2),

  // FFmpeg
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
  RENDER_WIDTH: z.coerce.number().int().positive().default(1080),
  RENDER_HEIGHT: z.coerce.number().int().positive().default(1920),
  RENDER_FPS: z.coerce.number().int().positive().default(30),
  WORK_DIR: z.string().default("./work"),
});

export type Env = z.infer<typeof schema>;

function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration. See logs above.");
  }
  return parsed.data;
}

export const env = loadEnv();

export interface CreditPack {
  priceId: string;
  credits: number;
}

export function parseCreditPacks(raw: string): CreditPack[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [priceId, creditsRaw] = entry.split(":");
      const credits = Number(creditsRaw);
      if (!priceId || !Number.isFinite(credits) || credits <= 0) {
        throw new Error(`Invalid STRIPE_CREDIT_PACKS entry: "${entry}" (expected price_id:credits)`);
      }
      return { priceId, credits };
    });
}
