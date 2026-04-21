import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../env.js";
import { supabaseAdmin } from "../lib/supabase.js";

export interface UploadResult {
  videoUrl: string;
  thumbnailUrl: string;
}

/**
 * Upload the rendered video and thumbnail to Supabase Storage (public bucket).
 * Returns the public URLs for both assets.
 */
export async function uploadRenderedAssets(
  userId: string,
  videoId: string,
  videoPath: string,
  thumbnailPath: string,
): Promise<UploadResult> {
  const bucket = env.SUPABASE_STORAGE_BUCKET;
  const baseKey = `${userId}/${videoId}`;

  const videoBytes = await readFile(videoPath);
  const thumbBytes = await readFile(thumbnailPath);

  const videoKey = `${baseKey}/${path.basename(videoPath)}`;
  const thumbKey = `${baseKey}/${path.basename(thumbnailPath)}`;

  const videoUpload = await supabaseAdmin.storage.from(bucket).upload(videoKey, videoBytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
  });
  if (videoUpload.error) throw new Error(`upload video: ${videoUpload.error.message}`);

  const thumbUpload = await supabaseAdmin.storage.from(bucket).upload(thumbKey, thumbBytes, {
    contentType: "image/jpeg",
    upsert: true,
    cacheControl: "3600",
  });
  if (thumbUpload.error) throw new Error(`upload thumbnail: ${thumbUpload.error.message}`);

  const { data: videoUrlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(videoKey);
  const { data: thumbUrlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(thumbKey);

  return {
    videoUrl: videoUrlData.publicUrl,
    thumbnailUrl: thumbUrlData.publicUrl,
  };
}
