import { afterEach, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  generateSessionToken,
  hashSessionToken,
} from "@/lib/birthday/crypto";

const originalEncryptionKey = process.env.APP_ENCRYPTION_KEY;
const originalPepper = process.env.SESSION_TOKEN_PEPPER;

afterEach(() => {
  process.env.APP_ENCRYPTION_KEY = originalEncryptionKey;
  process.env.SESSION_TOKEN_PEPPER = originalPepper;
});

describe("voucher cryptography", () => {
  it("encrypts voucher plaintext with authenticated encryption", () => {
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

    const ciphertext = encryptSecret("AUGUST-COFFEE-2026");

    expect(ciphertext).toMatch(/^v1:/);
    expect(ciphertext).not.toContain("AUGUST-COFFEE-2026");
    expect(decryptSecret(ciphertext)).toBe("AUGUST-COFFEE-2026");
  });

  it("creates unguessable tokens and stable keyed hashes", () => {
    process.env.SESSION_TOKEN_PEPPER = Buffer.alloc(32, 11).toString("base64");

    const token = generateSessionToken();

    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toContain(token);
  });
});
