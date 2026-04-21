import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireUser } from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";

const router = Router();

router.get("/", requireUser, async (req, res, next) => {
  try {
    const user = req.user!;
    const [profile, events] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("credits")
        .eq("id", user.id)
        .maybeSingle(),
      supabaseAdmin
        .from("credit_events")
        .select("id, delta, reason, video_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (profile.error) throw new HttpError(500, "db_query_failed", profile.error.message);
    if (events.error) throw new HttpError(500, "db_query_failed", events.error.message);
    res.json({
      credits: profile.data?.credits ?? 0,
      history: events.data ?? [],
    });
  } catch (err) {
    next(err);
  }
});

export default router;
