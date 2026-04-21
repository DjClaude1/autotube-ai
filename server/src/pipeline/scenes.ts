import type { VideoScript } from "./script.js";

export interface Scene {
  index: number;
  text: string;
  startSec: number;
  endSec: number;
}

/**
 * Split a script into scenes and assign each scene a time range proportional
 * to its word count. Relies on the total audio duration (obtained by
 * ffprobe-ing the TTS output). The distribution isn't perfectly frame-accurate
 * against the actual voice waveform, but for short-form videos it reads as
 * tightly synced.
 */
export function splitIntoScenes(script: VideoScript, totalDurationSec: number): Scene[] {
  const beats = [script.hook, ...script.body, script.cta]
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const wordsPerBeat = beats.map(countWords);
  const totalWords = wordsPerBeat.reduce((a, b) => a + b, 0) || 1;

  const scenes: Scene[] = [];
  let cursor = 0;
  beats.forEach((text, i) => {
    const rawShare = (wordsPerBeat[i]! / totalWords) * totalDurationSec;
    // Clamp each scene to at least 0.9s so subtitles remain readable.
    const duration = Math.max(0.9, rawShare);
    const startSec = cursor;
    const endSec = Math.min(totalDurationSec, startSec + duration);
    scenes.push({ index: i, text, startSec, endSec });
    cursor = endSec;
  });

  // If we under-ran (due to clamping), stretch the last scene to the end.
  if (scenes.length > 0) {
    scenes[scenes.length - 1]!.endSec = totalDurationSec;
  }
  return scenes;
}

export function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/**
 * Render scenes as an SRT file that FFmpeg's `subtitles` filter can burn in.
 */
export function scenesToSrt(scenes: Scene[]): string {
  return scenes
    .map((scene, i) => {
      return [
        String(i + 1),
        `${formatSrtTime(scene.startSec)} --> ${formatSrtTime(scene.endSec)}`,
        wrapForSubtitles(scene.text),
        "",
      ].join("\n");
    })
    .join("\n");
}

function formatSrtTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(sec, 2)},${pad(ms, 3)}`;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/**
 * Naive word-wrapping so subtitle lines never exceed ~32 chars.
 */
function wrapForSubtitles(text: string, maxLineLen = 32): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (current.length + 1 + word.length <= maxLineLen) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.join("\n");
}
