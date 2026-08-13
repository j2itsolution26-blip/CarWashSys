import { describe, expect, it } from "vitest";
import {
  CODE_LENGTH,
  CODE_TTL_MINUTES,
  codeExpiryFrom,
  generateVerificationCode,
  hashVerificationCode,
  isCodeExpired,
  isGmailAddress,
  isWellFormedCode,
  maskEmail,
  normaliseEmail,
  normaliseSubmittedCode,
  verifyCodeHash,
} from "./verification-code";

describe("generateVerificationCode", () => {
  it("always produces exactly 6 digits", () => {
    for (let i = 0; i < 500; i += 1) {
      const code = generateVerificationCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect(/^\d{6}$/.test(code)).toBe(true);
    }
  });

  it("is not a predictable constant", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateVerificationCode()));
    // 200 draws from a 1,000,000 space collapsing to one value would mean the
    // generator is broken.
    expect(codes.size).toBeGreaterThan(150);
    expect(codes.has("123456") && codes.size === 1).toBe(false);
  });

  it("can produce codes with leading zeros", () => {
    // Zero-padding must be preserved — "000123" is a valid code, not 123.
    const padded = Array.from({ length: 3000 }, () => generateVerificationCode()).filter((code) =>
      code.startsWith("0"),
    );
    expect(padded.length).toBeGreaterThan(0);
    expect(padded.every((code) => code.length === 6)).toBe(true);
  });
});

describe("code hashing", () => {
  it("never stores the code in plain text", async () => {
    const code = "042913";
    const hash = await hashVerificationCode(code);
    expect(hash).not.toContain(code);
    expect(hash.startsWith("$2")).toBe(true);
  });

  it("verifies the correct code", async () => {
    const code = generateVerificationCode();
    const hash = await hashVerificationCode(code);
    expect(await verifyCodeHash(code, hash)).toBe(true);
  });

  it("rejects a wrong code", async () => {
    const hash = await hashVerificationCode("111111");
    expect(await verifyCodeHash("111112", hash)).toBe(false);
  });

  it("produces a different hash for the same code each time (salted)", async () => {
    const [a, b] = await Promise.all([
      hashVerificationCode("424242"),
      hashVerificationCode("424242"),
    ]);
    expect(a).not.toBe(b);
  });
});

describe("expiry", () => {
  it("expires the configured number of minutes out", () => {
    const now = new Date("2026-08-13T10:00:00.000Z");
    expect(codeExpiryFrom(now).toISOString()).toBe("2026-08-13T10:10:00.000Z");
    expect(CODE_TTL_MINUTES).toBe(10);
  });

  it("is not expired before the deadline", () => {
    const now = new Date("2026-08-13T10:00:00.000Z");
    const expiry = codeExpiryFrom(now);
    expect(isCodeExpired(expiry, new Date("2026-08-13T10:09:59.000Z"))).toBe(false);
  });

  it("is expired exactly at and after the deadline", () => {
    const now = new Date("2026-08-13T10:00:00.000Z");
    const expiry = codeExpiryFrom(now);
    expect(isCodeExpired(expiry, new Date("2026-08-13T10:10:00.000Z"))).toBe(true);
    expect(isCodeExpired(expiry, new Date("2026-08-13T10:10:01.000Z"))).toBe(true);
  });
});

describe("submitted code handling", () => {
  it("strips spaces and dashes users paste in", () => {
    expect(normaliseSubmittedCode("123 456")).toBe("123456");
    expect(normaliseSubmittedCode("123-456")).toBe("123456");
  });

  it("accepts only 6 digits", () => {
    expect(isWellFormedCode("123456")).toBe(true);
    expect(isWellFormedCode("12345")).toBe(false);
    expect(isWellFormedCode("1234567")).toBe(false);
    expect(isWellFormedCode("12345a")).toBe(false);
    expect(isWellFormedCode("")).toBe(false);
  });
});

describe("isGmailAddress", () => {
  it("accepts real Gmail addresses", () => {
    expect(isGmailAddress("owner@gmail.com")).toBe(true);
    expect(isGmailAddress("first.last+pos@gmail.com")).toBe(true);
    expect(isGmailAddress("cg.carwash99@googlemail.com")).toBe(true);
  });

  it("is case and whitespace insensitive", () => {
    expect(isGmailAddress("  Owner@Gmail.COM  ")).toBe(true);
  });

  it("rejects non-Gmail domains", () => {
    expect(isGmailAddress("owner@cgcarwash.local")).toBe(false);
    expect(isGmailAddress("owner@yahoo.com")).toBe(false);
    expect(isGmailAddress("owner@gmail.co")).toBe(false);
  });

  it("rejects lookalike domains that merely contain gmail.com", () => {
    // The whole point of anchoring the pattern.
    expect(isGmailAddress("owner@gmail.com.attacker.net")).toBe(false);
    expect(isGmailAddress("owner@notgmail.com")).toBe(false);
    expect(isGmailAddress("owner@gmail.com.co")).toBe(false);
  });

  it("rejects malformed addresses", () => {
    expect(isGmailAddress("owner")).toBe(false);
    expect(isGmailAddress("@gmail.com")).toBe(false);
    expect(isGmailAddress("owner..name@gmail.com")).toBe(false);
    expect(isGmailAddress(".owner@gmail.com")).toBe(false);
    expect(isGmailAddress("owner.@gmail.com")).toBe(false);
    expect(isGmailAddress("owner@gmail.com owner2@gmail.com")).toBe(false);
    expect(isGmailAddress(`${"a".repeat(250)}@gmail.com`)).toBe(false);
  });
});

describe("normaliseEmail", () => {
  it("lower-cases and trims so the same mailbox cannot register twice", () => {
    expect(normaliseEmail("  Owner@Gmail.com ")).toBe("owner@gmail.com");
  });
});

describe("maskEmail", () => {
  it("hides the middle of the local part", () => {
    expect(maskEmail("owner@gmail.com")).toBe("o•••r@gmail.com");
  });

  it("leaves very short local parts alone rather than exposing their length", () => {
    expect(maskEmail("ab@gmail.com")).toBe("ab@gmail.com");
  });

  it("caps the number of dots for long addresses", () => {
    const masked = maskEmail("averyveryverylongaddress@gmail.com");
    expect(masked.startsWith("a")).toBe(true);
    expect(masked.endsWith("s@gmail.com")).toBe(true);
    expect((masked.match(/•/g) ?? []).length).toBeLessThanOrEqual(8);
  });
});
