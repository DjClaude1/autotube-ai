import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireUser } from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";

const router = Router();

router.get("/", requireUser, async (req, res, next) => {
  try {
    const user = req.user!;
    const { data, error } = await supabaseAdmin
      .from("videos")
      .select(
        "id, topic, title, status, progress, error, video_url, thumbnail_url, duration_seconds, created_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new HttpError(500, "db_query_failed", error.message);
    res.json({ videos: data ?? [] });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", requireUser, async (req, res, next) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from("videos")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new HttpError(500, "db_query_failed", error.message);
    if (!data) throw new HttpError(404, "not_found");
    res.json({ video: data });
  } catch (err) {
    next(err);
  }
});

export default router;
