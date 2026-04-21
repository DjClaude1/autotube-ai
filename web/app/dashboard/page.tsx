import { CreditsBadge } from "@/components/CreditsBadge";
import { GenerateForm } from "@/components/GenerateForm";

export default function DashboardPage() {
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Generate a video</h1>
          <p className="mt-2 text-slate-400">
            Enter a topic. We&apos;ll handle the idea, script, voice, and render.
          </p>
        </div>
        <CreditsBadge />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <GenerateForm />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {steps.map((s, i) => (
          <div
            key={s.title}
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
          >
            <div className="text-sm text-slate-400">Step {i + 1}</div>
            <div className="mt-2 font-semibold">{s.title}</div>
            <p className="mt-2 text-sm text-slate-400">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const steps = [
  { title: "AI idea + script", body: "GPT plans the video and writes a tight, hook-first script." },
  { title: "AI voice", body: "ElevenLabs voices the narration with pro studio delivery." },
  { title: "MP4 render", body: "FFmpeg stitches backgrounds, captions, and audio into a downloadable MP4." },
];
