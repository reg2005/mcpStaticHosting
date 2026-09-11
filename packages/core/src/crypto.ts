import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

/**
 * AES-256-GCM encryption for secrets at rest. The key is derived from APP_SECRET.
 * Output format: base64( iv[12] | authTag[16] | ciphertext ).
 */
function key(secret = process.env.APP_SECRET): Buffer {
  if (!secret) throw new Error("APP_SECRET is not set");
  return scryptSync(secret, "mcphosting-env-vars", 32);
}

export function encryptSecret(plaintext: string, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptSecret(encoded: string, secret?: string): string {
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/**
 * Site-password hashing. Unlike secrets (which must be decryptable for the
 * functions runtime), a site password is only ever verified, so we store a
 * one-way salted scrypt hash. Format: base64( salt[16] | derived[32] ).
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 32);
  return Buffer.concat([salt, derived]).toString("base64");
}

export function verifyPassword(password: string, stored: string): boolean {
  let buf: Buffer;
  try {
    buf = Buffer.from(stored, "base64");
  } catch {
    return false;
  }
  if (buf.length !== 48) return false;
  const salt = buf.subarray(0, 16);
  const expected = buf.subarray(16);
  const derived = scryptSync(password, salt, 32);
  return timingSafeEqual(expected, derived);
}

/**
 * Stateless access token for the site gate. The router sets this as a cookie
 * once a visitor enters the correct password; on later requests it recomputes
 * the token and compares. Because it binds the project id to the *current*
 * password hash, changing or removing the password invalidates old cookies.
 */
export function siteAccessToken(
  projectId: string,
  passwordHash: string,
  secret = process.env.APP_SECRET,
): string {
  if (!secret) throw new Error("APP_SECRET is not set");
  return createHmac("sha256", secret).update(`${projectId}:${passwordHash}`).digest("hex");
}

/** Constant-time comparison of two site access tokens. */
export function safeTokenEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Owner preview bypass. The (authenticated) web service mints this short-lived,
 * signed token and embeds it in the preview iframe's URL; the router validates
 * it and grants gate access on the *preview* host only. Lets a project owner
 * see their own password-protected preview without re-typing the password,
 * while production always stays behind the password.
 *
 * Format: `${expiresAtMs}.${hmac}` where hmac = HMAC(`preview:projectId:exp`).
 */
export function previewBypassToken(
  projectId: string,
  ttlMs = 10 * 60 * 1000,
  secret = process.env.APP_SECRET,
): string {
  if (!secret) throw new Error("APP_SECRET is not set");
  const exp = Date.now() + ttlMs;
  const mac = createHmac("sha256", secret).update(`preview:${projectId}:${exp}`).digest("hex");
  return `${exp}.${mac}`;
}

export function verifyPreviewBypass(
  projectId: string,
  token: string,
  secret = process.env.APP_SECRET,
): boolean {
  if (!secret) throw new Error("APP_SECRET is not set");
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const expStr = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expected = createHmac("sha256", secret).update(`preview:${projectId}:${exp}`).digest("hex");
  return safeTokenEqual(mac, expected);
}
