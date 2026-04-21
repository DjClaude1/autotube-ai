import { Worker, type Job } from "bullmq";
import { createRedisConnection } from "./lib/redis.js";
import { logger } from "./lib/logger.js";
import { supabaseAdmin } from "./lib/supabase.js";
import { progressReporterForVideo } from "./db/progress.js";
import { runPipeline } from "./pipeline/pipeline.js";
import { VIDEO_QUEUE_NAME, type VideoJobData } from "./queue/queue.js";

const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? "1"));

const worker = new Worker<VideoJobData>(
  VIDEO_QUEUE_NAME,
  async (job: Job<VideoJobData>) => {
    const { videoId, userId, topic } = job.data;
    const log = logger.child({ videoId, jobId: job.id });
    log.info({ topic }, "processing video job");

    const reporter = progressReporterForVideo(videoId);

    try {
      const out = await runPipeline({
        videoId,
        userId,
        topic,
        jobId: String(job.id),
        report: reporter,
      });
      log.info({ videoUrl: out.videoUrl }, "pipeline completed");
      return out;
    } catch (err) {
      log.error({ err }, "pipeline failed");
      const message = err instanceof Error ? err.message : String(err);

      // If this is the final attempt, mark failed and refund the credit.
      const isFinalAttempt = (job.attemptsMade ?? 0) + 1 >= (job.opts.attempts ?? 1);
      if (isFinalAttempt) {
        await supabaseAdmin
          .from("videos")
          .update({ status: "failed", error: message, progress: 0 })
          .eq("id", videoId);
        const { error: refundErr } = await supabaseAdmin.rpc("refund_credits", {
          p_user_id: userId,
          p_amount: 1,
          p_video_id: videoId,
        });
        if (refundErr) log.error({ refundErr }, "refund failed");
      } else {
        await supabaseAdmin
          .from("videos")
          .update({ status: "queued", error: message })
          .eq("id", videoId);
      }
      throw err;
    }
  },
  {
    connection: createRedisConnection(),
    concurrency: CONCURRENCY,
    // Limit how many rendering jobs start per minute to cooperate with
    // external API rate limits.
    limiter: { max: 30, duration: 60_000 },
  },
);

worker.on("ready", () => logger.info("worker ready"));
worker.on("failed", (job, err) => logger.warn({ jobId: job?.id, err }, "job failed"));
worker.on("completed", (job) => logger.info({ jobId: job.id }, "job completed"));
worker.on("error", (err) => logger.error({ err }, "worker error"));

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    logger.info({ sig }, "worker shutting down");
    await worker.close();
    process.exit(0);
  });
}
