import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";
import { AppError } from "./errors";

const DEMO_SECRET = "happybirthday-demo-only-secret";

function keyFromEnv(name: string, fallbackAllowed: boolean): Buffer {
  const value = process.env[name];

  if (value) {
    const base64 = Buffer.from(value, "base64");
    if (base64.length === 32) {
      return base64;
    }

    return createHash("sha256").update(value).digest();
  }

  if (!fallbackAllowed || process.env.NODE_ENV === "production") {
    throw new AppError(
      "CONFIGURATION_ERROR",
      `${name} is required for persistent secrets`,
      500,
    );
  }

  return createHash("sha256").update(DEMO_SECRET).digest();
}

export function hasPersistentSecretConfig(): boolean {
  return Boolean(process.env.APP_ENCRYPTION_KEY && process.env.SESSION_TOKEN_PEPPER);
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  const pepper = keyFromEnv("SESSION_TOKEN_PEPPER", true);
  return createHmac("sha256", pepper).update(token).digest("base64url");
}

export function hashRequestValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const pepper = keyFromEnv("SESSION_TOKEN_PEPPER", true);
  return createHmac("sha256", pepper).update(value).digest("base64url");
}

export function encryptSecret(plaintext: string): string {
  const key = keyFromEnv("APP_ENCRYPTION_KEY", true);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptSecret(ciphertext: string): string {
  if (ciphertext.startsWith("placeholder:")) {
    return ciphertext.slice("placeholder:".length);
  }

  const [version, ivValue, tagValue, encryptedValue] = ciphertext.split(":");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new AppError("SECRET_DECRYPT_FAILED", "Voucher secret is not decryptable", 500);
  }

  const key = keyFromEnv("APP_ENCRYPTION_KEY", true);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivValue, "base64url"),
  );

  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
