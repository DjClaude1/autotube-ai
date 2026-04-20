import { z } from "zod";
import { openai } from "../lib/openai.js";
import { env } from "../env.js";
import { withRetry } from "../lib/retry.js";
import type { VideoIdea } from "./idea.js";

const scriptSchema = z.object({
  hook: z.string().min(10),
  body: z.array(z.string().min(1)).min(2).max(20),
  cta: z.string().min(5),
});

export type VideoScript = z.infer<typeof scriptSchema>;

/**
 * Generate a tight short-form script for the given idea. Returns a hook, a
 * body broken into discrete beats (one beat per scene), and a call to action.
 */
export async function generateScript(
  topic: string,
  idea: VideoIdea,
  opts: { targetWords?: number } = {},
): Promise<VideoScript> {
  const targetWords = opts.targetWords ?? 140;

  const resp = await withRetry(
    () =>
      openai.chat.completions.create({
        model: env.OPENAI_MODEL,
        response_format: { type: "json_object" },
        temperature: 0.75,
        messages: [
          {
            role: "system",
            content:
              "You write short-form viral video scripts (YouTube Shorts, TikTok, Reels). Your output must land the hook in under 3 seconds, keep each beat punchy, and end with a clear call to action. Respond ONLY as compact JSON with keys: hook (string), body (array of 4-10 sentence-length beats), cta (string).",
          },
          {
            role: "user",
            content: [
              `Topic: ${topic}`,
              `Title: ${idea.title}`,
              `Hook concept: ${idea.hook}`,
              `Angle: ${idea.angle}`,
              `Target length: ~${targetWords} words total (roughly 45-60 seconds spoken).`,
              "Rules:",
              "- Hook must be a single sentence, max 18 words.",
              "- Each body beat is ONE sentence, 8-20 words, no numbered lists, no stage directions.",
              "- CTA max 20 words, references subscribing or following.",
              "- Do not include emojis, hashtags, or speaker labels.",
            ].join("\n"),
          },
        ],
      }),
    { label: "openai.script" },
  );

  const content = resp.choices[0]?.message?.content ?? "{}";
  return scriptSchema.parse(JSON.parse(content));
}

/**
 * Flatten a script into a single spoken narration string.
 */
export function scriptToNarration(script: VideoScript): string {
  return [script.hook, ...script.body, script.cta]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}
