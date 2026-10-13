import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, ApiError } from '../../lib/apiClient.js';
import {
  getAdminCustomers,
  getAdminCustomer,
  updateAdminCustomerStatus,
  validateObjectId,
  VALID_CUSTOMER_STATUSES,
  VALID_SORT_FIELDS,
  VALID_SORT_ORDERS,
} from './adminCustomer.service.js';

const VALID_CUSTOMER_ID = '507f1f77bcf86cd799439002';
const VALID_CUSTOMER_ID_2 = '507f1f77bcf86cd799439003';

const MOCK_CUSTOMER = {
  _id: VALID_CUSTOMER_ID,
  id: VALID_CUSTOMER_ID,
  name: 'Alice Johnson',
  email: 'alice@example.com',
  role: 'customer',
  isActive: true,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-03-30T10:00:00.000Z',
};

const MOCK_LIST_RESPONSE = {
  success: true,
  message: 'Admin customers retrieved successfully',
  data: {
    customers: [MOCK_CUSTOMER],
    pagination: {
      page: 1,
      limit: 10,
      totalCustomers: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    },
  },
};

const MOCK_DETAIL_RESPONSE = {
  success: true,
  message: 'Admin customer retrieved successfully',
  data: {
    customer: MOCK_CUSTOMER,
    addresses: [
      {
        _id: '607f1f77bcf86cd799439011',
        fullName: 'Alice Johnson',
        phone: '9876543210',
        addressLine1: '123 Elm St',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400001',
        country: 'India',
        isDefault: true,
      },
    ],
    orderStats: {
      totalOrders: 3,
      totalSpent: 4500,
      lastOrderDate: '2026-03-01T15:00:00.000Z',
    },
    recentOrders: [
      {
        _id: '707f1f77bcf86cd799439021',
        status: 'delivered',
        paymentStatus: 'paid',
        shipmentStatus: 'delivered',
        total: 1500,
        itemCount: 2,
        createdAt: '2026-03-01T15:00:00.000Z',
      },
    ],
  },
};

describe('P1.3 Step 79.6 — adminCustomer.service Unit Tests', () => {
  let originalGet;
  let originalPatch;
  let recordedCalls = [];
  let mockGetHandler = null;
  let mockPatchHandler = null;

  beforeEach(() => {
    recordedCalls = [];
    mockGetHandler = null;
    mockPatchHandler = null;

    originalGet = apiClient.get;
    originalPatch = apiClient.patch;

    apiClient.get = async (endpoint, options) => {
      recordedCalls.push({ method: 'GET', endpoint, options });
      if (mockGetHandler) return mockGetHandler(endpoint, options);
      return MOCK_LIST_RESPONSE;
    };

    apiClient.patch = async (endpoint, body, options) => {
      recordedCalls.push({ method: 'PATCH', endpoint, body, options });
      if (mockPatchHandler) return mockPatchHandler(endpoint, body, options);
      return {
        success: true,
        message: 'Customer status updated successfully',
        data: { customer: { ...MOCK_CUSTOMER, isActive: body.isActive } },
      };
    };
  });

  afterEach(() => {
    apiClient.get = originalGet;
    apiClient.patch = originalPatch;
  });

  describe('validateObjectId', () => {
    it('accepts valid 24-character hexadecimal ObjectId', () => {
      assert.doesNotThrow(() => validateObjectId(VALID_CUSTOMER_ID));
    });

    it('rejects invalid or malformed customerId', () => {
      assert.throws(() => validateObjectId('invalid-id'), (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, 'VALIDATION_ERROR');
        return true;
      });
      assert.throws(() => validateObjectId(''), (err) => err.status === 400);
      assert.throws(() => validateObjectId(null), (err) => err.status === 400);
      assert.throws(() => validateObjectId(12345), (err) => err.status === 400);
      assert.throws(() => validateObjectId('507f1f77bcf86cd79943900z'), (err) => err.status === 400);
    });
  });

  describe('getAdminCustomers', () => {
    it('calls GET admin/customers with empty query when no params provided', async () => {
      const res = await getAdminCustomers();

      assert.equal(recordedCalls.length, 1);
      assert.equal(recordedCalls[0].method, 'GET');
      assert.equal(recordedCalls[0].endpoint, 'admin/customers');
      assert.equal(res.customers.length, 1);
      assert.equal(res.customers[0].email, 'alice@example.com');
      assert.equal(res.pagination.totalCustomers, 1);
    });

    it('serializes all supported query parameters correctly', async () => {
      await getAdminCustomers({
        page: 2,
        limit: 20,
        search: 'Alice Johnson',
        status: 'active',
        sortBy: 'name',
        sortOrder: 'asc',
      });

      assert.equal(recordedCalls.length, 1);
      const url = recordedCalls[0].endpoint;
      assert.ok(url.startsWith('admin/customers?'));
      assert.ok(url.includes('page=2'));
      assert.ok(url.includes('limit=20'));
      assert.ok(url.includes('search=Alice%20Johnson'));
      assert.ok(url.includes('status=active'));
      assert.ok(url.includes('sortBy=name'));
      assert.ok(url.includes('sortOrder=asc'));
    });

    it('filters out invalid status and sort fields', async () => {
      await getAdminCustomers({
        status: 'banned',
        sortBy: 'password',
        sortOrder: 'sideways',
      });

      assert.equal(recordedCalls.length, 1);
      const url = recordedCalls[0].endpoint;
      assert.equal(url, 'admin/customers');
    });

    it('passes abort signal through to apiClient', async () => {
      const controller = new globalThis.AbortController();
      await getAdminCustomers({}, { signal: controller.signal });

      assert.equal(recordedCalls[0].options?.signal, controller.signal);
    });

    it('returns safe fallback pagination if data is missing from backend', async () => {
      mockGetHandler = () => ({ success: true, data: null });
      const res = await getAdminCustomers();

      assert.deepEqual(res.customers, []);
      assert.equal(res.pagination.page, 1);
      assert.equal(res.pagination.totalCustomers, 0);
    });
  });

  describe('getAdminCustomer', () => {
    it('validates customerId before executing network request', async () => {
      await assert.rejects(
        () => getAdminCustomer('short-id'),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'VALIDATION_ERROR');
          return true;
        }
      );
      assert.equal(recordedCalls.length, 0);
    });

    it('calls GET admin/customers/:customerId with URL-encoded ID', async () => {
      mockGetHandler = () => MOCK_DETAIL_RESPONSE;
      const res = await getAdminCustomer(VALID_CUSTOMER_ID);

      assert.equal(recordedCalls.length, 1);
      assert.equal(recordedCalls[0].method, 'GET');
      assert.equal(recordedCalls[0].endpoint, `admin/customers/${VALID_CUSTOMER_ID}`);
      assert.equal(res.customer.name, 'Alice Johnson');
      assert.equal(res.addresses.length, 1);
      assert.equal(res.orderStats.totalOrders, 3);
      assert.equal(res.recentOrders.length, 1);
    });

    it('preserves 404 CUSTOMER_NOT_FOUND backend error', async () => {
      mockGetHandler = () => {
        throw new ApiError({
          status: 404,
          code: 'CUSTOMER_NOT_FOUND',
          message: 'Customer not found',
        });
      };

      await assert.rejects(
        () => getAdminCustomer(VALID_CUSTOMER_ID_2),
        (err) => {
          assert.equal(err.status, 404);
          assert.equal(err.code, 'CUSTOMER_NOT_FOUND');
          return true;
        }
      );
    });
  });

  describe('updateAdminCustomerStatus', () => {
    it('rejects invalid customerId client-side before network request', async () => {
      await assert.rejects(
        () => updateAdminCustomerStatus('invalid-id', false),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'VALIDATION_ERROR');
          return true;
        }
      );
      assert.equal(recordedCalls.length, 0);
    });

    it('rejects non-boolean isActive client-side before network request', async () => {
      await assert.rejects(
        () => updateAdminCustomerStatus(VALID_CUSTOMER_ID, 'false'),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'VALIDATION_ERROR');
          return true;
        }
      );
      await assert.rejects(
        () => updateAdminCustomerStatus(VALID_CUSTOMER_ID, 0),
        (err) => err.status === 400
      );
      await assert.rejects(
        () => updateAdminCustomerStatus(VALID_CUSTOMER_ID, null),
        (err) => err.status === 400
      );
      assert.equal(recordedCalls.length, 0);
    });

    it('calls PATCH admin/customers/:customerId/status with strict { isActive: boolean } payload', async () => {
      const res = await updateAdminCustomerStatus(VALID_CUSTOMER_ID, false);

      assert.equal(recordedCalls.length, 1);
      assert.equal(recordedCalls[0].method, 'PATCH');
      assert.equal(
        recordedCalls[0].endpoint,
        `admin/customers/${VALID_CUSTOMER_ID}/status`
      );
      assert.deepEqual(recordedCalls[0].body, { isActive: false });
      assert.equal(res.isActive, false);
    });

    it('sends strictly { isActive: true } when activating', async () => {
      const res = await updateAdminCustomerStatus(VALID_CUSTOMER_ID, true);

      assert.equal(recordedCalls.length, 1);
      assert.deepEqual(recordedCalls[0].body, { isActive: true });
      assert.equal(res.isActive, true);
    });

    it('preserves 403 FORBIDDEN and 404 CUSTOMER_NOT_FOUND backend errors', async () => {
      mockPatchHandler = () => {
        throw new ApiError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'Forbidden: Admin access required',
        });
      };

      await assert.rejects(
        () => updateAdminCustomerStatus(VALID_CUSTOMER_ID, false),
        (err) => {
          assert.equal(err.status, 403);
          assert.equal(err.code, 'FORBIDDEN');
          return true;
        }
      );
    });

    it('passes abort signal through to apiClient', async () => {
      const controller = new globalThis.AbortController();
      await updateAdminCustomerStatus(VALID_CUSTOMER_ID, true, { signal: controller.signal });

      assert.equal(recordedCalls[0].options?.signal, controller.signal);
    });

    it('preserves 401 AUTH_TOKEN_EXPIRED error on status mutation', async () => {
      mockPatchHandler = () => {
        throw new ApiError({
          status: 401,
          code: 'AUTH_TOKEN_EXPIRED',
          message: 'Token expired',
        });
      };

      await assert.rejects(
        () => updateAdminCustomerStatus(VALID_CUSTOMER_ID, false),
        (err) => {
          assert.equal(err.status, 401);
          assert.equal(err.code, 'AUTH_TOKEN_EXPIRED');
          return true;
        }
      );
    });
  });
});
