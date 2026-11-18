import crypto from "crypto";

/**
 * Standard RFC 4648 Base32 alphabet (used by Google Authenticator, Authy, etc.)
 */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BASE32_LOOKUP = Object.create(null);
for (let i = 0; i < BASE32_ALPHABET.length; i++) {
  BASE32_LOOKUP[BASE32_ALPHABET[i]] = i;
}

/**
 * Crockford Base32 alphabet for high-entropy human-readable recovery codes.
 * Excludes ambiguous characters (0, O, 1, I, L) to avoid transcription errors.
 * 32 characters = exactly 5 bits of entropy per character.
 * 256 / 32 = 8 exactly, providing zero-bias modulo selection from random bytes.
 */
const CROCKFORD_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const KEY_HEX_REGEX = /^[0-9a-fA-F]{64}$/;
const ENVELOPE_VERSION = "v1";

/**
 * Encode a Buffer into an unpadded RFC 4648 Base32 string.
 *
 * @param {Buffer} buffer
 * @returns {string} Base32 encoded string
 */
export function base32Encode(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError("Input must be a Buffer");
  }
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Decode an RFC 4648 Base32 string into a Buffer.
 * Safely ignores padding ('=') and whitespace/hyphens.
 *
 * @param {string} str
 * @returns {Buffer}
 */
export function base32Decode(str) {
  if (typeof str !== "string") {
    throw new TypeError("Input must be a string");
  }
  const cleaned = str.replace(/[\s=-]+/g, "").toUpperCase();
  if (cleaned.length === 0) {
    return Buffer.alloc(0);
  }
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (let i = 0; i < cleaned.length; i++) {
    const val = BASE32_LOOKUP[cleaned[i]];
    if (val === undefined) {
      throw new Error("Invalid base32 character in input");
    }
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Generate a cryptographically secure TOTP secret.
 * Default length is 20 bytes (160 bits), matching RFC 4226 recommendation.
 *
 * @param {number} [byteLength=20]
 * @returns {string} Base32-encoded TOTP secret
 */
export function generateTotpSecret(byteLength = 20) {
  if (typeof byteLength !== "number" || byteLength < 16) {
    throw new RangeError("TOTP secret byteLength must be at least 16 bytes (128 bits)");
  }
  const randomBytes = crypto.randomBytes(byteLength);
  return base32Encode(randomBytes);
}

/**
 * Generate an RFC 6238 TOTP code for a secret and counter/time.
 *
 * @param {string|Buffer} secret - Base32 string or raw Buffer
 * @param {object} [options]
 * @param {number} [options.stepSeconds=30] - Time-step duration in seconds
 * @param {number} [options.timestamp=Date.now()] - Timestamp in milliseconds
 * @param {number} [options.step] - Explicit step index (overrides timestamp)
 * @param {number} [options.digits=6] - Code length (default 6)
 * @param {string} [options.algorithm="sha1"] - Hash algorithm ("sha1", "sha256", "sha512")
 * @returns {string} Padded numeric OTP string
 */
export function generateTotpCode(secret, options = {}) {
  const stepSeconds = options.stepSeconds ?? 30;
  const digits = options.digits ?? 6;
  const algorithm = options.algorithm ?? "sha1";

  let step;
  if (typeof options.step === "number") {
    step = options.step;
  } else {
    const timestampMs = options.timestamp ?? Date.now();
    step = Math.floor(timestampMs / 1000 / stepSeconds);
  }

  let keyBuffer;
  if (Buffer.isBuffer(secret)) {
    keyBuffer = secret;
  } else if (typeof secret === "string") {
    keyBuffer = base32Decode(secret);
  } else {
    throw new TypeError("TOTP secret must be a base32 string or Buffer");
  }

  if (keyBuffer.length === 0) {
    throw new Error("TOTP secret cannot be empty");
  }

  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(step));

  const hmac = crypto.createHmac(algorithm, keyBuffer).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % (10 ** digits);
  return otp.toString().padStart(digits, "0");
}

/**
 * Verify an RFC 6238 TOTP code with time-step tolerance.
 * Returns the matched step index for replay protection by caller.
 *
 * NOTE: This utility alone does NOT prevent token replay.
 * Replay prevention requires recording the matched step index in the database
 * atomically (e.g. `lastTotpStep: { $lt: matchedStep }`).
 *
 * @param {string} token - The user-supplied code (e.g. "123456")
 * @param {string|Buffer} secret - Base32 string or raw Buffer
 * @param {object} [options]
 * @param {number} [options.stepSeconds=30]
 * @param {number} [options.timestamp=Date.now()]
 * @param {number} [options.window=1] - Maximum allowable step divergence (default ±1 step)
 * @param {number} [options.digits=6]
 * @param {string} [options.algorithm="sha1"]
 * @returns {{ isValid: boolean, matchedStep: number|null }}
 */
export function verifyTotpCode(token, secret, options = {}) {
  const digits = options.digits ?? 6;
  const window = options.window ?? 1;
  const stepSeconds = options.stepSeconds ?? 30;

  if (typeof token !== "string") {
    return { isValid: false, matchedStep: null };
  }

  const trimmedToken = token.trim();
  const digitRegex = new RegExp(`^\\d{${digits}}$`);
  if (!digitRegex.test(trimmedToken)) {
    return { isValid: false, matchedStep: null };
  }

  let keyBuffer;
  try {
    if (Buffer.isBuffer(secret)) {
      keyBuffer = secret;
    } else if (typeof secret === "string") {
      keyBuffer = base32Decode(secret);
    } else {
      return { isValid: false, matchedStep: null };
    }
    if (keyBuffer.length === 0) {
      return { isValid: false, matchedStep: null };
    }
  } catch {
    return { isValid: false, matchedStep: null };
  }

  const timestampMs = options.timestamp ?? Date.now();
  const currentStep = Math.floor(timestampMs / 1000 / stepSeconds);

  // Check current step first, then skew steps
  const stepsToCheck = [currentStep];
  for (let w = 1; w <= window; w++) {
    stepsToCheck.push(currentStep - w);
    stepsToCheck.push(currentStep + w);
  }

  const tokenBuffer = Buffer.from(trimmedToken, "utf8");

  for (const step of stepsToCheck) {
    if (step < 0) continue;
    try {
      const expectedCode = generateTotpCode(keyBuffer, {
        step,
        digits,
        algorithm: options.algorithm ?? "sha1"
      });
      const expectedBuffer = Buffer.from(expectedCode, "utf8");
      if (
        tokenBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(tokenBuffer, expectedBuffer)
      ) {
        return { isValid: true, matchedStep: step };
      }
    } catch {
      // Step calculation failure should fail closed
      continue;
    }
  }

  return { isValid: false, matchedStep: null };
}

/**
 * Generate an otpauth:// URI for authenticator QR codes.
 *
 * @param {object} params
 * @param {string} params.secret - Base32 encoded secret
 * @param {string} params.accountName - User email or account identifier
 * @param {string} [params.issuer="CommerceFlow"] - Application name
 * @returns {string} otpauth URI
 */
export function generateTotpUri({ secret, accountName, issuer = "CommerceFlow" }) {
  if (typeof secret !== "string" || secret.trim().length === 0) {
    throw new TypeError("secret must be a non-empty string");
  }
  if (typeof accountName !== "string" || accountName.trim().length === 0) {
    throw new TypeError("accountName must be a non-empty string");
  }
  const encIssuer = encodeURIComponent(issuer.trim());
  const encAccount = encodeURIComponent(accountName.trim());
  return `otpauth://totp/${encIssuer}:${encAccount}?secret=${encodeURIComponent(secret.trim())}&issuer=${encIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Encrypt a plaintext MFA secret using AES-256-GCM.
 *
 * Output format: `v1:<12-byte-iv-hex>:<16-byte-auth-tag-hex>:<ciphertext-hex>`
 *
 * @param {string} plaintext - Plaintext secret to encrypt
 * @param {string} keyHex - 64-character hexadecimal string (32 bytes)
 * @returns {string} Formatted ciphertext envelope
 */
export function encryptMfaSecret(plaintext, keyHex) {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new TypeError("Plaintext secret must be a non-empty string");
  }
  if (typeof keyHex !== "string" || !KEY_HEX_REGEX.test(keyHex)) {
    throw new TypeError("Invalid MFA encryption key: must be a 64-character hexadecimal string");
  }

  const key = Buffer.from(keyHex, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return `${ENVELOPE_VERSION}:${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/**
 * Decrypt an AES-256-GCM MFA secret envelope.
 *
 * Enforces authenticated encryption integrity and strict format validation.
 * Never leaks key material, IV details, or plaintext in error messages.
 *
 * @param {string} envelope - Envelope formatted as `v1:iv:tag:ciphertext`
 * @param {string} keyHex - 64-character hexadecimal string (32 bytes)
 * @returns {string} Decrypted plaintext secret
 */
export function decryptMfaSecret(envelope, keyHex) {
  if (typeof envelope !== "string") {
    throw new TypeError("Ciphertext envelope must be a string");
  }
  if (typeof keyHex !== "string" || !KEY_HEX_REGEX.test(keyHex)) {
    throw new TypeError("Invalid MFA encryption key: must be a 64-character hexadecimal string");
  }

  const parts = envelope.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid envelope format");
  }

  const [version, ivHex, tagHex, ciphertextHex] = parts;

  if (version !== ENVELOPE_VERSION) {
    throw new Error(`Unsupported envelope version: ${version}`);
  }

  if (
    !/^[0-9a-fA-F]{24}$/.test(ivHex) ||
    !/^[0-9a-fA-F]{32}$/.test(tagHex) ||
    !/^[0-9a-fA-F]+$/.test(ciphertextHex)
  ) {
    throw new Error("Invalid envelope components");
  }

  try {
    const key = Buffer.from(keyHex, "hex");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(tagHex, "hex");
    const ciphertext = Buffer.from(ciphertextHex, "hex");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);

    return decrypted.toString("utf8");
  } catch (err) {
    // If envelope version error, re-throw; otherwise mask underlying crypto errors
    if (err.message.startsWith("Unsupported envelope version")) {
      throw err;
    }
    throw new Error("MFA secret decryption failed");
  }
}

/**
 * Generate a list of cryptographically random, high-entropy recovery codes.
 *
 * Uses Crockford's Base32 alphabet (32 characters, exactly 5 bits per character).
 * 16 characters provide 80 bits of cryptographic entropy per code.
 * Formatted as `XXXX-XXXX-XXXX-XXXX` for legibility.
 *
 * @param {number} [count=8] - Number of recovery codes to generate
 * @param {number} [length=16] - Code length in characters (minimum 16 for >=80 bits entropy)
 * @returns {string[]} Array of formatted recovery codes
 */
export function generateRecoveryCodes(count = 8, length = 16) {
  if (typeof count !== "number" || count <= 0) {
    throw new RangeError("Count must be greater than 0");
  }
  if (typeof length !== "number" || length < 16) {
    throw new RangeError("Length must be at least 16 to provide >= 80 bits of entropy");
  }

  const codes = [];
  for (let c = 0; c < count; c++) {
    const bytes = crypto.randomBytes(length);
    let raw = "";
    for (let i = 0; i < length; i++) {
      // 256 is an exact multiple of 32 (256 / 32 = 8), yielding uniform selection without modulo bias.
      raw += CROCKFORD_ALPHABET[bytes[i] % 32];
    }
    const formatted = raw.match(/.{1,4}/g)?.join("-") ?? raw;
    codes.push(formatted);
  }
  return codes;
}

/**
 * Normalize a user-entered recovery code for verification or hashing.
 * Strips whitespace, hyphens, and converts to uppercase.
 *
 * @param {string} code
 * @returns {string} Normalized uppercase code
 */
export function normalizeRecoveryCode(code) {
  if (typeof code !== "string") {
    throw new TypeError("Recovery code must be a string");
  }
  return code.replace(/[\s-]+/g, "").toUpperCase();
}

/**
 * Hash a normalized recovery code using SHA-256 for persistent database storage.
 *
 * IMPORTANT: A SHA-256 hash alone does not prevent replay or enforce one-time use.
 * Single redemption requires an atomic conditional database operation
 * (e.g., `User.updateOne({ _id: userId, "twoFactorRecoveryCodes.codeHash": hash, "twoFactorRecoveryCodes.redeemedAt": null }, { $set: { "twoFactorRecoveryCodes.$.redeemedAt": new Date() } })`).
 *
 * @param {string} code - Plaintext or formatted recovery code
 * @returns {string} SHA-256 hex digest
 */
export function hashRecoveryCode(code) {
  const normalized = normalizeRecoveryCode(code);
  if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{16,}$/.test(normalized)) {
    throw new Error("Invalid recovery code format");
  }
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

