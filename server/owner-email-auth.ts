import { createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const deriveKey = promisify(scrypt);
const PASSWORD_SALT = "quran-yutla:owner-email-login:v1";
const MAX_FAILURES = 5;
const LOCK_DURATION_MS = 10 * 60 * 1000;
const attempts = new Map<string, { failures: number; blockedUntil: number }>();

export function normalizeOwnerEmail(value: string) {
  return value.trim().toLowerCase();
}

export function localOwnerOpenId(email: string) {
  return `owner-email-${createHash("sha256").update(normalizeOwnerEmail(email)).digest("hex").slice(0, 48)}`;
}

async function passwordDigest(value: string) {
  const derived = await deriveKey(value, PASSWORD_SALT, 64) as ArrayBuffer;
  return Buffer.from(derived);
}

export async function verifyConfiguredOwnerLogin(email: string, password: string) {
  const configuredEmail = normalizeOwnerEmail(process.env.OWNER_LOGIN_EMAIL ?? "");
  const configuredPassword = process.env.OWNER_LOGIN_PASSWORD ?? "";
  if (!configuredEmail || !configuredPassword) return false;
  const emailMatches = normalizeOwnerEmail(email) === configuredEmail;
  const candidateDigest = await passwordDigest(password);
  const configuredDigest = await passwordDigest(configuredPassword);
  return emailMatches && timingSafeEqual(candidateDigest, configuredDigest);
}

export function isOwnerLoginBlocked(email: string) {
  const attempt = attempts.get(normalizeOwnerEmail(email));
  return Boolean(attempt && attempt.blockedUntil > Date.now());
}

export function recordOwnerLoginFailure(email: string) {
  const key = normalizeOwnerEmail(email);
  const current = attempts.get(key);
  const failures = (current?.failures ?? 0) + 1;
  attempts.set(key, { failures, blockedUntil: failures >= MAX_FAILURES ? Date.now() + LOCK_DURATION_MS : 0 });
}

export function clearOwnerLoginFailures(email: string) {
  attempts.delete(normalizeOwnerEmail(email));
}
