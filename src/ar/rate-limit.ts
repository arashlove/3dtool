export type LimitResult = { ok: true; remaining: number } | { ok: false; retryAfterSec: number };

/**
 * In-memory fixed-window counter. The app runs as a single container, so process memory is
 * enough; a restart resets the counts.
 */
export class FixedWindowLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string): LimitResult {
    const t = this.now();
    let window = this.windows.get(key);
    if (!window || window.resetAt <= t) {
      window = { count: 0, resetAt: t + this.windowMs };
      this.windows.set(key, window);
    }
    if (window.count >= this.limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((window.resetAt - t) / 1000)) };
    window.count++;
    if (this.windows.size > 10_000) this.prune(t);
    return { ok: true, remaining: this.limit - window.count };
  }

  private prune(t: number) {
    for (const [key, window] of this.windows) if (window.resetAt <= t) this.windows.delete(key);
  }
}
