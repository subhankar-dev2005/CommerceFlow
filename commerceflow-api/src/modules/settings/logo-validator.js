import AppError from "../../common/errors/app-error.js";

export const MAX_LOGO_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const RIFF_HEADER = Buffer.from([0x52, 0x49, 0x46, 0x46]); // "RIFF"
const WEBP_HEADER = Buffer.from([0x57, 0x45, 0x42, 0x50]); // "WEBP"

/**
 * Parses and decodes an image payload from either a base64 Data URL or raw base64 string.
 *
 * @param {string} rawInput
 * @returns {{ buffer: Buffer, declaredMimeType: string|null }}
 */
export function parseImagePayload(rawInput) {
  if (typeof rawInput !== "string" || !rawInput.trim()) {
    throw new AppError(
      "Image payload is required and must be a valid base64 string",
      400,
      [],
      "INVALID_IMAGE_PAYLOAD"
    );
  }

  const trimmed = rawInput.trim();
  let base64Data = trimmed;
  let declaredMimeType = null;

  // Check for Data URL scheme (data:<mimeType>;base64,<data>)
  const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/s);
  if (dataUrlMatch) {
    declaredMimeType = dataUrlMatch[1].trim().toLowerCase();
    base64Data = dataUrlMatch[2].trim();
  }

  // Remove whitespace/newlines from base64 string
  const cleanBase64 = base64Data.replace(/\s+/g, "");

  // Basic base64 character set validation
  if (!/^[A-Za-z0-9+/=]+$/.test(cleanBase64)) {
    throw new AppError(
      "Image payload contains invalid base64 encoding",
      400,
      [],
      "MALFORMED_BASE64_DATA"
    );
  }

  const buffer = Buffer.from(cleanBase64, "base64");

  if (!buffer || buffer.length === 0) {
    throw new AppError(
      "Decoded image data is empty",
      400,
      [],
      "EMPTY_IMAGE_DATA"
    );
  }

  return { buffer, declaredMimeType };
}

/**
 * Validates SVG content against script injection, external entity injection (XXE),
 * and active script handlers.
 *
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function validateSvgSafety(buffer) {
  const content = buffer.toString("utf8");

  // Basic SVG structure verification
  if (!/<svg\b/i.test(content) || !/<\/svg>/i.test(content)) {
    throw new AppError(
      "Malformed SVG file: missing root <svg> or closing </svg> tag",
      400,
      [],
      "MALFORMED_SVG"
    );
  }

  // Prevent XML External Entity (XXE) attacks
  if (/<!ENTITY\b/i.test(content) || /<!DOCTYPE\b[^>]*\bSYSTEM\b/i.test(content)) {
    throw new AppError(
      "Unsafe SVG: XML external entity (XXE) definitions are strictly prohibited",
      400,
      [],
      "UNSAFE_SVG_CONTENT"
    );
  }

  // Prevent embedded script tags
  if (/<script\b/i.test(content)) {
    throw new AppError(
      "Unsafe SVG: <script> elements are strictly prohibited",
      400,
      [],
      "UNSAFE_SVG_CONTENT"
    );
  }

  // Prevent script pseudo-protocols (javascript:, vbscript:, data:text/html)
  if (/(?:javascript|vbscript)\s*:/i.test(content) || /data\s*:\s*text\/html/i.test(content)) {
    throw new AppError(
      "Unsafe SVG: Script URLs and inline HTML data schemes are prohibited",
      400,
      [],
      "UNSAFE_SVG_CONTENT"
    );
  }

  // Prevent active execution wrappers (foreignObject, iframe, embed, object)
  if (/<(?:foreignObject|iframe|embed|object|applet)\b/i.test(content)) {
    throw new AppError(
      "Unsafe SVG: Embedded interactive containers are prohibited",
      400,
      [],
      "UNSAFE_SVG_CONTENT"
    );
  }

  // Prevent inline event handlers (e.g. onload=, onerror=, onclick=)
  if (/\bon[a-z]{3,}\s*=/i.test(content)) {
    throw new AppError(
      "Unsafe SVG: Active event handlers (onload, onerror, etc.) are prohibited",
      400,
      [],
      "UNSAFE_SVG_CONTENT"
    );
  }

  // Prevent external resource inclusion via <use> tag
  if (/<use\b[^>]*\b(?:xlink:)?href\s*=\s*['"]https?:/i.test(content)) {
    throw new AppError(
      "Unsafe SVG: Remote external references via <use> are prohibited",
      400,
      [],
      "UNSAFE_SVG_CONTENT"
    );
  }

  return true;
}

/**
 * Validates an image buffer by file size, magic bytes, and safe content inspection.
 *
 * @param {Buffer} buffer
 * @param {Object} [options]
 * @param {number} [options.maxSize=MAX_LOGO_FILE_SIZE_BYTES]
 * @returns {{ mimeType: string, extension: string, size: number }}
 */
export function validateLogoBuffer(buffer, { maxSize = MAX_LOGO_FILE_SIZE_BYTES } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
    throw new AppError(
      "Image file is too small or corrupted (minimum 8 bytes required)",
      400,
      [],
      "CORRUPT_IMAGE_FILE"
    );
  }

  if (buffer.length > maxSize) {
    const sizeMb = (buffer.length / (1024 * 1024)).toFixed(2);
    const maxMb = (maxSize / (1024 * 1024)).toFixed(0);
    throw new AppError(
      `File size exceeds the ${maxMb}MB limit (received ${sizeMb} MB)`,
      400,
      [],
      "IMAGE_OVERSIZED"
    );
  }

  // 1. Check PNG magic bytes (8 bytes)
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_MAGIC)) {
    return {
      mimeType: "image/png",
      extension: "png",
      size: buffer.length
    };
  }

  // 2. Check JPEG magic bytes (3 bytes)
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(JPEG_MAGIC)) {
    return {
      mimeType: "image/jpeg",
      extension: "jpg",
      size: buffer.length
    };
  }

  // 3. Check WebP magic bytes: RIFF at 0..3 and WEBP at 8..11
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).equals(RIFF_HEADER) &&
    buffer.subarray(8, 12).equals(WEBP_HEADER)
  ) {
    return {
      mimeType: "image/webp",
      extension: "webp",
      size: buffer.length
    };
  }

  // 4. Check for SVG
  const sample = buffer.subarray(0, 200).toString("utf8").trim().toLowerCase();
  if (sample.startsWith("<?xml") || sample.startsWith("<svg") || sample.includes("<svg")) {
    validateSvgSafety(buffer);
    return {
      mimeType: "image/svg+xml",
      extension: "svg",
      size: buffer.length
    };
  }

  throw new AppError(
    "Unsupported or invalid image file format. Supported formats are PNG, JPEG, WebP, and clean SVG.",
    400,
    [],
    "UNSUPPORTED_IMAGE_FORMAT"
  );
}
