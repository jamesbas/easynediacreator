type Entry = { count: number; resetsAt: number };
const globalLimits = globalThis as unknown as { easyMediaLimits?: Map<string, Entry> };
function store() { globalLimits.easyMediaLimits ??= new Map(); return globalLimits.easyMediaLimits; }

export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const current = store().get(key);
  if (!current || current.resetsAt <= now) { store().set(key, { count: 1, resetsAt: now + windowMs }); return { allowed: true, retryAfterSeconds: 0 }; }
  if (current.count >= limit) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetsAt - now) / 1000)) };
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function requestClientKey(request: Request) { return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"; }
export function resetRateLimitsForTests() { store().clear(); }