export const sessionCookieName = "easy_media_session";
const maxAgeSeconds = 7 * 24 * 60 * 60;

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function key(secret: string) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSessionToken(secret: string, now = Date.now()) {
  const timestamp = Math.floor(now / 1000).toString();
  const signature = await crypto.subtle.sign("HMAC", await key(secret), new TextEncoder().encode(timestamp));
  return `${timestamp}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token: string | undefined, secret: string, now = Date.now()) {
  if (!token) return false;
  const [timestamp, signature] = token.split(".");
  const issuedAt = Number(timestamp);
  const current = Math.floor(now / 1000);
  if (!Number.isSafeInteger(issuedAt) || issuedAt > current + 60 || current - issuedAt > maxAgeSeconds || !signature) return false;
  try { return crypto.subtle.verify("HMAC", await key(secret), base64UrlToBytes(signature), new TextEncoder().encode(timestamp)); } catch { return false; }
}

export const sessionMaxAge = maxAgeSeconds;