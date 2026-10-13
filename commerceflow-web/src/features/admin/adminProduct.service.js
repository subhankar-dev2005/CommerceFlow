import { apiClient, ApiError } from '../../lib/apiClient.js';

/**
 * Validate that an ID is a 24-character hexadecimal MongoDB ObjectId.
 * @param {string} id
 * @param {string} fieldName
 * @throws {ApiError}
 */
function validateObjectId(id, fieldName = 'id') {
  if (!id || typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id.trim())) {
    throw new ApiError({
      message: `A valid 24-character ${fieldName} is required`,
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: fieldName, message: `Invalid ${fieldName}` }],
    });
  }
}

/**
 * Sanitize and clean a variant object before submitting to backend.
 * @param {Object} v
 * @returns {Object}
 */
function sanitizeVariant(v) {
  if (!v || typeof v !== 'object') return null;

  const sanitized = {
    sku: String(v.sku || '').trim().toUpperCase(),
    stock: parseInt(v.stock, 10) || 0,
    attributes: {},
  };

  if (v.variantId && typeof v.variantId === 'string' && v.variantId.trim()) {
    sanitized.variantId = v.variantId.trim();
  }

  if (v.attributes && typeof v.attributes === 'object' && !Array.isArray(v.attributes)) {
    for (const [key, val] of Object.entries(v.attributes)) {
      const cleanKey = String(key || '').trim().toLowerCase();
      const cleanVal = typeof val === 'string' ? val.trim() : String(val || '').trim();
      if (cleanKey && cleanVal) {
        sanitized.attributes[cleanKey] = cleanVal;
      }
    }
  }

  if (v.price !== undefined && v.price !== null && v.price !== '') {
    const numPrice = Number(v.price);
    if (!Number.isNaN(numPrice) && numPrice >= 0) {
      sanitized.price = numPrice;
    }
  }

  if (Array.isArray(v.images)) {
    const cleanImgs = v.images
      .map((img) => (typeof img === 'string' ? img.trim() : ''))
      .filter((url) => url.startsWith('http://') || url.startsWith('https://'));
    if (cleanImgs.length > 0) {
      sanitized.images = cleanImgs;
    }
  }

  if (v.isActive !== undefined) {
    sanitized.isActive = Boolean(v.isActive);
  }

  return sanitized;
}

/**
 * Fetch paginated and filtered products for administration.
 * Calls /api/v1/admin/products to include active and inactive products.
 *
 * @param {Object} [params={}]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {string} [params.search]
 * @param {string} [params.category]
 * @param {'all'|'active'|'inactive'} [params.status]
 * @param {'all'|'inStock'|'outOfStock'|'lowStock'} [params.stock]
 * @param {'all'|'true'|'false'} [params.hasVariants]
 * @param {string} [params.sort]
 * @param {string} [params.sortBy]
 * @param {'asc'|'desc'} [params.sortOrder]
 * @returns {Promise<{ products: Array<Object>, pagination: Object }>}
 */
export async function getProducts(params = {}) {
  const queryParts = [];

  const addParam = (key, value) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value).trim())}`);
    }
  };

  if (params.page) addParam('page', params.page);
  if (params.limit) addParam('limit', params.limit);
  if (params.search) addParam('search', params.search);
  if (params.category) addParam('category', params.category);

  // Status filter
  if (params.status && params.status !== 'all') {
    addParam('status', params.status);
  }

  // Stock filter (with backward compatibility for inStock boolean strings)
  if (params.stock && params.stock !== 'all') {
    addParam('stock', params.stock);
  } else if (params.inStock === 'true') {
    addParam('stock', 'inStock');
  } else if (params.inStock === 'false') {
    addParam('stock', 'outOfStock');
  }

  // Variants filter
  if (params.hasVariants && params.hasVariants !== 'all') {
    addParam('hasVariants', params.hasVariants);
  }

  // Sort
  if (params.sort) {
    addParam('sort', params.sort);
  } else {
    if (params.sortBy) addParam('sortBy', params.sortBy);
    if (params.sortOrder) addParam('sortOrder', params.sortOrder);
  }

  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  let response;
  try {
    response = await apiClient.get(`admin/products${queryString}`);
  } catch (err) {
    // Graceful fallback to storefront products if admin endpoint is unavailable
    if (err?.status === 404) {
      response = await apiClient.get(`products${queryString}`);
    } else {
      throw err;
    }
  }

  return {
    products: response?.data?.products || [],
    pagination: response?.data?.pagination || {
      page: 1,
      limit: 10,
      totalProducts: 0,
      totalPages: 1,
    },
  };
}

/**
 * Fetch a single product by ID for administration.
 *
 * @param {string} id - 24-character hex product ID
 * @returns {Promise<Object>} Product document
 */
export async function getProductById(id) {
  validateObjectId(id, 'product ID');
  const cleanId = id.trim();

  let response;
  try {
    response = await apiClient.get(`admin/products/${cleanId}`);
  } catch (err) {
    if (err?.status === 404) {
      response = await apiClient.get(`products/${cleanId}`);
    } else {
      throw err;
    }
  }

  return response?.data?.product;
}

/**
 * Create a new product with optional variants.
 *
 * @param {Object} productData
 * @returns {Promise<Object>} Created product document
 */
export async function createProduct(productData) {
  if (!productData || typeof productData !== 'object') {
    throw new ApiError({
      message: 'Product payload is required',
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  const payload = {
    name: String(productData.name || '').trim(),
    description: String(productData.description || '').trim(),
    price: Number(productData.price),
    stock: parseInt(productData.stock, 10) || 0,
    category: String(productData.category || '').trim(),
  };

  const trimmedImage = typeof productData.image === 'string' ? productData.image.trim() : '';
  if (trimmedImage) {
    payload.image = trimmedImage;
  }

  if (Array.isArray(productData.images)) {
    const cleanImages = productData.images
      .map((img) => (typeof img === 'string' ? img.trim() : ''))
      .filter((url) => url.startsWith('http://') || url.startsWith('https://'));
    if (cleanImages.length > 0) {
      payload.images = cleanImages;
    }
  }

  if (Array.isArray(productData.specifications)) {
    const cleanSpecs = productData.specifications
      .map((s) => ({
        label: typeof s?.label === 'string' ? s.label.trim() : '',
        value: typeof s?.value === 'string' ? s.value.trim() : '',
      }))
      .filter((s) => s.label && s.value);
    if (cleanSpecs.length > 0) {
      payload.specifications = cleanSpecs;
    }
  }

  // Variant support
  if (Array.isArray(productData.variants) && productData.variants.length > 0) {
    const sanitizedVariants = productData.variants
      .map(sanitizeVariant)
      .filter((v) => v && v.sku && Object.keys(v.attributes).length > 0);

    if (sanitizedVariants.length > 0) {
      payload.variants = sanitizedVariants;
    }
  }

  const response = await apiClient.post('products', payload);
  return response?.data?.product;
}

/**
 * Update an existing product, including active variants and attributes.
 *
 * @param {string} id - 24-character hex product ID
 * @param {Object} updateData - Partial product fields to update
 * @returns {Promise<Object>} Updated product document
 */
export async function updateProduct(id, updateData) {
  validateObjectId(id, 'product ID');

  if (!updateData || typeof updateData !== 'object') {
    throw new ApiError({
      message: 'Update payload is required',
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  const payload = {};

  if (updateData.name !== undefined) {
    payload.name = String(updateData.name).trim();
  }
  if (updateData.description !== undefined) {
    payload.description = String(updateData.description).trim();
  }
  if (updateData.price !== undefined) {
    payload.price = Number(updateData.price);
  }
  if (updateData.stock !== undefined) {
    payload.stock = parseInt(updateData.stock, 10);
  }
  if (updateData.category !== undefined) {
    payload.category = String(updateData.category).trim();
  }
  if (updateData.image !== undefined) {
    const trimmed = String(updateData.image).trim();
    if (trimmed) {
      payload.image = trimmed;
    }
  }
  if (updateData.images !== undefined) {
    if (Array.isArray(updateData.images)) {
      payload.images = updateData.images
        .map((img) => (typeof img === 'string' ? img.trim() : ''))
        .filter((url) => url.startsWith('http://') || url.startsWith('https://'));
    }
  }
  if (updateData.specifications !== undefined) {
    if (Array.isArray(updateData.specifications)) {
      payload.specifications = updateData.specifications
        .map((s) => ({
          label: typeof s?.label === 'string' ? s.label.trim() : '',
          value: typeof s?.value === 'string' ? s.value.trim() : '',
        }))
        .filter((s) => s.label && s.value);
    }
  }
  if (updateData.isActive !== undefined) {
    payload.isActive = Boolean(updateData.isActive);
  }

  // Variant support in update
  if (updateData.variants !== undefined) {
    if (Array.isArray(updateData.variants)) {
      const sanitizedVariants = updateData.variants
        .map(sanitizeVariant)
        .filter((v) => v && v.sku && Object.keys(v.attributes).length > 0);
      payload.variants = sanitizedVariants;
    }
  }

  if (Object.keys(payload).length === 0) {
    throw new ApiError({
      message: 'At least one field is required to update',
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  const cleanId = id.trim();
  const response = await apiClient.patch(`products/${cleanId}`, payload);
  return response?.data?.product;
}

/**
 * Toggle active/inactive status of a product directly.
 *
 * @param {string} id - 24-character hex product ID
 * @param {boolean} isActive - Desired status
 * @returns {Promise<Object>} Updated product
 */
export async function updateProductStatus(id, isActive) {
  validateObjectId(id, 'product ID');
  const cleanId = id.trim();

  const response = await apiClient.patch(`admin/products/${cleanId}/status`, {
    isActive: Boolean(isActive),
  });

  return response?.data?.product;
}

/**
 * Delete a product (soft-delete via backend).
 *
 * @param {string} id - 24-character hex product ID
 * @returns {Promise<Object>} Backend response
 */
export async function deleteProduct(id) {
  validateObjectId(id, 'product ID');
  const cleanId = id.trim();
  const response = await apiClient.delete(`products/${cleanId}`);
  return response?.data ?? response;
}

export const adminProductService = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateProductStatus,
  deleteProduct,
};

export default adminProductService;
