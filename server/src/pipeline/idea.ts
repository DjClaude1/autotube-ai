import { z } from "zod";
import { openai } from "../lib/openai.js";
import { env } from "../env.js";
import { withRetry } from "../lib/retry.js";

const ideaSchema = z.object({
  title: z.string().min(4).max(120),
  hook: z.string().min(4).max(400),
  angle: z.string().min(4).max(400),
  tags: z.array(z.string()).max(15).default([]),
});

export type VideoIdea = z.infer<typeof ideaSchema>;

export async function generateIdea(topic: string): Promise<VideoIdea> {
  const resp = await withRetry(
    () =>
      openai.chat.completions.create({
        model: env.OPENAI_MODEL,
        response_format: { type: "json_object" },
        temperature: 0.8,
        messages: [
          {
            role: "system",
            content:
              "You are a top-tier YouTube Shorts strategist. Given a topic, produce one viral video concept optimized for retention in the first 3 seconds. Respond ONLY as compact JSON with keys: title, hook, angle, tags (array of strings).",
          },
          {
            role: "user",
            content: `Topic / niche: ${topic}\n\nRules:\n- Title <= 80 chars, punchy, curiosity gap.\n- Hook is the first line spoken, max 2 sentences, under 40 words.\n- Angle is a one-sentence explanation of the unique viewpoint.\n- Tags: 5-10 lowercase YouTube tags, no #.`,
          },
        ],
      }),
    { label: "openai.idea" },
  );

  const content = resp.choices[0]?.message?.content ?? "{}";
  const parsed = ideaSchema.parse(JSON.parse(content));
  return parsed;
}
