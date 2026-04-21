import { createSupabaseBrowserClient } from "./supabase-browser";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function authHeader(): Promise<Record<string, string>> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
    ...(await authHeader()),
  };
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg =
      (body && typeof body === "object" && "message" in body && (body as any).message) ||
      (body && typeof body === "object" && "error" in body && (body as any).error) ||
      `Request failed: ${res.status}`;
    throw new ApiError(res.status, String(msg), body);
  }
  return body as T;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: unknown) {
    super(message);
  }
}

export interface VideoSummary {
  id: string;
  topic: string;
  title: string | null;
  status: string;
  progress: number;
  error: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface VideoDetail extends VideoSummary {
  idea: string | null;
  script: unknown;
  scenes: unknown;
}

export interface CreditsResponse {
  credits: number;
  history: Array<{
    id: string;
    delta: number;
    reason: string;
    video_id: string | null;
    created_at: string;
  }>;
}

export interface CreditPack {
  priceId: string;
  credits: number;
}

export const api = {
  generate(topic: string) {
    return request<{ video_id: string; job_id: string; status: string; credits_remaining: number }>(
      "/api/generate",
      { method: "POST", body: JSON.stringify({ topic }) },
    );
  },
  listVideos() {
    return request<{ videos: VideoSummary[] }>("/api/videos");
  },
  getVideo(id: string) {
    return request<{ video: VideoDetail }>(`/api/videos/${id}`);
  },
  getCredits() {
    return request<CreditsResponse>("/api/credits");
  },
  listPacks() {
    return request<{ packs: CreditPack[] }>("/api/billing/packs");
  },
  checkout(priceId: string) {
    return request<{ url: string }>("/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ price_id: priceId }),
    });
  },
};
