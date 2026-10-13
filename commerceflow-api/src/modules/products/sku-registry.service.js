import SkuRegistry from "./sku-registry.model.js";
import AppError from "../../common/errors/app-error.js";

/**
 * Normalizes a SKU string by trimming whitespace and converting to uppercase.
 * Returns null if the SKU is absent, not a string, or empty.
 *
 * @param {unknown} sku
 * @returns {string|null}
 */
export function normalizeSku(sku) {
  if (typeof sku !== "string") return null;
  const trimmed = sku.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Reserves one or more SKUs for a given product in SkuRegistry.
 *
 * @param {string|mongoose.Types.ObjectId} productId - Owning product ID
 * @param {Array<{ sku: string, variantId?: string|null }>|Array<string>} entries - SKUs to reserve
 * @returns {Promise<Array<object>>} - List of created registry documents
 */
export async function reserveProductSkus(productId, entries) {
  if (!productId) {
    throw new AppError("Product ID is required for SKU reservation", 400, [], "INVALID_PRODUCT_ID");
  }

  const rawList = Array.isArray(entries) ? entries : [entries];
  const normalizedEntries = [];
  const seenInBatch = new Set();

  for (const item of rawList) {
    const sku = typeof item === "string" ? item : item?.sku;
    const variantId = typeof item === "object" ? item?.variantId ?? null : null;
    const norm = normalizeSku(sku);
    if (!norm) continue;

    if (seenInBatch.has(norm)) {
      throw new AppError(
        `Duplicate SKU '${norm}' in reservation request`,
        409,
        [],
        "SKU_ALREADY_EXISTS"
      );
    }
    seenInBatch.add(norm);
    normalizedEntries.push({ sku: norm, variantId });
  }

  if (normalizedEntries.length === 0) {
    return [];
  }

  const createdSkus = [];
  const createdDocs = [];

  try {
    for (const entry of normalizedEntries) {
      const doc = await SkuRegistry.create({
        sku: entry.sku,
        product: productId,
        variantId: entry.variantId
      });
      createdSkus.push(entry.sku);
      createdDocs.push(doc);
    }
    return createdDocs;
  } catch (err) {
    // Roll back entries created during this invocation, strictly scoped to this product
    if (createdSkus.length > 0) {
      await SkuRegistry.deleteMany({
        product: productId,
        sku: { $in: createdSkus }
      });
    }

    // Treat duplicate key error (MongoDB code 11000) as SKU conflict
    if (err.code === 11000 || (err.message && err.message.includes("E11000"))) {
      const conflictSku =
        err.keyValue?.sku ||
        err.keyPattern?.sku ||
        normalizedEntries[createdSkus.length]?.sku ||
        "UNKNOWN";

      throw new AppError(
        `SKU '${conflictSku}' is already registered`,
        409,
        [],
        "SKU_ALREADY_EXISTS"
      );
    }

    // Propagate all other database errors
    throw err;
  }
}

/**
 * Releases specified SKUs belonging to a specific product.
 *
 * @param {string|mongoose.Types.ObjectId} productId - Expected owner product ID
 * @param {Array<string>|string|Array<{ sku: string }>} skus - SKUs to release
 * @returns {Promise<{ releasedCount: number, releasedSkus: string[] }>}
 */
export async function releaseProductSkus(productId, skus) {
  if (!productId) {
    return { releasedCount: 0, releasedSkus: [] };
  }

  const rawList = Array.isArray(skus) ? skus : [skus];
  const normalizedSkus = rawList
    .map((item) => (typeof item === "string" ? item : item?.sku))
    .map(normalizeSku)
    .filter(Boolean);

  if (normalizedSkus.length === 0) {
    return { releasedCount: 0, releasedSkus: [] };
  }

  const result = await SkuRegistry.deleteMany({
    product: productId,
    sku: { $in: normalizedSkus }
  });

  return {
    releasedCount: result?.deletedCount || 0,
    releasedSkus: normalizedSkus
  };
}

/**
 * Reconciles current and desired SKU ownership for a product.
 * Preserves unchanged reservations, reserves newly desired SKUs, and releases removed SKUs.
 *
 * @param {string|mongoose.Types.ObjectId} productId - Product ID
 * @param {Array<{ sku: string, variantId?: string|null }>|Array<string>|null} currentEntries - Existing SKU entries
 * @param {Array<{ sku: string, variantId?: string|null }>|Array<string>} desiredEntries - Desired SKU entries
 * @param {object} [options] - Options
 * @param {boolean} [options.autoRelease=true] - Whether to automatically release removed SKUs
 * @returns {Promise<{ reservedSkus: string[], skusToRelease: string[], skusToKeep: string[], releasedSkus: string[], compensate: Function, commitRelease: Function }>}
 */
export async function reconcileProductSkus(productId, currentEntries, desiredEntries, options = {}) {
  if (!productId) {
    throw new AppError("Product ID is required for SKU reconciliation", 400, [], "INVALID_PRODUCT_ID");
  }

  const { autoRelease = true } = options;

  // Build current map (normalizedSku -> variantId)
  let rawCurrentList = currentEntries;
  if (rawCurrentList === null || rawCurrentList === undefined) {
    rawCurrentList = await SkuRegistry.find({ product: productId }).lean();
  }

  const currentMap = new Map();
  for (const item of (Array.isArray(rawCurrentList) ? rawCurrentList : [])) {
    const sku = typeof item === "string" ? item : item?.sku;
    const variantId = typeof item === "object" ? item?.variantId ?? null : null;
    const norm = normalizeSku(sku);
    if (norm) {
      currentMap.set(norm, variantId);
    }
  }

  // Build desired map (normalizedSku -> variantId)
  const desiredMap = new Map();
  for (const item of (Array.isArray(desiredEntries) ? desiredEntries : [])) {
    const sku = typeof item === "string" ? item : item?.sku;
    const variantId = typeof item === "object" ? item?.variantId ?? null : null;
    const norm = normalizeSku(sku);
    if (norm) {
      desiredMap.set(norm, variantId);
    }
  }

  const currentSkus = new Set(currentMap.keys());
  const desiredSkus = new Set(desiredMap.keys());

  const skusToKeep = [...desiredSkus].filter((sku) => currentSkus.has(sku));
  const skusToReserve = [...desiredSkus].filter((sku) => !currentSkus.has(sku));
  const skusToRelease = [...currentSkus].filter((sku) => !desiredSkus.has(sku));

  // Verify and update variant mapping for preserved SKUs if variantId changed
  for (const sku of skusToKeep) {
    const desiredVariantId = desiredMap.get(sku) ?? null;
    const currentVariantId = currentMap.get(sku) ?? null;

    if (desiredVariantId !== currentVariantId) {
      await SkuRegistry.updateOne(
        { product: productId, sku },
        { variantId: desiredVariantId }
      );
    }
  }

  // Reserve newly desired SKUs
  if (skusToReserve.length > 0) {
    const entriesToReserve = skusToReserve.map((sku) => ({
      sku,
      variantId: desiredMap.get(sku) ?? null
    }));
    await reserveProductSkus(productId, entriesToReserve);
  }

  // Release removed SKUs if autoRelease is enabled
  let releasedSkus = [];
  if (autoRelease && skusToRelease.length > 0) {
    await releaseProductSkus(productId, skusToRelease);
    releasedSkus = skusToRelease;
  }

  return {
    reservedSkus: skusToReserve,
    skusToRelease,
    skusToKeep,
    releasedSkus,
    compensate: async () => {
      if (skusToReserve.length > 0) {
        await releaseProductSkus(productId, skusToReserve);
      }
    },
    commitRelease: async () => {
      if (skusToRelease.length > 0) {
        await releaseProductSkus(productId, skusToRelease);
      }
    }
  };
}
