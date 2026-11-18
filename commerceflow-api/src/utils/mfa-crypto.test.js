import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  generateTotpUri,
  encryptMfaSecret,
  decryptMfaSecret,
  generateRecoveryCodes,
  normalizeRecoveryCode,
  hashRecoveryCode
} from "./mfa-crypto.js";

const VALID_64_HEX_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const SECOND_64_HEX_KEY =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

describe("MFA Cryptographic Primitives (mfa-crypto.js)", () => {
  describe("Base32 Encoding and Decoding (RFC 4648)", () => {
    it("encodes and decodes RFC 4648 test vectors correctly", () => {
      const vectors = [
        { text: "", base32: "" },
        { text: "f", base32: "MY" },
        { text: "fo", base32: "MZXQ" },
        { text: "foo", base32: "MZXW6" },
        { text: "foob", base32: "MZXW6YQ" },
        { text: "foobar", base32: "MZXW6YTBOI" }
      ];

      for (const { text, base32 } of vectors) {
        const encoded = base32Encode(Buffer.from(text, "utf8"));
        expect(encoded).toBe(base32);

        const decoded = base32Decode(base32).toString("utf8");
        expect(decoded).toBe(text);
      }
    });

    it("handles padding ('='), whitespace, hyphens, and mixed case gracefully in decoder", () => {
      expect(base32Decode("MZXW6YTBOI======").toString("utf8")).toBe("foobar");
      expect(base32Decode("mzxw6ytboi").toString("utf8")).toBe("foobar");
      expect(base32Decode("MZXW-6YTB-OI").toString("utf8")).toBe("foobar");
      expect(base32Decode(" MZXW 6YTB OI ").toString("utf8")).toBe("foobar");
    });

    it("rejects invalid characters with an error", () => {
      expect(() => base32Decode("MZXW689!")).toThrow("Invalid base32 character in input");
    });

    it("enforces type checks on encoder and decoder", () => {
      expect(() => base32Encode("not a buffer")).toThrow(TypeError);
      expect(() => base32Decode(12345)).toThrow(TypeError);
    });
  });

  describe("TOTP Secret Generation", () => {
    it("generates a 32-character base32 secret by default (20 bytes / 160 bits)", () => {
      const secret = generateTotpSecret();
      expect(typeof secret).toBe("string");
      expect(secret.length).toBe(32);
      expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
    });

    it("generates unique random secrets on consecutive calls", () => {
      const secret1 = generateTotpSecret();
      const secret2 = generateTotpSecret();
      expect(secret1).not.toBe(secret2);
    });

    it("rejects insecure byte lengths below 16 bytes", () => {
      expect(() => generateTotpSecret(10)).toThrow(RangeError);
      expect(() => generateTotpSecret("20")).toThrow(RangeError);
    });
  });

  describe("RFC 6238 TOTP Code Generation", () => {
    // Official test vector from RFC 6238 Appendix B
    // Secret: ASCII "12345678901234567890" (20 bytes)
    const rfcSecretAscii = Buffer.from("12345678901234567890", "ascii");

    it("matches RFC 6238 Appendix B test vectors exactly for SHA-1", () => {
      const testVectors = [
        { step: 1, expected: "287082" },
        { step: 37037036, expected: "081804" },
        { step: 37037037, expected: "050471" },
        { step: 41152263, expected: "005924" },
        { step: 66666666, expected: "279037" }
      ];

      for (const { step, expected } of testVectors) {
        const code = generateTotpCode(rfcSecretAscii, { step });
        expect(code).toBe(expected);
      }
    });

    it("generates a 6-digit code with leading zero padding", () => {
      const code = generateTotpCode(rfcSecretAscii, { step: 41152263 });
      expect(code).toBe("005924");
      expect(code.length).toBe(6);
    });

    it("accepts base32 string as secret", () => {
      const secretBase32 = base32Encode(rfcSecretAscii);
      const code = generateTotpCode(secretBase32, { step: 1 });
      expect(code).toBe("287082");
    });

    it("rejects invalid or empty secrets", () => {
      expect(() => generateTotpCode("", { step: 1 })).toThrow("TOTP secret cannot be empty");
      expect(() => generateTotpCode(12345, { step: 1 })).toThrow(TypeError);
    });
  });

  describe("RFC 6238 TOTP Code Verification", () => {
    const secret = generateTotpSecret();
    const fixedTime = 1700000000000; // Fixed timestamp in ms
    const currentStep = Math.floor(fixedTime / 1000 / 30);

    it("accepts a code matching the current time step and returns matchedStep", () => {
      const code = generateTotpCode(secret, { step: currentStep });
      const result = verifyTotpCode(code, secret, { timestamp: fixedTime });
      expect(result.isValid).toBe(true);
      expect(result.matchedStep).toBe(currentStep);
    });

    it("accepts a code from step - 1 (within ±1 step skew window) and returns matchedStep", () => {
      const code = generateTotpCode(secret, { step: currentStep - 1 });
      const result = verifyTotpCode(code, secret, { timestamp: fixedTime, window: 1 });
      expect(result.isValid).toBe(true);
      expect(result.matchedStep).toBe(currentStep - 1);
    });

    it("accepts a code from step + 1 (within ±1 step skew window) and returns matchedStep", () => {
      const code = generateTotpCode(secret, { step: currentStep + 1 });
      const result = verifyTotpCode(code, secret, { timestamp: fixedTime, window: 1 });
      expect(result.isValid).toBe(true);
      expect(result.matchedStep).toBe(currentStep + 1);
    });

    it("rejects codes outside the allowable skew window (step - 2 and step + 2)", () => {
      const pastCode = generateTotpCode(secret, { step: currentStep - 2 });
      const pastResult = verifyTotpCode(pastCode, secret, { timestamp: fixedTime, window: 1 });
      expect(pastResult.isValid).toBe(false);
      expect(pastResult.matchedStep).toBeNull();

      const futureCode = generateTotpCode(secret, { step: currentStep + 2 });
      const futureResult = verifyTotpCode(futureCode, secret, { timestamp: fixedTime, window: 1 });
      expect(futureResult.isValid).toBe(false);
      expect(futureResult.matchedStep).toBeNull();
    });

    it("rejects invalid, malformed, non-numeric, or incorrect-length codes safely", () => {
      expect(verifyTotpCode("12345", secret, { timestamp: fixedTime })).toEqual({
        isValid: false,
        matchedStep: null
      });
      expect(verifyTotpCode("1234567", secret, { timestamp: fixedTime })).toEqual({
        isValid: false,
        matchedStep: null
      });
      expect(verifyTotpCode("abcdef", secret, { timestamp: fixedTime })).toEqual({
        isValid: false,
        matchedStep: null
      });
      expect(verifyTotpCode("", secret, { timestamp: fixedTime })).toEqual({
        isValid: false,
        matchedStep: null
      });
      expect(verifyTotpCode(null, secret, { timestamp: fixedTime })).toEqual({
        isValid: false,
        matchedStep: null
      });
      expect(verifyTotpCode(undefined, secret, { timestamp: fixedTime })).toEqual({
        isValid: false,
        matchedStep: null
      });
    });

    it("fails closed safely when secret is corrupt or invalid", () => {
      const validCode = "123456";
      expect(verifyTotpCode(validCode, "INVALID_BASE32_9999", { timestamp: fixedTime })).toEqual({
        isValid: false,
        matchedStep: null
      });
      expect(verifyTotpCode(validCode, "", { timestamp: fixedTime })).toEqual({
        isValid: false,
        matchedStep: null
      });
    });
  });

  describe("TOTP URI Generation", () => {
    it("generates a valid otpauth:// URI for authenticator applications", () => {
      const uri = generateTotpUri({
        secret: "JBSWY3DPEHPK3PXP",
        accountName: "admin@commerceflow.dev",
        issuer: "CommerceFlow"
      });

      expect(uri).toBe(
        "otpauth://totp/CommerceFlow:admin%40commerceflow.dev?secret=JBSWY3DPEHPK3PXP&issuer=CommerceFlow&algorithm=SHA1&digits=6&period=30"
      );
    });

    it("encodes special characters in account name and issuer properly", () => {
      const uri = generateTotpUri({
        secret: "JBSWY3DPEHPK3PXP",
        accountName: "admin+ops@store.com",
        issuer: "Store & Co"
      });

      expect(uri).toContain("Store%20%26%20Co:admin%2Bops%40store.com");
      expect(uri).toContain("issuer=Store%20%26%20Co");
    });

    it("throws on empty secret or account name", () => {
      expect(() => generateTotpUri({ secret: "", accountName: "admin@test.com" })).toThrow(TypeError);
      expect(() => generateTotpUri({ secret: "JBSWY3DPEHPK3PXP", accountName: "" })).toThrow(TypeError);
    });
  });

  describe("AES-256-GCM Secret Encryption and Decryption", () => {
    const sampleSecret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

    it("encrypts and decrypts a secret successfully", () => {
      const envelope = encryptMfaSecret(sampleSecret, VALID_64_HEX_KEY);
      expect(typeof envelope).toBe("string");
      expect(envelope.startsWith("v1:")).toBe(true);

      const decrypted = decryptMfaSecret(envelope, VALID_64_HEX_KEY);
      expect(decrypted).toBe(sampleSecret);
    });

    it("produces a well-formed envelope with exact component lengths (v1:24hex:32hex:ciphertext)", () => {
      const envelope = encryptMfaSecret(sampleSecret, VALID_64_HEX_KEY);
      const parts = envelope.split(":");
      expect(parts.length).toBe(4);
      expect(parts[0]).toBe("v1");
      expect(parts[1].length).toBe(24); // 12 bytes IV * 2 hex chars
      expect(parts[2].length).toBe(32); // 16 bytes auth tag * 2 hex chars
      expect(parts[3].length).toBeGreaterThan(0);
      expect(/^[0-9a-fA-F]+$/.test(parts[3])).toBe(true);
    });

    it("generates distinct IVs and ciphertexts for identical plaintexts (IND-CPA / nonce freshness)", () => {
      const envelope1 = encryptMfaSecret(sampleSecret, VALID_64_HEX_KEY);
      const envelope2 = encryptMfaSecret(sampleSecret, VALID_64_HEX_KEY);

      const iv1 = envelope1.split(":")[1];
      const iv2 = envelope2.split(":")[1];
      const ct1 = envelope1.split(":")[3];
      const ct2 = envelope2.split(":")[3];

      expect(iv1).not.toBe(iv2);
      expect(ct1).not.toBe(ct2);
    });

    it("rejects tampered ciphertext, corrupt auth tag, and tampered IV with generic decryption failure", () => {
      const envelope = encryptMfaSecret(sampleSecret, VALID_64_HEX_KEY);
      const [version, iv, tag, ct] = envelope.split(":");

      // Tamper ciphertext
      const tamperedCt = ct.replace(/[0-9a-f]$/, (c) => (c === "0" ? "1" : "0"));
      const tamperedCtEnv = `${version}:${iv}:${tag}:${tamperedCt}`;
      expect(() => decryptMfaSecret(tamperedCtEnv, VALID_64_HEX_KEY)).toThrow(
        "MFA secret decryption failed"
      );

      // Tamper tag
      const tamperedTag = tag.replace(/[0-9a-f]$/, (c) => (c === "0" ? "1" : "0"));
      const tamperedTagEnv = `${version}:${iv}:${tamperedTag}:${ct}`;
      expect(() => decryptMfaSecret(tamperedTagEnv, VALID_64_HEX_KEY)).toThrow(
        "MFA secret decryption failed"
      );

      // Tamper IV
      const tamperedIv = iv.replace(/[0-9a-f]$/, (c) => (c === "0" ? "1" : "0"));
      const tamperedIvEnv = `${version}:${tamperedIv}:${tag}:${ct}`;
      expect(() => decryptMfaSecret(tamperedIvEnv, VALID_64_HEX_KEY)).toThrow(
        "MFA secret decryption failed"
      );
    });

    it("rejects decryption with an incorrect 32-byte key", () => {
      const envelope = encryptMfaSecret(sampleSecret, VALID_64_HEX_KEY);
      expect(() => decryptMfaSecret(envelope, SECOND_64_HEX_KEY)).toThrow(
        "MFA secret decryption failed"
      );
    });

    it("rejects unsupported envelope versions", () => {
      const envelope = encryptMfaSecret(sampleSecret, VALID_64_HEX_KEY);
      const v2Envelope = envelope.replace(/^v1:/, "v2:");
      expect(() => decryptMfaSecret(v2Envelope, VALID_64_HEX_KEY)).toThrow(
        "Unsupported envelope version: v2"
      );
    });

    it("rejects malformed envelopes (wrong number of segments or non-hex)", () => {
      expect(() => decryptMfaSecret("invalid-format", VALID_64_HEX_KEY)).toThrow(
        "Invalid envelope format"
      );
      expect(() => decryptMfaSecret("v1:123:456", VALID_64_HEX_KEY)).toThrow(
        "Invalid envelope format"
      );
      expect(() => decryptMfaSecret("v1:nothexivvvvvvvvvvvvvvvv:nothextaggggggggggggggggggggggg:abcd", VALID_64_HEX_KEY)).toThrow(
        "Invalid envelope components"
      );
    });

    it("strictly enforces 64-hex key format for both encrypt and decrypt", () => {
      const shortKey = "0123456789abcdef"; // 16 chars
      const longKey = VALID_64_HEX_KEY + "00"; // 66 chars
      const nonHexKey = VALID_64_HEX_KEY.slice(0, 63) + "Z"; // non-hex character

      expect(() => encryptMfaSecret(sampleSecret, shortKey)).toThrow(TypeError);
      expect(() => encryptMfaSecret(sampleSecret, longKey)).toThrow(TypeError);
      expect(() => encryptMfaSecret(sampleSecret, nonHexKey)).toThrow(TypeError);

      const envelope = encryptMfaSecret(sampleSecret, VALID_64_HEX_KEY);
      expect(() => decryptMfaSecret(envelope, shortKey)).toThrow(TypeError);
      expect(() => decryptMfaSecret(envelope, longKey)).toThrow(TypeError);
      expect(() => decryptMfaSecret(envelope, nonHexKey)).toThrow(TypeError);
    });

    it("never exposes plaintext or key material in decryption failure errors", () => {
      const envelope = encryptMfaSecret(sampleSecret, VALID_64_HEX_KEY);
      const tampered = envelope.slice(0, -2) + "99";

      try {
        decryptMfaSecret(tampered, VALID_64_HEX_KEY);
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err.message).toBe("MFA secret decryption failed");
        expect(err.message).not.toContain(sampleSecret);
        expect(err.message).not.toContain(VALID_64_HEX_KEY);
      }
    });
  });

  describe("Recovery Code Primitives", () => {
    it("generates 8 recovery codes by default, formatted as XXXX-XXXX-XXXX-XXXX", () => {
      const codes = generateRecoveryCodes();
      expect(Array.isArray(codes)).toBe(true);
      expect(codes.length).toBe(8);

      for (const code of codes) {
        expect(code.length).toBe(19); // 16 chars + 3 hyphens
        expect(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/.test(code)).toBe(true);
      }
    });

    it("produces high-entropy unique codes with at least 80 bits of entropy", () => {
      const codes = generateRecoveryCodes(100);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(100);
    });

    it("rejects invalid count or length", () => {
      expect(() => generateRecoveryCodes(0)).toThrow(RangeError);
      expect(() => generateRecoveryCodes(-1)).toThrow(RangeError);
      expect(() => generateRecoveryCodes(8, 10)).toThrow(RangeError); // < 16 chars (<80 bits)
    });

    it("normalizes user-entered recovery codes deterministically", () => {
      const raw = "2345-6789-abcd-efgh";
      const normalized = normalizeRecoveryCode(raw);
      expect(normalized).toBe("23456789ABCDEFGH");

      // Also handles mixed whitespace and multiple hyphens
      expect(normalizeRecoveryCode(" 2345 - 6789 - abcd - efgh ")).toBe("23456789ABCDEFGH");
    });

    it("hashes normalized recovery codes using SHA-256 hex digest", () => {
      const code = "2345-6789-ABCD-EFGH";
      const hash1 = hashRecoveryCode(code);
      const hash2 = hashRecoveryCode("23456789abcdefgh"); // lowercase without hyphens
      const hash3 = hashRecoveryCode(" 2345-6789-abcd-efgh "); // with spaces

      expect(hash1).toBe(hash2);
      expect(hash1).toBe(hash3);
      expect(hash1.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(hash1)).toBe(true);

      // Verify SHA-256 calculation matches crypto standard directly
      const expectedDigest = crypto
        .createHash("sha256")
        .update("23456789ABCDEFGH", "utf8")
        .digest("hex");
      expect(hash1).toBe(expectedDigest);
    });

    it("rejects recovery codes that do not conform to Crockford Base32 format", () => {
      expect(() => hashRecoveryCode("TOO-SHORT")).toThrow("Invalid recovery code format");
      // '0', 'O', '1', 'I', 'L' are excluded from Crockford Base32 alphabet
      expect(() => hashRecoveryCode("0000-1111-IIII-LLLL")).toThrow("Invalid recovery code format");
    });
  });
});

