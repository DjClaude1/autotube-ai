import { env } from "../env.js";
import { withRetry } from "./retry.js";

export interface TTSOptions {
  voiceId?: string;
  model?: string;
  stability?: number;
  similarityBoost?: number;
}

/**
 * Stream MP3 audio from ElevenLabs for the given text. Returns the full binary
 * as a Buffer (scripts are short enough — < 5 minutes — that we don't need
 * streaming to disk here).
 */
export async function synthesizeSpeech(text: string, opts: TTSOptions = {}): Promise<Buffer> {
  const voiceId = opts.voiceId ?? env.ELEVENLABS_VOICE_ID;
  const model = opts.model ?? env.ELEVENLABS_MODEL;

  return withRetry(
    async () => {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": env.ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text,
            model_id: model,
            voice_settings: {
              stability: opts.stability ?? 0.5,
              similarity_boost: opts.similarityBoost ?? 0.75,
            },
          }),
        },
      );

      if (!res.ok) {
        const bodyText = await safeReadText(res);
        const err = new Error(
          `ElevenLabs TTS failed: ${res.status} ${res.statusText}${bodyText ? ` — ${bodyText.slice(0, 300)}` : ""}`,
        ) as Error & { status?: number; headers?: Record<string, string> };
        err.status = res.status;
        err.headers = Object.fromEntries(res.headers.entries());
        throw err;
      }

      const array = new Uint8Array(await res.arrayBuffer());
      return Buffer.from(array);
    },
    { label: "elevenlabs.tts", retries: 4 },
  );
}

async function safeReadText(res: Response): Promise<string | undefined> {
  try {
    return await res.text();
  } catch {
    return undefined;
  }
}
