import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, ApiError } from '../../lib/apiClient.js';
import {
  getAdminBrands,
  createAdminBrand,
  updateAdminBrand,
  deleteAdminBrand,
} from './adminBrand.service.js';

describe('Admin Brand Service Tests', () => {
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

  describe('getAdminBrands', () => {
    it('sends GET with query params and returns brand list', async () => {
      let calledUrl = null;
      apiClient.get = async (url) => {
        calledUrl = url;
        return {
          success: true,
          data: {
            brands: [{ _id: '507f1f77bcf86cd799439011', name: 'Patagonia', slug: 'patagonia' }],
            pagination: { page: 1, limit: 10, totalBrands: 1, totalPages: 1 },
          },
        };
      };

      const res = await getAdminBrands({ search: 'Patagonia', status: 'active' });
      assert.ok(calledUrl.includes('search=Patagonia'));
      assert.ok(calledUrl.includes('status=active'));
      assert.equal(res.brands.length, 1);
      assert.equal(res.brands[0].name, 'Patagonia');
    });
  });

  describe('createAdminBrand', () => {
    it('validates required name field before dispatch', async () => {
      await assert.rejects(
        () => createAdminBrand({ name: '' }),
        (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR'
      );
    });

    it('sends POST to admin/brands with sanitized payload', async () => {
      let calledUrl = null;
      let sentBody = null;
      apiClient.post = async (url, body) => {
        calledUrl = url;
        sentBody = body;
        return {
          success: true,
          data: { brand: { _id: 'brand123', name: 'Arc\'teryx', slug: 'arcteryx' } },
        };
      };

      const result = await createAdminBrand({ name: '  Arc\'teryx  ' });
      assert.equal(calledUrl, 'admin/brands');
      assert.equal(sentBody.name, 'Arc\'teryx');
      assert.equal(result.name, 'Arc\'teryx');
    });
  });

  describe('updateAdminBrand', () => {
    it('validates 24-character hexadecimal ObjectId', async () => {
      await assert.rejects(
        () => updateAdminBrand('invalid-id', { name: 'New' }),
        (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR'
      );
    });

    it('sends PATCH to admin/brands/:id', async () => {
      let calledUrl = null;
      apiClient.patch = async (url) => {
        calledUrl = url;
        return { success: true, data: { brand: { _id: '507f1f77bcf86cd799439011', name: 'New Name' } } };
      };

      const res = await updateAdminBrand('507f1f77bcf86cd799439011', { name: 'New Name' });
      assert.equal(calledUrl, 'admin/brands/507f1f77bcf86cd799439011');
      assert.equal(res.name, 'New Name');
    });
  });

  describe('deleteAdminBrand', () => {
    it('sends DELETE to admin/brands/:id', async () => {
      let calledUrl = null;
      apiClient.delete = async (url) => {
        calledUrl = url;
        return { success: true, data: { id: '507f1f77bcf86cd799439011' } };
      };

      const res = await deleteAdminBrand('507f1f77bcf86cd799439011');
      assert.equal(calledUrl, 'admin/brands/507f1f77bcf86cd799439011');
      assert.equal(res.id, '507f1f77bcf86cd799439011');
    });
  });
});
