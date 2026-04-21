"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, type VideoDetail } from "@/lib/api";
import { VideoProgress } from "@/components/VideoProgress";

export default function VideoPage() {
  const params = useParams<{ id: string }>();
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getVideo(params.id)
      .then((r) => alive && setVideo(r.video))
      .catch((err) => alive && setError((err as Error).message));
    return () => {
      alive = false;
    };
  }, [params.id]);

  return (
    <div className="space-y-6">
      <Link href="/dashboard/videos" className="text-sm text-slate-400 hover:text-white">
        ← All videos
      </Link>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {!video && !error && <p className="text-slate-400">Loading…</p>}
      {video && (
        <>
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-400">Topic</p>
            <h1 className="mt-1 text-2xl font-semibold">{video.topic}</h1>
          </div>
          <VideoProgress initial={video} />
        </>
      )}
    </div>
  );
}
