"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, api } from "@/lib/api";

export function GenerateForm() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.generate(topic.trim());
      router.push(`/dashboard/videos/${res.video_id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 402) {
          setError("You're out of credits. Visit the Billing page to top up.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Unexpected error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-2 block text-sm text-slate-300">Topic or niche</span>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          required
          minLength={2}
          maxLength={240}
          rows={3}
          placeholder="e.g. 'Weird facts about octopuses' or 'Beginner AI passive income ideas'"
          className="w-full rounded-xl border border-white/10 bg-slate-950/60 p-3 outline-none focus:border-brand-500"
        />
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy || topic.trim().length < 2}
        className="rounded-xl bg-brand-600 px-5 py-3 font-medium hover:bg-brand-500 disabled:opacity-50"
      >
        {busy ? "Queuing…" : "Generate Video — 1 credit"}
      </button>
    </form>
  );
}
