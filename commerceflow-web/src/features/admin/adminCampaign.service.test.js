import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, ApiError } from '../../lib/apiClient.js';
import {
  getAdminCampaigns,
  getAdminCampaignById,
  createAdminCampaign,
  updateAdminCampaign,
  updateAdminCampaignStatus,
  deleteAdminCampaign,
  validateObjectId,
  CAMPAIGN_STATUSES,
  CAMPAIGN_BANNER_PLACEMENTS,
} from './adminCampaign.service.js';

describe('Admin Campaign Service Unit Tests', () => {
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

  describe('validateObjectId', () => {
    it('accepts valid 24-character hexadecimal ObjectId', () => {
      assert.doesNotThrow(() => validateObjectId('507f1f77bcf86cd799439011'));
    });

    it('rejects invalid or non-hex string IDs', () => {
      assert.throws(
        () => validateObjectId('camp_123'),
        (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.status === 400
      );
      assert.throws(
        () => validateObjectId(''),
        (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR'
      );
      assert.throws(
        () => validateObjectId(null),
        (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR'
      );
    });
  });

  describe('getAdminCampaigns', () => {
    it('constructs query string correctly and returns campaigns and pagination', async () => {
      let calledUrl = null;
      let capturedOptions = null;

      apiClient.get = async (url, options) => {
        calledUrl = url;
        capturedOptions = options;
        return {
          success: true,
          data: {
            campaigns: [
              {
                _id: '507f1f77bcf86cd799439011',
                name: 'Festive Flash Sale',
                status: 'active',
                bannerPlacement: 'hero_carousel',
                startDate: '2026-11-01T00:00:00.000Z',
                endDate: '2026-11-15T00:00:00.000Z',
              },
            ],
            pagination: {
              page: 1,
              limit: 10,
              totalCampaigns: 1,
              totalPages: 1,
              hasNextPage: false,
              hasPrevPage: false,
            },
          },
        };
      };

      const testSignal = new AbortController().signal;
      const result = await getAdminCampaigns(
        {
          search: 'Festive',
          status: 'active',
          bannerPlacement: 'hero_carousel',
          page: 1,
          limit: 10,
          sortBy: 'startDate',
          sortOrder: 'asc',
        },
        { signal: testSignal }
      );

      assert.ok(calledUrl.startsWith('admin/campaigns?'));
      assert.ok(calledUrl.includes('search=Festive'));
      assert.ok(calledUrl.includes('status=active'));
      assert.ok(calledUrl.includes('bannerPlacement=hero_carousel'));
      assert.ok(calledUrl.includes('page=1'));
      assert.ok(calledUrl.includes('limit=10'));
      assert.ok(calledUrl.includes('sortBy=startDate'));
      assert.ok(calledUrl.includes('sortOrder=asc'));
      assert.equal(capturedOptions.signal, testSignal);
      assert.equal(result.campaigns.length, 1);
      assert.equal(result.campaigns[0].name, 'Festive Flash Sale');
      assert.equal(result.pagination.totalCampaigns, 1);
    });

    it('falls back to safe defaults when backend envelope is empty or minimal', async () => {
      apiClient.get = async () => ({
        success: true,
        data: {},
      });

      const result = await getAdminCampaigns();
      assert.deepEqual(result.campaigns, []);
      assert.equal(result.pagination.page, 1);
      assert.equal(result.pagination.totalCampaigns, 0);
    });
  });

  describe('getAdminCampaignById', () => {
    it('validates ObjectId and retrieves campaign detail', async () => {
      let calledUrl = null;
      apiClient.get = async (url) => {
        calledUrl = url;
        return {
          success: true,
          data: {
            campaign: {
              _id: '507f1f77bcf86cd799439011',
              name: 'Spring Launch',
              status: 'upcoming',
            },
          },
        };
      };

      const campaign = await getAdminCampaignById('507f1f77bcf86cd799439011');
      assert.equal(calledUrl, 'admin/campaigns/507f1f77bcf86cd799439011');
      assert.equal(campaign.name, 'Spring Launch');
    });

    it('rejects invalid ObjectId without dispatching network request', async () => {
      let dispatched = false;
      apiClient.get = async () => {
        dispatched = true;
      };

      await assert.rejects(
        () => getAdminCampaignById('invalid-mongo-id'),
        (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR'
      );
      assert.equal(dispatched, false);
    });
  });

  describe('createAdminCampaign', () => {
    it('validates client-side constraints before dispatching', async () => {
      await assert.rejects(
        () => createAdminCampaign({ name: '' }),
        (err) => err.message.includes('Campaign name is required')
      );

      await assert.rejects(
        () => createAdminCampaign({ name: 'A', startDate: '2026-10-01', endDate: '2026-10-10' }),
        (err) => err.message.includes('at least 2 characters')
      );

      await assert.rejects(
        () => createAdminCampaign({ name: 'Valid Name', startDate: '', endDate: '2026-10-10' }),
        (err) => err.message.includes('Start date is required')
      );

      await assert.rejects(
        () => createAdminCampaign({ name: 'Valid Name', startDate: '2026-10-20', endDate: '2026-10-10' }),
        (err) => err.message.includes('End date must be at or after start date')
      );
    });

    it('sends sanitized payload without unsupported fields', async () => {
      let calledUrl = null;
      let sentPayload = null;

      apiClient.post = async (url, payload) => {
        calledUrl = url;
        sentPayload = payload;
        return {
          success: true,
          data: {
            campaign: {
              _id: '507f1f77bcf86cd799439011',
              ...payload,
            },
          },
        };
      };

      const result = await createAdminCampaign({
        name: '  End of Summer Mega Sale  ',
        objective: '  Boost clearance inventory  ',
        couponCode: '  summer50  ',
        startDate: '2026-09-01',
        endDate: '2026-09-15',
        status: 'active',
        bannerPlacement: 'hero_carousel',
        extraUnsupportedField: 'malicious_override',
        _id: 'fake_id',
      });

      assert.equal(calledUrl, 'admin/campaigns');
      assert.equal(sentPayload.name, 'End of Summer Mega Sale');
      assert.equal(sentPayload.objective, 'Boost clearance inventory');
      assert.equal(sentPayload.couponCode, 'SUMMER50');
      assert.equal(sentPayload.startDate, '2026-09-01');
      assert.equal(sentPayload.endDate, '2026-09-15');
      assert.equal(sentPayload.status, 'active');
      assert.equal(sentPayload.bannerPlacement, 'hero_carousel');
      assert.equal(sentPayload.extraUnsupportedField, undefined);
      assert.equal(sentPayload._id, undefined);
      assert.equal(result.name, 'End of Summer Mega Sale');
    });
  });

  describe('updateAdminCampaign', () => {
    it('validates ObjectId and rejects empty payloads', async () => {
      await assert.rejects(
        () => updateAdminCampaign('invalid-id', { name: 'Valid' }),
        (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR'
      );

      await assert.rejects(
        () => updateAdminCampaign('507f1f77bcf86cd799439011', {}),
        (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR'
      );
    });

    it('validates date coherence on update when both dates are provided', async () => {
      await assert.rejects(
        () =>
          updateAdminCampaign('507f1f77bcf86cd799439011', {
            startDate: '2026-10-25',
            endDate: '2026-10-15',
          }),
        (err) => err.message.includes('End date must be at or after start date')
      );
    });

    it('dispatches PATCH to admin/campaigns/:id with sanitized fields', async () => {
      let calledUrl = null;
      let sentPayload = null;

      apiClient.patch = async (url, payload) => {
        calledUrl = url;
        sentPayload = payload;
        return {
          success: true,
          data: {
            campaign: {
              _id: '507f1f77bcf86cd799439011',
              name: payload.name,
            },
          },
        };
      };

      const result = await updateAdminCampaign('507f1f77bcf86cd799439011', {
        name: '  Updated Diwali Sale  ',
        couponCode: 'diwali30',
      });

      assert.equal(calledUrl, 'admin/campaigns/507f1f77bcf86cd799439011');
      assert.equal(sentPayload.name, 'Updated Diwali Sale');
      assert.equal(sentPayload.couponCode, 'DIWALI30');
      assert.equal(result.name, 'Updated Diwali Sale');
    });
  });

  describe('updateAdminCampaignStatus', () => {
    it('validates status enum and dispatches PATCH to /status endpoint', async () => {
      let calledUrl = null;
      let sentPayload = null;

      apiClient.patch = async (url, payload) => {
        calledUrl = url;
        sentPayload = payload;
        return {
          success: true,
          data: {
            campaign: {
              _id: '507f1f77bcf86cd799439011',
              status: payload.status,
            },
          },
        };
      };

      const res = await updateAdminCampaignStatus('507f1f77bcf86cd799439011', 'ended');
      assert.equal(calledUrl, 'admin/campaigns/507f1f77bcf86cd799439011/status');
      assert.deepEqual(sentPayload, { status: 'ended' });
      assert.equal(res.status, 'ended');
    });

    it('rejects unsupported status enum value', async () => {
      await assert.rejects(
        () => updateAdminCampaignStatus('507f1f77bcf86cd799439011', 'invalid_status'),
        (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR'
      );
    });
  });

  describe('deleteAdminCampaign', () => {
    it('validates ObjectId and dispatches DELETE to /admin/campaigns/:id', async () => {
      let calledUrl = null;

      apiClient.delete = async (url) => {
        calledUrl = url;
        return {
          success: true,
          message: "Campaign 'Festive Sale' deleted successfully",
          data: { id: '507f1f77bcf86cd799439011' },
        };
      };

      const res = await deleteAdminCampaign('507f1f77bcf86cd799439011');
      assert.equal(calledUrl, 'admin/campaigns/507f1f77bcf86cd799439011');
      assert.equal(res.id, '507f1f77bcf86cd799439011');
    });
  });

  describe('API error propagation', () => {
    it('surfaces backend ApiError without masking or converting to empty success', async () => {
      apiClient.get = async () => {
        throw new ApiError({
          message: 'Unauthorized access',
          status: 401,
          code: 'UNAUTHORIZED',
        });
      };

      await assert.rejects(
        () => getAdminCampaigns(),
        (err) => err instanceof ApiError && err.status === 401 && err.code === 'UNAUTHORIZED'
      );
    });
  });
});
