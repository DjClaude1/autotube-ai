import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../env.js";
import { logger } from "../lib/logger.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { synthesizeSpeech } from "../lib/elevenlabs.js";
import { generateIdea } from "./idea.js";
import { generateScript, scriptToNarration, type VideoScript } from "./script.js";
import { splitIntoScenes } from "./scenes.js";
import { probeDuration, renderVideo } from "./ffmpeg.js";
import { uploadRenderedAssets } from "./storage.js";

export type VideoStatus =
  | "queued"
  | "generating_idea"
  | "generating_script"
  | "generating_voice"
  | "splitting_scenes"
  | "rendering"
  | "uploading"
  | "completed"
  | "failed"
  | "canceled";

export interface ProgressReporter {
  update(status: VideoStatus, progress: number, extra?: Record<string, unknown>): Promise<void>;
}

export interface RunPipelineInput {
  videoId: string;
  userId: string;
  topic: string;
  jobId: string;
  report: ProgressReporter;
}

export interface RunPipelineOutput {
  videoUrl: string;
  thumbnailUrl: string;
  durationSec: number;
  title: string;
  script: VideoScript;
}

/**
 * Orchestrates the full idea → script → voice → scenes → render → upload flow.
 * Each step writes progress back to the DB so the frontend can poll a single
 * endpoint for status.
 */
export async function runPipeline(input: RunPipelineInput): Promise<RunPipelineOutput> {
  const workDir = path.resolve(env.WORK_DIR, input.videoId);
  await mkdir(workDir, { recursive: true });
  const log = logger.child({ videoId: input.videoId, userId: input.userId });

  try {
    await input.report.update("generating_idea", 5);
    const idea = await generateIdea(input.topic);
    log.info({ title: idea.title }, "generated idea");
    await persistIdea(input.videoId, idea);

    await input.report.update("generating_script", 20);
    const script = await generateScript(input.topic, idea);
    log.info({ beats: script.body.length }, "generated script");
    await persistScript(input.videoId, script);

    await input.report.update("generating_voice", 35);
    const narration = scriptToNarration(script);
    const audioBuffer = await synthesizeSpeech(narration);
    const audioPath = path.join(workDir, "voice.mp3");
    await writeFile(audioPath, audioBuffer);
    const durationSec = await probeDuration(audioPath);
    log.info({ durationSec }, "synthesized voice");

    await input.report.update("splitting_scenes", 55);
    const scenes = splitIntoScenes(script, durationSec);
    await persistScenes(input.videoId, scenes);

    await input.report.update("rendering", 70);
    const { videoPath, thumbnailPath, durationSec: finalDuration } = await renderVideo({
      jobId: input.jobId,
      workDir,
      audioPath,
      scenes,
      title: idea.title,
    });
    log.info({ durationSec: finalDuration }, "rendered video");

    await input.report.update("uploading", 90);
    const uploaded = await uploadRenderedAssets(
      input.userId,
      input.videoId,
      videoPath,
      thumbnailPath,
    );

    await input.report.update("completed", 100, {
      video_url: uploaded.videoUrl,
      thumbnail_url: uploaded.thumbnailUrl,
      duration_seconds: finalDuration,
    });

    return {
      videoUrl: uploaded.videoUrl,
      thumbnailUrl: uploaded.thumbnailUrl,
      durationSec: finalDuration,
      title: idea.title,
      script,
    };
  } finally {
    // Best-effort cleanup — ignore errors to avoid masking the real failure.
    rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function persistIdea(videoId: string, idea: { title: string; hook: string; angle: string }) {
  const { error } = await supabaseAdmin
    .from("videos")
    .update({ title: idea.title, idea: `${idea.hook}\n\n${idea.angle}` })
    .eq("id", videoId);
  if (error) throw new Error(`persist idea: ${error.message}`);
}

async function persistScript(videoId: string, script: VideoScript) {
  const { error } = await supabaseAdmin
    .from("videos")
    .update({ script })
    .eq("id", videoId);
  if (error) throw new Error(`persist script: ${error.message}`);
}

async function persistScenes(
  videoId: string,
  scenes: Array<{ index: number; text: string; startSec: number; endSec: number }>,
) {
  const { error } = await supabaseAdmin
    .from("videos")
    .update({ scenes })
    .eq("id", videoId);
  if (error) throw new Error(`persist scenes: ${error.message}`);
}
