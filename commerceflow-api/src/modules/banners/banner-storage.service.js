import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import AppError from "../../common/errors/app-error.js";

export const MAX_BANNER_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const RIFF_HEADER = Buffer.from([0x52, 0x49, 0x46, 0x46]); // "RIFF"
const WEBP_HEADER = Buffer.from([0x57, 0x45, 0x42, 0x50]); // "WEBP"

/**
 * Returns the authoritative absolute directory for banner assets.
 * Directory: <workspace>/commerceflow-api/uploads/banners
 *
 * @returns {string}
 */
export function getBannerStorageDirectory() {
  return path.resolve(process.cwd(), "uploads", "banners");
}

/**
 * Decodes and validates base64 image data.
 *
 * @param {string} rawInput
 * @returns {{ buffer: Buffer, declaredMimeType: string|null }}
 */
export function parseBannerImagePayload(rawInput) {
  if (typeof rawInput !== "string" || !rawInput.trim()) {
    throw new AppError(
      "Image payload is required and must be a valid base64 data URL or string",
      400,
      [],
      "INVALID_IMAGE_PAYLOAD"
    );
  }

  const trimmed = rawInput.trim();
  let base64Data = trimmed;
  let declaredMimeType = null;

  const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/s);
  if (dataUrlMatch) {
    declaredMimeType = dataUrlMatch[1].trim().toLowerCase();
    base64Data = dataUrlMatch[2].trim();
  }

  const cleanBase64 = base64Data.replace(/\s+/g, "");

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
 * Validates an image buffer strictly using magic bytes and size constraints.
 * Allows ONLY PNG, JPEG, and WebP.
 * Strictly rejects SVG and other executable/scriptable formats.
 *
 * @param {Buffer} buffer
 * @param {Object} [options]
 * @param {number} [options.maxSize=MAX_BANNER_FILE_SIZE_BYTES]
 * @returns {{ mimeType: string, extension: string, size: number }}
 */
export function validateBannerImageBuffer(buffer, { maxSize = MAX_BANNER_FILE_SIZE_BYTES } = {}) {
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

  // Reject SVG explicitly
  const sample = buffer.subarray(0, 200).toString("utf8").trim().toLowerCase();
  if (sample.startsWith("<?xml") || sample.startsWith("<svg") || sample.includes("<svg")) {
    throw new AppError(
      "SVG images are not permitted for promotional banners. Please upload JPEG, PNG, or WebP.",
      400,
      [],
      "UNSUPPORTED_IMAGE_FORMAT"
    );
  }

  // 1. PNG magic bytes (8 bytes)
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_MAGIC)) {
    return {
      mimeType: "image/png",
      extension: "png",
      size: buffer.length
    };
  }

  // 2. JPEG magic bytes (3 bytes)
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(JPEG_MAGIC)) {
    return {
      mimeType: "image/jpeg",
      extension: "jpg",
      size: buffer.length
    };
  }

  // 3. WebP magic bytes: RIFF at 0..3 and WEBP at 8..11
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

  throw new AppError(
    "Unsupported or invalid image format. Supported formats are PNG, JPEG, and WebP.",
    400,
    [],
    "UNSUPPORTED_IMAGE_FORMAT"
  );
}

/**
 * Saves a validated banner image buffer to disk with an unguessable filename.
 *
 * @param {Buffer} buffer
 * @param {string} extension
 * @param {"desktop"|"mobile"} variant
 * @returns {Promise<{ filename: string, fullPath: string, relativeUrl: string }>}
 */
export async function saveBannerImageFile(buffer, extension, variant = "desktop") {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AppError("Cannot save empty image buffer", 400, [], "INVALID_BUFFER");
  }

  const cleanExt = String(extension || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const storageDir = getBannerStorageDirectory();

  await fs.promises.mkdir(storageDir, { recursive: true });

  const randomHash = crypto.randomBytes(8).toString("hex");
  const filename = `banner-${variant}-${Date.now()}-${randomHash}.${cleanExt}`;
  const fullPath = path.join(storageDir, filename);

  if (!fullPath.startsWith(storageDir)) {
    throw new AppError("Invalid filesystem target path", 500, [], "PATH_TRAVERSAL_DETECTED");
  }

  await fs.promises.writeFile(fullPath, buffer);

  return {
    filename,
    fullPath,
    relativeUrl: `/api/v1/banners/images/${filename}`
  };
}

/**
 * Safely removes a banner image asset from disk.
 * Strictly verifies directory containment.
 *
 * @param {string} [filename]
 * @returns {Promise<boolean>}
 */
export async function deleteBannerFileSafe(filename) {
  if (!filename || typeof filename !== "string") {
    return false;
  }

  const storageDir = getBannerStorageDirectory();
  const baseName = path.basename(filename.trim());
  const targetPath = path.join(storageDir, baseName);

  if (!targetPath.startsWith(storageDir)) {
    return false;
  }

  try {
    await fs.promises.unlink(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    return false;
  }
}

/**
 * Resolves a safe file path for reading a persisted banner asset.
 *
 * @param {string} filename
 * @returns {string|null}
 */
export function getBannerFilePathSafe(filename) {
  if (!filename || typeof filename !== "string") {
    return null;
  }

  const storageDir = getBannerStorageDirectory();
  const baseName = path.basename(filename.trim());
  const targetPath = path.join(storageDir, baseName);

  if (!targetPath.startsWith(storageDir)) {
    return null;
  }

  if (fs.existsSync(targetPath)) {
    return targetPath;
  }

  return null;
}

