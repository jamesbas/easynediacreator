import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimitsForTests } from "@/lib/security/rate-limit";
import { createSessionToken, verifySessionToken } from "@/lib/security/session";

describe("security utilities", () => {
  beforeEach(resetRateLimitsForTests);
  it("signs sessions and rejects expired or changed tokens", async () => {
    const now = Date.now(); const token = await createSessionToken("argon-hash-secret", now);
    await expect(verifySessionToken(token, "argon-hash-secret", now + 1000)).resolves.toBe(true);
    await expect(verifySessionToken(`${token}x`, "argon-hash-secret", now + 1000)).resolves.toBe(false);
    await expect(verifySessionToken(token, "argon-hash-secret", now + 8 * 24 * 60 * 60 * 1000)).resolves.toBe(false);
  });
  it("limits repeated requests in a fixed window", () => {
    expect(checkRateLimit("client", 2, 1000, 0).allowed).toBe(true);
    expect(checkRateLimit("client", 2, 1000, 1).allowed).toBe(true);
    expect(checkRateLimit("client", 2, 1000, 2).allowed).toBe(false);
    expect(checkRateLimit("client", 2, 1000, 1001).allowed).toBe(true);
  });
});