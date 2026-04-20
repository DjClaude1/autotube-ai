"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type VideoDetail } from "@/lib/api";

const TERMINAL_STATUSES = new Set(["completed", "failed", "canceled"]);

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  generating_idea: "Generating viral idea",
  generating_script: "Writing script",
  generating_voice: "Synthesizing voice",
  splitting_scenes: "Splitting scenes",
  rendering: "Rendering video",
  uploading: "Uploading",
  completed: "Ready",
  failed: "Failed",
  canceled: "Canceled",
};

export function VideoProgress({ initial }: { initial: VideoDetail }) {
  const [video, setVideo] = useState<VideoDetail>(initial);

  useEffect(() => {
    if (TERMINAL_STATUSES.has(video.status)) return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await api.getVideo(video.id);
        if (!stopped) setVideo(res.video);
      } catch {
        // Swallow transient errors; the next tick will retry.
      }
    };
    const id = setInterval(tick, 2500);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [video.id, video.status]);

  const pct = Math.max(0, Math.min(100, video.progress ?? 0));
  const label = STATUS_LABELS[video.status] ?? video.status;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center justify-between text-sm text-slate-300">
          <span>{label}</span>
          <span>{pct}%</span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-2 rounded-full bg-brand-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        {video.error && (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {video.error}
          </p>
        )}
      </div>

      {video.status === "completed" && video.video_url && (
        <VideoPlayerBlock video={video} />
      )}

      <IdeaBlock video={video} />
      <ScriptBlock video={video} />
    </div>
  );
}

function VideoPlayerBlock({ video }: { video: VideoDetail }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{video.title ?? "Your video"}</h2>
        <a
          href={video.video_url!}
          download
          className="rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:bg-white/5"
        >
          Download MP4
        </a>
      </div>
      <div className="mt-4 flex justify-center">
        <video
          controls
          playsInline
          poster={video.thumbnail_url ?? undefined}
          className="max-h-[70vh] w-auto rounded-xl bg-black"
          src={video.video_url!}
        />
      </div>
    </div>
  );
}

function IdeaBlock({ video }: { video: VideoDetail }) {
  if (!video.idea && !video.title) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="text-sm font-semibold text-brand-500">Idea</div>
      {video.title && <h3 className="mt-2 text-lg font-semibold">{video.title}</h3>}
      {video.idea && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{video.idea}</p>}
    </div>
  );
}

function ScriptBlock({ video }: { video: VideoDetail }) {
  const script = useMemo(() => parseScript(video.script), [video.script]);
  if (!script) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="text-sm font-semibold text-brand-500">Script</div>
      <div className="mt-3 space-y-3 text-sm text-slate-200">
        <p>
          <span className="font-semibold text-white">Hook. </span>
          {script.hook}
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          {script.body.map((beat, i) => (
            <li key={i}>{beat}</li>
          ))}
        </ol>
        <p>
          <span className="font-semibold text-white">CTA. </span>
          {script.cta}
        </p>
      </div>
    </div>
  );
}

interface ParsedScript {
  hook: string;
  body: string[];
  cta: string;
}

function parseScript(raw: unknown): ParsedScript | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.hook !== "string" || !Array.isArray(r.body) || typeof r.cta !== "string") {
    return null;
  }
  return {
    hook: r.hook,
    body: r.body.filter((s): s is string => typeof s === "string"),
    cta: r.cta,
  };
}
