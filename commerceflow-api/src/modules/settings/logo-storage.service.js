import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import AppError from "../../common/errors/app-error.js";

/**
 * Returns the authoritative absolute directory for branding logo assets.
 * Directory: <workspace>/commerceflow-api/uploads/branding
 *
 * @returns {string}
 */
export function getBrandingStorageDirectory() {
  return path.resolve(process.cwd(), "uploads", "branding");
}

/**
 * Saves a validated logo image buffer to disk with an unguessable safe filename.
 * Prevents arbitrary filesystem traversal and enforces strict directory containment.
 *
 * @param {Buffer} buffer - Validated image buffer
 * @param {string} extension - Sanitized extension (e.g. "png", "jpg", "webp", "svg")
 * @returns {Promise<{ filename: string, fullPath: string, relativeUrl: string }>}
 */
export async function saveLogoFile(buffer, extension) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AppError("Cannot save empty image buffer", 400, [], "INVALID_BUFFER");
  }

  const cleanExt = String(extension || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const storageDir = getBrandingStorageDirectory();

  // Ensure storage directory exists
  await fs.promises.mkdir(storageDir, { recursive: true });

  const randomHash = crypto.randomBytes(8).toString("hex");
  const filename = `logo-${Date.now()}-${randomHash}.${cleanExt}`;
  const fullPath = path.join(storageDir, filename);

  // Path traversal assertion
  if (!fullPath.startsWith(storageDir)) {
    throw new AppError("Invalid filesystem target path", 500, [], "PATH_TRAVERSAL_DETECTED");
  }

  await fs.promises.writeFile(fullPath, buffer);

  return {
    filename,
    fullPath,
    relativeUrl: `/api/v1/settings/logo?v=${Date.now()}`
  };
}

/**
 * Safely removes an obsolete logo asset from disk.
 * Strictly verifies directory containment to prevent deletion of arbitrary files.
 *
 * @param {string} [filename]
 * @returns {Promise<boolean>}
 */
export async function deleteLogoFileSafe(filename) {
  if (!filename || typeof filename !== "string") {
    return false;
  }

  const storageDir = getBrandingStorageDirectory();
  const baseName = path.basename(filename.trim());
  const targetPath = path.join(storageDir, baseName);

  // Strictly assert path containment within uploads/branding
  if (!targetPath.startsWith(storageDir)) {
    return false;
  }

  try {
    await fs.promises.unlink(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false; // File was already deleted or does not exist
    }
    // Non-fatal logging for unexpected filesystem issues
    return false;
  }
}

/**
 * Resolves a safe file path for reading a persisted logo asset.
 *
 * @param {string} filename
 * @returns {string|null}
 */
export function getLogoFilePathSafe(filename) {
  if (!filename || typeof filename !== "string") {
    return null;
  }

  const storageDir = getBrandingStorageDirectory();
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
