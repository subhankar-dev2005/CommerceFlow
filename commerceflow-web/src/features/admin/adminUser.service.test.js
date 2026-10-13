import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, ApiError } from '../../lib/apiClient.js';
import {
  getAdminUsers,
  createAdminUser,
  updateAdminUserStatus,
  updateAdminUserRole,
  validateObjectId,
  VALID_USER_ROLES,
  VALID_USER_STATUSES,
  VALID_SORT_FIELDS,
  VALID_SORT_ORDERS,
} from './adminUser.service.js';

const VALID_USER_ID = '507f1f77bcf86cd799439002';
const VALID_USER_ID_2 = '507f1f77bcf86cd799439003';

const MOCK_ADMIN_USER = {
  _id: VALID_USER_ID,
  id: VALID_USER_ID,
  name: 'Security Admin',
  email: 'admin@example.com',
  role: 'admin',
  isActive: true,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-03-30T10:00:00.000Z',
};

const MOCK_LIST_RESPONSE = {
  success: true,
  message: 'Users retrieved successfully',
  data: {
    users: [MOCK_ADMIN_USER],
    pagination: {
      page: 1,
      limit: 10,
      totalUsers: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    },
  },
};

describe('Admin User Service Unit Tests', () => {
  let originalGet;
  let originalPost;
  let originalPatch;

  beforeEach(() => {
    originalGet = apiClient.get;
    originalPost = apiClient.post;
    originalPatch = apiClient.patch;
  });

  afterEach(() => {
    apiClient.get = originalGet;
    apiClient.post = originalPost;
    apiClient.patch = originalPatch;
  });

  describe('validateObjectId', () => {
    it('accepts valid 24-character hexadecimal ObjectId', () => {
      assert.doesNotThrow(() => validateObjectId(VALID_USER_ID));
    });

    it('rejects invalid or missing IDs', () => {
      assert.throws(() => validateObjectId(''), ApiError);
      assert.throws(() => validateObjectId(null), ApiError);
      assert.throws(() => validateObjectId('invalid-hex-id'), ApiError);
      assert.throws(() => validateObjectId(12345), ApiError);
    });
  });

  describe('getAdminUsers', () => {
    it('fetches users with default pagination and params', async () => {
      let calledUrl = null;
      apiClient.get = async (url) => {
        calledUrl = url;
        return MOCK_LIST_RESPONSE;
      };

      const result = await getAdminUsers();
      assert.equal(calledUrl, 'admin/users');
      assert.equal(result.users.length, 1);
      assert.equal(result.users[0].name, 'Security Admin');
      assert.equal(result.pagination.totalUsers, 1);
    });

    it('serializes search, role, status, and sorting parameters', async () => {
      let calledUrl = null;
      apiClient.get = async (url) => {
        calledUrl = url;
        return MOCK_LIST_RESPONSE;
      };

      await getAdminUsers({
        page: 2,
        limit: 15,
        search: 'admin@example.com',
        role: 'admin',
        status: 'active',
        sortBy: 'name',
        sortOrder: 'asc',
      });

      assert.ok(calledUrl.includes('page=2'));
      assert.ok(calledUrl.includes('limit=15'));
      assert.ok(calledUrl.includes('search=admin%40example.com'));
      assert.ok(calledUrl.includes('role=admin'));
      assert.ok(calledUrl.includes('status=active'));
      assert.ok(calledUrl.includes('sortBy=name'));
      assert.ok(calledUrl.includes('sortOrder=asc'));
    });
  });

  describe('createAdminUser', () => {
    it('sends POST request with trimmed name and email and forces admin creation', async () => {
      let capturedPayload = null;
      apiClient.post = async (url, payload) => {
        capturedPayload = payload;
        return {
          success: true,
          data: {
            user: {
              _id: VALID_USER_ID_2,
              name: payload.name,
              email: payload.email,
              role: 'admin',
              isActive: true,
            },
          },
        };
      };

      const created = await createAdminUser({
        name: '  New Admin  ',
        email: '  NEW@example.com ',
        password: 'Password123!',
      });

      assert.equal(capturedPayload.name, 'New Admin');
      assert.equal(capturedPayload.email, 'new@example.com');
      assert.equal(capturedPayload.password, 'Password123!');
      assert.equal(created.role, 'admin');
    });

    it('rejects invalid client inputs prior to network request', async () => {
      await assert.rejects(() => createAdminUser({ name: 'A', email: 'valid@example.com', password: 'Password123!' }), ApiError);
      await assert.rejects(() => createAdminUser({ name: 'Valid Name', email: 'invalid-email', password: 'Password123!' }), ApiError);
      await assert.rejects(() => createAdminUser({ name: 'Valid Name', email: 'valid@example.com', password: 'short' }), ApiError);
    });
  });

  describe('updateAdminUserStatus', () => {
    it('sends PATCH request to update active status', async () => {
      let capturedUrl = null;
      let capturedBody = null;

      apiClient.patch = async (url, body) => {
        capturedUrl = url;
        capturedBody = body;
        return {
          success: true,
          data: {
            user: { ...MOCK_ADMIN_USER, isActive: body.isActive },
          },
        };
      };

      const updated = await updateAdminUserStatus(VALID_USER_ID, false);
      assert.equal(capturedUrl, `admin/users/${VALID_USER_ID}/status`);
      assert.equal(capturedBody.isActive, false);
      assert.equal(updated.isActive, false);
    });

    it('validates isActive is a boolean', async () => {
      await assert.rejects(() => updateAdminUserStatus(VALID_USER_ID, 'not-a-bool'), ApiError);
    });
  });

  describe('updateAdminUserRole', () => {
    it('sends PATCH request to update role', async () => {
      let capturedUrl = null;
      let capturedBody = null;

      apiClient.patch = async (url, body) => {
        capturedUrl = url;
        capturedBody = body;
        return {
          success: true,
          data: {
            user: { ...MOCK_ADMIN_USER, role: body.role },
          },
        };
      };

      const updated = await updateAdminUserRole(VALID_USER_ID, 'customer');
      assert.equal(capturedUrl, `admin/users/${VALID_USER_ID}/role`);
      assert.equal(capturedBody.role, 'customer');
      assert.equal(updated.role, 'customer');
    });

    it('rejects invalid roles on client', async () => {
      await assert.rejects(() => updateAdminUserRole(VALID_USER_ID, 'superadmin'), ApiError);
    });
  });
});
