"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type VideoSummary } from "@/lib/api";

export default function VideosPage() {
  const [videos, setVideos] = useState<VideoSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await api.listVideos();
        if (alive) setVideos(res.videos);
      } catch (err) {
        if (alive) setError((err as Error).message);
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your videos</h1>
          <p className="mt-2 text-slate-400">All generated and in-progress videos.</p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium hover:bg-brand-500"
        >
          New video
        </Link>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {!videos && !error && <p className="text-slate-400">Loading…</p>}
      {videos && videos.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-slate-300">
          No videos yet. Go generate your first one.
        </div>
      )}
      {videos && videos.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <li key={v.id}>
              <Link
                href={`/dashboard/videos/${v.id}`}
                className="group block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-brand-500/50"
              >
                <div className="aspect-[9/16] w-full overflow-hidden bg-slate-900">
                  {v.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.thumbnail_url}
                      alt={v.title ?? v.topic}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-500">
                      {v.status === "failed" ? "Failed" : "Rendering…"}
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="truncate font-semibold">{v.title ?? v.topic}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {v.status} · {new Date(v.created_at).toLocaleString()}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
