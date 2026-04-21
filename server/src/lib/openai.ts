import OpenAI from "openai";
import { env } from "../env.js";

export const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  maxRetries: 0, // we handle retries ourselves via withRetry
});
