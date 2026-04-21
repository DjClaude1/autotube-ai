import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../env.js";
import { logger } from "../lib/logger.js";
import type { Scene } from "./scenes.js";
import { scenesToSrt } from "./scenes.js";

export interface RenderInput {
  jobId: string;
  workDir: string;
  audioPath: string;
  scenes: Scene[];
  title: string;
  /**
   * Optional list of background video file paths. If provided, they are cycled
   * scene-by-scene. If omitted, the renderer generates animated gradient
   * backgrounds via the lavfi virtual source.
   */
  backgroundClips?: string[];
}

export interface RenderOutput {
  videoPath: string;
  thumbnailPath: string;
  durationSec: number;
}

/**
 * Run the full rendering pipeline: build a per-scene background clip, overlay
 * burned-in subtitles, concat them, mix the narration audio on top, and emit
 * a thumbnail.
 */
export async function renderVideo(input: RenderInput): Promise<RenderOutput> {
  await mkdir(input.workDir, { recursive: true });

  const srtPath = path.join(input.workDir, "subs.srt");
  await writeFile(srtPath, scenesToSrt(input.scenes), "utf8");

  const concatListPath = path.join(input.workDir, "concat.txt");
  const sceneClipPaths: string[] = [];

  for (const scene of input.scenes) {
    const clipPath = path.join(input.workDir, `scene-${scene.index.toString().padStart(3, "0")}.mp4`);
    await renderSceneClip({
      scene,
      outPath: clipPath,
      backgroundClip: pickBackground(input.backgroundClips, scene.index),
      srtPath,
    });
    sceneClipPaths.push(clipPath);
  }

  await writeFile(
    concatListPath,
    sceneClipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
    "utf8",
  );

  const silentConcatPath = path.join(input.workDir, "silent-concat.mp4");
  await runFfmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-c",
    "copy",
    silentConcatPath,
  ]);

  const finalPath = path.join(input.workDir, "final.mp4");
  await runFfmpeg([
    "-y",
    "-i",
    silentConcatPath,
    "-i",
    input.audioPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    finalPath,
  ]);

  const thumbnailPath = path.join(input.workDir, "thumbnail.jpg");
  await runFfmpeg([
    "-y",
    "-ss",
    "0.2",
    "-i",
    finalPath,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    thumbnailPath,
  ]);

  const durationSec = await probeDuration(finalPath);
  return { videoPath: finalPath, thumbnailPath, durationSec };
}

interface SceneClipInput {
  scene: Scene;
  outPath: string;
  backgroundClip?: string;
  srtPath: string;
}

async function renderSceneClip(input: SceneClipInput): Promise<void> {
  const width = env.RENDER_WIDTH;
  const height = env.RENDER_HEIGHT;
  const fps = env.RENDER_FPS;
  const duration = Math.max(0.1, input.scene.endSec - input.scene.startSec);

  const subtitleFilter = buildSubtitleFilter(input.srtPath, input.scene.index);

  if (input.backgroundClip) {
    // Loop the clip and trim to the scene duration, scale + pad to target
    // canvas, then burn in subtitles.
    await runFfmpeg([
      "-y",
      "-stream_loop",
      "-1",
      "-i",
      input.backgroundClip,
      "-t",
      duration.toFixed(3),
      "-vf",
      `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},${subtitleFilter}`,
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      input.outPath,
    ]);
    return;
  }

  // Animated gradient placeholder: hue shifts over time with a subtle vignette.
  // Colors rotate per scene so the video doesn't feel static.
  const hue = (input.scene.index * 47) % 360;
  const gradient = `color=c=0x141428:s=${width}x${height}:d=${duration.toFixed(3)}:r=${fps}`;
  const vfilter =
    `hue=h=${hue}+10*sin(2*PI*t/6):s=1.1,` +
    `gblur=sigma=8,` +
    `noise=alls=6:allf=t,` +
    subtitleFilter;

  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    gradient,
    "-t",
    duration.toFixed(3),
    "-vf",
    vfilter,
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    input.outPath,
  ]);
}

function pickBackground(clips: string[] | undefined, index: number): string | undefined {
  if (!clips || clips.length === 0) return undefined;
  return clips[index % clips.length];
}

function buildSubtitleFilter(srtPath: string, sceneIndex: number): string {
  // FFmpeg's `subtitles` filter needs escaped paths. `force_style` uses
  // libass syntax (note the outer single quotes on force_style itself).
  const escapedPath = srtPath.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const style =
    "FontName=DejaVu Sans,FontSize=14,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000," +
    "BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=80";
  // `si` picks which subtitle stream; our SRT files only have stream 0.
  return `subtitles='${escapedPath}':si=0:force_style='${style}'${sceneIndex < 0 ? "" : ""}`;
}

async function runFfmpeg(args: string[]): Promise<void> {
  await runBinary(env.FFMPEG_PATH, args);
}

export async function probeDuration(mediaPath: string): Promise<number> {
  const { stdout } = await runBinaryCollecting(env.FFPROBE_PATH, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    mediaPath,
  ]);
  const n = Number(stdout.trim());
  if (!Number.isFinite(n)) throw new Error(`ffprobe returned non-numeric duration: ${stdout}`);
  return n;
}

function runBinary(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      logger.error({ bin, args, code, stderr: stderr.slice(-4000) }, "ffmpeg failed");
      reject(new Error(`${bin} exited with code ${code}`));
    });
  });
}

function runBinaryCollecting(
  bin: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`${bin} exited with code ${code}: ${stderr.slice(-500)}`));
    });
  });
}
