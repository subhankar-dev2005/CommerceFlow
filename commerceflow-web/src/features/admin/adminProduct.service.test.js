import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, ApiError } from '../../lib/apiClient.js';
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateProductStatus,
  deleteProduct,
} from './adminProduct.service.js';

describe('adminProduct.service Unit Tests', () => {
  let originalGet;
  let originalPost;
  let originalPatch;
  let originalDelete;

  beforeEach(() => {
    originalGet = apiClient.get;
    originalPost = apiClient.post;
    originalPatch = apiClient.patch;
    originalDelete = apiClient.delete;
  });

  afterEach(() => {
    apiClient.get = originalGet;
    apiClient.post = originalPost;
    apiClient.patch = originalPatch;
    apiClient.delete = originalDelete;
  });

  describe('getProducts', () => {
    it('fetches products using admin products endpoint with query parameters', async () => {
      let requestedUrl = '';
      apiClient.get = async (url) => {
        requestedUrl = url;
        return {
          data: {
            products: [{ _id: '507f1f77bcf86cd799439011', name: 'Alpine Tent' }],
            pagination: { page: 1, limit: 10, totalProducts: 1, totalPages: 1 },
          },
        };
      };

      const result = await getProducts({
        page: 2,
        limit: 20,
        search: 'tent',
        category: 'Camping',
        status: 'active',
        stock: 'inStock',
        hasVariants: 'true',
        sort: 'price_asc',
      });

      assert.match(requestedUrl, /^admin\/products\?/);
      assert.match(requestedUrl, /page=2/);
      assert.match(requestedUrl, /limit=20/);
      assert.match(requestedUrl, /search=tent/);
      assert.match(requestedUrl, /category=Camping/);
      assert.match(requestedUrl, /status=active/);
      assert.match(requestedUrl, /stock=inStock/);
      assert.match(requestedUrl, /hasVariants=true/);
      assert.match(requestedUrl, /sort=price_asc/);

      assert.equal(result.products.length, 1);
      assert.equal(result.pagination.totalProducts, 1);
    });

    it('falls back to products endpoint when admin/products returns 404', async () => {
      let callCount = 0;
      apiClient.get = async (url) => {
        callCount++;
        if (url.startsWith('admin/products')) {
          const err = new ApiError({ message: 'Not found', status: 404 });
          throw err;
        }
        return {
          data: {
            products: [{ _id: '507f1f77bcf86cd799439011', name: 'Fallback Tent' }],
            pagination: { page: 1, limit: 10, totalProducts: 1, totalPages: 1 },
          },
        };
      };

      const result = await getProducts();
      assert.equal(callCount, 2);
      assert.equal(result.products[0].name, 'Fallback Tent');
    });
  });

  describe('getProductById', () => {
    it('rejects invalid ObjectId', async () => {
      await assert.rejects(
        async () => getProductById('invalid-id'),
        (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR'
      );
    });

    it('retrieves product via admin endpoint', async () => {
      apiClient.get = async (url) => {
        assert.equal(url, 'admin/products/507f1f77bcf86cd799439011');
        return {
          data: {
            product: { _id: '507f1f77bcf86cd799439011', name: 'Alpine Tent' },
          },
        };
      };

      const product = await getProductById('507f1f77bcf86cd799439011');
      assert.equal(product.name, 'Alpine Tent');
    });
  });

  describe('createProduct', () => {
    it('sanitizes simple product payload and posts to products', async () => {
      let sentPayload = null;
      apiClient.post = async (url, payload) => {
        assert.equal(url, 'products');
        sentPayload = payload;
        return { data: { product: { _id: '507f1f77bcf86cd799439011', ...payload } } };
      };

      const input = {
        name: '  Camp Stove  ',
        description: 'High efficiency portable camp stove.',
        price: '2999',
        stock: '15',
        category: '  Cooking  ',
        image: 'https://example.com/stove.jpg',
      };

      const res = await createProduct(input);
      assert.equal(res.name, 'Camp Stove');
      assert.equal(sentPayload.name, 'Camp Stove');
      assert.equal(sentPayload.price, 2999);
      assert.equal(sentPayload.stock, 15);
      assert.equal(sentPayload.category, 'Cooking');
      assert.equal(sentPayload.image, 'https://example.com/stove.jpg');
    });

    it('sanitizes variant attributes, uppercase SKU, and passes variants array', async () => {
      let sentPayload = null;
      apiClient.post = async (url, payload) => {
        sentPayload = payload;
        return { data: { product: { _id: '507f1f77bcf86cd799439011', ...payload } } };
      };

      const input = {
        name: 'Alpine Backpack',
        description: 'Durable trekking backpack.',
        price: 4999,
        stock: 30,
        category: 'Bags',
        variants: [
          {
            sku: 'bp-red-m',
            stock: '10',
            price: 5299,
            attributes: { Color: ' Red ', Size: 'M ' },
            isActive: true,
          },
        ],
      };

      await createProduct(input);
      assert.ok(sentPayload.variants);
      assert.equal(sentPayload.variants.length, 1);
      assert.equal(sentPayload.variants[0].sku, 'BP-RED-M');
      assert.equal(sentPayload.variants[0].stock, 10);
      assert.equal(sentPayload.variants[0].price, 5299);
      assert.deepEqual(sentPayload.variants[0].attributes, { color: 'Red', size: 'M' });
      assert.equal(sentPayload.variants[0].isActive, true);
    });
  });

  describe('updateProduct', () => {
    it('validates id and updates allowed fields including variants', async () => {
      let sentPayload = null;
      apiClient.patch = async (url, payload) => {
        assert.equal(url, 'products/507f1f77bcf86cd799439011');
        sentPayload = payload;
        return { data: { product: { _id: '507f1f77bcf86cd799439011', ...payload } } };
      };

      const updateData = {
        name: 'Updated Tent',
        variants: [
          {
            variantId: 'var_existing_1',
            sku: 'tent-grn-l',
            stock: 5,
            attributes: { color: 'Green' },
          },
        ],
      };

      const res = await updateProduct('507f1f77bcf86cd799439011', updateData);
      assert.equal(res.name, 'Updated Tent');
      assert.equal(sentPayload.variants[0].variantId, 'var_existing_1');
      assert.equal(sentPayload.variants[0].sku, 'TENT-GRN-L');
    });

    it('rejects update if no fields provided', async () => {
      await assert.rejects(
        async () => updateProduct('507f1f77bcf86cd799439011', {}),
        (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR'
      );
    });
  });

  describe('updateProductStatus', () => {
    it('calls admin status endpoint to toggle isActive', async () => {
      let requestedUrl = '';
      let requestedPayload = null;
      apiClient.patch = async (url, payload) => {
        requestedUrl = url;
        requestedPayload = payload;
        return {
          data: {
            product: { _id: '507f1f77bcf86cd799439011', isActive: false },
          },
        };
      };

      const res = await updateProductStatus('507f1f77bcf86cd799439011', false);
      assert.equal(requestedUrl, 'admin/products/507f1f77bcf86cd799439011/status');
      assert.deepEqual(requestedPayload, { isActive: false });
      assert.equal(res.isActive, false);
    });
  });

  describe('deleteProduct', () => {
    it('calls DELETE on products endpoint with validated ID', async () => {
      let requestedUrl = '';
      apiClient.delete = async (url) => {
        requestedUrl = url;
        return { success: true, message: 'Product deleted' };
      };

      const res = await deleteProduct('507f1f77bcf86cd799439011');
      assert.equal(requestedUrl, 'products/507f1f77bcf86cd799439011');
      assert.equal(res.success, true);
    });
  });
});
