import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient } from '../../lib/apiClient.js';
import {
  getAdminAuditLogs,
  VALID_AUDIT_EVENT_TYPES,
  clearAdminAuditInFlightRequests,
} from './adminAudit.service.js';

describe('adminAudit.service Unit Tests', () => {
  let originalGet;

  beforeEach(() => {
    originalGet = apiClient.get;
    clearAdminAuditInFlightRequests();
  });

  afterEach(() => {
    apiClient.get = originalGet;
    clearAdminAuditInFlightRequests();
  });

  describe('VALID_AUDIT_EVENT_TYPES', () => {
    it('defines supported audit event types including all, product, inventory, and order events', () => {
      assert.ok(VALID_AUDIT_EVENT_TYPES.includes('all'));
      assert.ok(VALID_AUDIT_EVENT_TYPES.includes('PRODUCT_CREATED'));
      assert.ok(VALID_AUDIT_EVENT_TYPES.includes('INVENTORY_ADJUSTED'));
      assert.ok(VALID_AUDIT_EVENT_TYPES.includes('ORDER_STATUS_UPDATED'));
    });
  });

  describe('getAdminAuditLogs', () => {
    it('fetches and returns audit logs and pagination with default parameters', async () => {
      const mockPayload = {
        data: {
          auditLogs: [
            {
              id: 'log_1',
              eventType: 'PRODUCT_CREATED',
              actorEmail: 'admin@commerceflow.com',
              createdAt: '2026-10-10T12:00:00Z',
            },
          ],
          pagination: {
            page: 1,
            limit: 10,
            total: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPrevPage: false,
          },
        },
      };

      apiClient.get = async (url) => {
        assert.equal(url, 'admin/audit-logs');
        return mockPayload;
      };

      const result = await getAdminAuditLogs();
      assert.equal(result.auditLogs.length, 1);
      assert.equal(result.auditLogs[0].id, 'log_1');
      assert.equal(result.pagination.total, 1);
    });

    it('serializes query parameters properly for filtering', async () => {
      let requestedUrl = null;
      apiClient.get = async (url) => {
        requestedUrl = url;
        return { data: { auditLogs: [], pagination: {} } };
      };

      await getAdminAuditLogs({
        page: 2,
        limit: 5,
        eventType: 'PRODUCT_CREATED',
        actorUserId: '507f1f77bcf86cd799439011',
      });

      assert.ok(requestedUrl.includes('page=2'), 'must include page=2');
      assert.ok(requestedUrl.includes('limit=5'), 'must include limit=5');
      assert.ok(requestedUrl.includes('eventType=PRODUCT_CREATED'), 'must include eventType');
      assert.ok(requestedUrl.includes('actorUserId=507f1f77bcf86cd799439011'), 'must include actorUserId');
    });

    it('deduplicates concurrent in-flight requests with identical query parameters', async () => {
      let callCount = 0;
      apiClient.get = async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          data: {
            auditLogs: [{ id: 'dedupe_1' }],
            pagination: { page: 1, limit: 5, total: 1 },
          },
        };
      };

      const [res1, res2] = await Promise.all([
        getAdminAuditLogs({ limit: 5 }),
        getAdminAuditLogs({ limit: 5 }),
      ]);

      assert.equal(callCount, 1, 'Concurrent calls with identical params must share single network request');
      assert.equal(res1.auditLogs.length, 1);
      assert.equal(res2.auditLogs.length, 1);
    });

    it('gracefully handles missing backend data with safe fallback empty arrays and pagination', async () => {
      apiClient.get = async () => ({ data: null });

      const result = await getAdminAuditLogs();
      assert.deepEqual(result.auditLogs, []);
      assert.equal(result.pagination.total, 0);
      assert.equal(result.pagination.page, 1);
    });
  });
});
