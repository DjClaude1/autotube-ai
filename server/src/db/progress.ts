import { supabaseAdmin } from "../lib/supabase.js";
import type { ProgressReporter, VideoStatus } from "../pipeline/pipeline.js";

/**
 * Build a ProgressReporter that writes status/progress into the `videos`
 * table. Extra fields are merged on top of the base status update.
 */
export function progressReporterForVideo(videoId: string): ProgressReporter {
  return {
    async update(status: VideoStatus, progress: number, extra?: Record<string, unknown>) {
      const payload: Record<string, unknown> = { status, progress, ...(extra ?? {}) };
      const { error } = await supabaseAdmin.from("videos").update(payload).eq("id", videoId);
      if (error) throw new Error(`progress update: ${error.message}`);
    },
  };
}
