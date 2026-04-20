import { logger } from "./logger.js";

export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  factor?: number;
  label?: string;
  isRetryable?: (err: unknown) => boolean;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential-backoff retry with jitter. Honors 429 `Retry-After` headers when
 * the error exposes `status` + `headers` (OpenAI / ElevenLabs SDK errors do).
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const {
    retries = 4,
    baseMs = 500,
    maxMs = 15_000,
    factor = 2,
    label = "op",
    isRetryable = defaultIsRetryable,
  } = opts;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > retries || !isRetryable(err)) throw err;
      const retryAfterMs = extractRetryAfterMs(err);
      const backoff = Math.min(maxMs, baseMs * Math.pow(factor, attempt - 1));
      const jitter = Math.floor(Math.random() * (backoff / 2));
      const delay = Math.max(retryAfterMs ?? 0, backoff + jitter);
      logger.warn(
        { label, attempt, retries, delay, err: errSummary(err) },
        "retrying after error",
      );
      await sleep(delay);
    }
  }
}

function defaultIsRetryable(err: unknown): boolean {
  const status = extractStatus(err);
  if (status == null) return true; // network / unknown -> retry
  if (status === 408 || status === 425 || status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

function extractStatus(err: unknown): number | undefined {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.status === "number") return e.status;
    if (typeof e.statusCode === "number") return e.statusCode;
    if (e.response && typeof e.response === "object") {
      const r = e.response as Record<string, unknown>;
      if (typeof r.status === "number") return r.status;
    }
  }
  return undefined;
}

function extractRetryAfterMs(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as Record<string, unknown>;
  const headers =
    (e.headers as Record<string, string> | undefined) ||
    ((e.response as Record<string, unknown> | undefined)?.headers as
      | Record<string, string>
      | undefined);
  if (!headers) return undefined;
  const raw = headers["retry-after"] ?? headers["Retry-After"];
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return secs * 1000;
  const when = Date.parse(raw);
  if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  return undefined;
}

function errSummary(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
