import Link from "next/link";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.25),_transparent_60%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-16">
        <nav className="flex items-center justify-between">
          <div className="text-lg font-semibold tracking-tight">
            <span className="text-brand-500">Auto</span>Tube AI
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/login" className="rounded-lg px-3 py-1.5 hover:bg-white/5">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-500"
            >
              Get started
            </Link>
          </div>
        </nav>

        <section className="mt-24 max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-wider text-brand-500">
            AI video automation
          </p>
          <h1 className="mt-4 text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
            Turn any topic into a ready-to-post YouTube video.
          </h1>
          <p className="mt-6 text-lg text-slate-300">
            AutoTube AI writes the hook, script, and CTA, voices it with a realistic AI narrator,
            syncs burned-in subtitles to every beat, and renders a vertical-first MP4 you can
            download in one click.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="rounded-xl bg-brand-600 px-5 py-3 font-medium hover:bg-brand-500"
            >
              Generate your first video
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-white/10 px-5 py-3 font-medium hover:bg-white/5"
            >
              I already have an account
            </Link>
          </div>
        </section>

        <section className="mt-24 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur"
            >
              <div className="text-sm font-semibold text-brand-500">{f.tag}</div>
              <div className="mt-3 text-lg font-semibold">{f.title}</div>
              <p className="mt-2 text-sm text-slate-400">{f.body}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

const features = [
  {
    tag: "Step 1",
    title: "Viral idea + title",
    body: "GPT generates a hook-first concept engineered to keep viewers watching past the first 3 seconds.",
  },
  {
    tag: "Step 2",
    title: "Full script + narration",
    body: "ElevenLabs voices the hook, body, and CTA with studio-grade delivery. No mic required.",
  },
  {
    tag: "Step 3",
    title: "Rendered MP4 with subs",
    body: "FFmpeg stitches backgrounds, burns in synced captions, and outputs a downloadable 1080x1920 MP4.",
  },
];
