import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

export class WindowLimiter {
  private entries = new Map<string, { count: number; expires: number }>();
  constructor(private maxKeys = 10000) {}
  allow(key: string, limit: number, windowMs: number, now = Date.now()) {
    let entry = this.entries.get(key);
    if (!entry || entry.expires <= now) {
      if (this.entries.size >= this.maxKeys) {
        for (const [id, value] of this.entries) if (value.expires <= now) this.entries.delete(id);
        if (!this.entries.has(key) && this.entries.size >= this.maxKeys) return false;
      }
      entry = { count: 0, expires: now + windowMs }; this.entries.set(key, entry);
    }
    return ++entry.count <= limit;
  }
}

export function clientIp(req: IncomingMessage) {
  // Only enable this behind the single, trusted Caddy proxy; never trust arbitrary X-Forwarded-For by default.
  const forwarded = process.env.TRUST_PROXY === '1' ? req.headers['x-forwarded-for'] : undefined;
  const candidate = typeof forwarded === 'string' ? forwarded.split(',').at(-1)!.trim() : '';
  return candidate && isIP(candidate) ? candidate : req.socket.remoteAddress ?? 'unknown';
}

export function sameOrigin(req: IncomingMessage) {
  if (!req.headers.origin) return true; // Non-browser clients do not carry ambient browser cookies.
  try { return new URL(req.headers.origin).host === req.headers.host; }
  catch { return false; }
}
