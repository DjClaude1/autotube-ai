import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireUser } from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";
import { getVideoQueue } from "../queue/queue.js";
import { logger } from "../lib/logger.js";

const router = Router();

const bodySchema = z.object({
  topic: z.string().min(2).max(240),
});

const CREDIT_COST = 1;

router.post("/", requireUser, async (req, res, next) => {
  try {
    const { topic } = bodySchema.parse(req.body);
    const user = req.user!;

    const { data: videoRow, error: videoErr } = await supabaseAdmin
      .from("videos")
      .insert({
        user_id: user.id,
        topic,
        status: "queued",
        progress: 0,
        credits_charged: CREDIT_COST,
      })
      .select("id")
      .single();
    if (videoErr || !videoRow) throw new HttpError(500, "db_insert_failed", videoErr?.message);

    const videoId = videoRow.id as string;

    // Atomically deduct credits. On failure (insufficient balance), delete
    // the video row we just created and return a 402-like error.
    const { data: spendData, error: spendErr } = await supabaseAdmin.rpc("spend_credits", {
      p_user_id: user.id,
      p_amount: CREDIT_COST,
      p_video_id: videoId,
    });
    if (spendErr) {
      await supabaseAdmin.from("videos").delete().eq("id", videoId);
      if (spendErr.message?.includes("insufficient_credits")) {
        throw new HttpError(402, "insufficient_credits", "You don't have enough credits.");
      }
      throw new HttpError(500, "spend_failed", spendErr.message);
    }

    const queue = getVideoQueue();
    const job = await queue.add(
      "render-video",
      { videoId, userId: user.id, topic },
      { jobId: videoId },
    );

    await supabaseAdmin.from("videos").update({ job_id: job.id ?? videoId }).eq("id", videoId);

    logger.info({ videoId, userId: user.id }, "enqueued video generation");

    res.status(202).json({
      video_id: videoId,
      job_id: job.id,
      status: "queued",
      credits_remaining: spendData,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
