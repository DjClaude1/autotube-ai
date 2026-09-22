# KiddieToon Factory

AutoTube AI is being extended into a production pipeline for an original children's animated series.

Default series: Milo & Momo's Wonder Garden
Audience: ages 4–8
Format: 2–5 minute episodes plus Shorts
Frequency: one episode per day
IP: original characters, stories, art and music only
Editorial gate: every episode must pass QA and human approval before publishing.

Pipeline: Showrunner → Script → Character/Visual → Voice → 2D Animation → Edit → QA → Human Approval → YouTube.

Provider adapters must support text, TTS, visual assets, rendering, storage and publishing without hard-coding one vendor. Missing provider credentials must pause a job rather than fabricate output.

YouTube publishing uses the YouTube Data API OAuth flow. Child-directed episodes must be uploaded with the made-for-kids setting. Google documents videos.insert and the selfDeclaredMadeForKids field; unverified API projects can have uploads restricted to private viewing until the required audit is completed.

Supabase Cron should invoke the orchestration Edge Function daily. The orchestration layer creates the next episode job, advances queued jobs, retries failures and never bypasses human approval.

Editorial rules: original IP only; no existing copyrighted characters; no imitation of living artists; no graphic violence, frightening imagery or adult themes; no deceptive clickbait; maintain recurring character, location, voice and visual consistency.
