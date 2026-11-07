import { apiClient, ApiError } from '../../lib/apiClient.js';

export const CAMPAIGN_STATUSES = ['active', 'upcoming', 'ended'];

export const CAMPAIGN_BANNER_PLACEMENTS = [
  'hero_carousel',
  'category_top',
  'promotional_strip',
  'storefront_footer',
];

/**
 * Validate that an ID is a valid 24-character hexadecimal MongoDB ObjectId.
 *
 * @param {string} id
 * @param {string} [fieldName='campaign ID']
 */
export function validateObjectId(id, fieldName = 'campaign ID') {
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
 * Fetch paginated administrative campaigns with optional filtering and sorting.
 * Consumes: GET /api/v1/admin/campaigns
 *
 * @param {Object} [params={}]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {string} [params.search]
 * @param {'all'|'active'|'upcoming'|'ended'} [params.status='all']
 * @param {'all'|'hero_carousel'|'category_top'|'promotional_strip'|'storefront_footer'} [params.bannerPlacement='all']
 * @param {'createdAt'|'startDate'|'endDate'|'name'|'status'} [params.sortBy='createdAt']
 * @param {'asc'|'desc'} [params.sortOrder='desc']
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ campaigns: Array<Object>, pagination: Object }>}
 */
export async function getAdminCampaigns(params = {}, { signal } = {}) {
  const queryParts = [];

  const addParam = (key, val) => {
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val).trim())}`);
    }
  };

  if (params.page !== undefined) addParam('page', params.page);
  if (params.limit !== undefined) addParam('limit', params.limit);
  if (params.search) addParam('search', params.search);
  if (params.status && params.status !== 'all') addParam('status', params.status);
  if (params.bannerPlacement && params.bannerPlacement !== 'all') addParam('bannerPlacement', params.bannerPlacement);
  if (params.sortBy) addParam('sortBy', params.sortBy);
  if (params.sortOrder) addParam('sortOrder', params.sortOrder);

  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const response = await apiClient.get(`admin/campaigns${queryString}`, { signal });

  const data = response?.data || {};
  return {
    campaigns: Array.isArray(data.campaigns) ? data.campaigns : [],
    pagination: data.pagination || {
      page: 1,
      limit: params.limit || 10,
      totalCampaigns: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    },
  };
}

/**
 * Fetch a single administrative campaign by its ObjectId.
 * Consumes: GET /api/v1/admin/campaigns/:campaignId
 *
 * @param {string} campaignId
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Object>}
 */
export async function getAdminCampaignById(campaignId, { signal } = {}) {
  validateObjectId(campaignId, 'campaignId');
  const cleanId = campaignId.trim();
  const response = await apiClient.get(`admin/campaigns/${cleanId}`, { signal });
  return response?.data?.campaign;
}

/**
 * Create a new marketing campaign.
 * Consumes: POST /api/v1/admin/campaigns
 *
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function createAdminCampaign(payload = {}) {
  if (!payload || !payload.name || !payload.name.trim()) {
    throw new ApiError({
      message: 'Campaign name is required',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'name', message: 'Campaign name is required' }],
    });
  }

  const trimmedName = payload.name.trim();
  if (trimmedName.length < 2) {
    throw new ApiError({
      message: 'Campaign name must contain at least 2 characters',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'name', message: 'Campaign name must contain at least 2 characters' }],
    });
  }

  if (trimmedName.length > 150) {
    throw new ApiError({
      message: 'Campaign name cannot exceed 150 characters',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'name', message: 'Campaign name cannot exceed 150 characters' }],
    });
  }

  if (!payload.startDate) {
    throw new ApiError({
      message: 'Start date is required',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'startDate', message: 'Start date is required' }],
    });
  }

  if (!payload.endDate) {
    throw new ApiError({
      message: 'End date is required',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'endDate', message: 'End date is required' }],
    });
  }

  const startTime = new Date(payload.startDate).getTime();
  const endTime = new Date(payload.endDate).getTime();

  if (Number.isNaN(startTime)) {
    throw new ApiError({
      message: 'Start date must be a valid calendar date',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'startDate', message: 'Start date must be a valid calendar date' }],
    });
  }

  if (Number.isNaN(endTime)) {
    throw new ApiError({
      message: 'End date must be a valid calendar date',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'endDate', message: 'End date must be a valid calendar date' }],
    });
  }

  if (endTime < startTime) {
    throw new ApiError({
      message: 'End date must be at or after start date',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'endDate', message: 'End date must be at or after start date' }],
    });
  }

  const sanitized = {
    name: trimmedName,
    startDate: payload.startDate,
    endDate: payload.endDate,
  };

  if (payload.objective !== undefined && payload.objective !== null) {
    sanitized.objective = String(payload.objective).trim();
  }

  if (payload.couponCode !== undefined && payload.couponCode !== null) {
    const trimmedCoupon = String(payload.couponCode).trim().toUpperCase();
    if (trimmedCoupon) {
      sanitized.couponCode = trimmedCoupon;
    }
  }

  if (payload.status && CAMPAIGN_STATUSES.includes(payload.status)) {
    sanitized.status = payload.status;
  }

  if (payload.bannerPlacement && CAMPAIGN_BANNER_PLACEMENTS.includes(payload.bannerPlacement)) {
    sanitized.bannerPlacement = payload.bannerPlacement;
  }

  const response = await apiClient.post('admin/campaigns', sanitized);
  return response?.data?.campaign;
}

/**
 * Update configuration fields of an existing campaign.
 * Consumes: PATCH /api/v1/admin/campaigns/:campaignId
 *
 * @param {string} campaignId
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function updateAdminCampaign(campaignId, payload = {}) {
  validateObjectId(campaignId, 'campaignId');
  const cleanId = campaignId.trim();

  const sanitized = {};

  if (payload.name !== undefined) {
    const trimmed = String(payload.name).trim();
    if (trimmed.length < 2) {
      throw new ApiError({
        message: 'Campaign name must contain at least 2 characters',
        status: 400,
        code: 'VALIDATION_ERROR',
        details: [{ field: 'name', message: 'Campaign name must contain at least 2 characters' }],
      });
    }
    sanitized.name = trimmed;
  }

  if (payload.objective !== undefined) {
    sanitized.objective = payload.objective ? String(payload.objective).trim() : '';
  }

  if (payload.couponCode !== undefined) {
    sanitized.couponCode = payload.couponCode ? String(payload.couponCode).trim().toUpperCase() : null;
  }

  if (payload.startDate !== undefined) {
    const startTime = new Date(payload.startDate).getTime();
    if (Number.isNaN(startTime)) {
      throw new ApiError({
        message: 'Start date must be a valid calendar date',
        status: 400,
        code: 'VALIDATION_ERROR',
        details: [{ field: 'startDate', message: 'Start date must be a valid calendar date' }],
      });
    }
    sanitized.startDate = payload.startDate;
  }

  if (payload.endDate !== undefined) {
    const endTime = new Date(payload.endDate).getTime();
    if (Number.isNaN(endTime)) {
      throw new ApiError({
        message: 'End date must be a valid calendar date',
        status: 400,
        code: 'VALIDATION_ERROR',
        details: [{ field: 'endDate', message: 'End date must be a valid calendar date' }],
      });
    }
    sanitized.endDate = payload.endDate;
  }

  if (payload.startDate && payload.endDate) {
    const start = new Date(payload.startDate).getTime();
    const end = new Date(payload.endDate).getTime();
    if (end < start) {
      throw new ApiError({
        message: 'End date must be at or after start date',
        status: 400,
        code: 'VALIDATION_ERROR',
        details: [{ field: 'endDate', message: 'End date must be at or after start date' }],
      });
    }
  }

  if (payload.status !== undefined) {
    if (!CAMPAIGN_STATUSES.includes(payload.status)) {
      throw new ApiError({
        message: `Status must be one of: ${CAMPAIGN_STATUSES.join(', ')}`,
        status: 400,
        code: 'VALIDATION_ERROR',
        details: [{ field: 'status', message: 'Invalid status value' }],
      });
    }
    sanitized.status = payload.status;
  }

  if (payload.bannerPlacement !== undefined) {
    if (!CAMPAIGN_BANNER_PLACEMENTS.includes(payload.bannerPlacement)) {
      throw new ApiError({
        message: `Banner placement must be one of: ${CAMPAIGN_BANNER_PLACEMENTS.join(', ')}`,
        status: 400,
        code: 'VALIDATION_ERROR',
        details: [{ field: 'bannerPlacement', message: 'Invalid banner placement value' }],
      });
    }
    sanitized.bannerPlacement = payload.bannerPlacement;
  }

  if (Object.keys(sanitized).length === 0) {
    throw new ApiError({
      message: 'At least one field must be provided for update',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'payload', message: 'Empty update payload' }],
    });
  }

  const response = await apiClient.patch(`admin/campaigns/${cleanId}`, sanitized);
  return response?.data?.campaign;
}

/**
 * Update the lifecycle status of a campaign.
 * Consumes: PATCH /api/v1/admin/campaigns/:campaignId/status
 *
 * @param {string} campaignId
 * @param {'active'|'upcoming'|'ended'} status
 * @returns {Promise<Object>}
 */
export async function updateAdminCampaignStatus(campaignId, status) {
  validateObjectId(campaignId, 'campaignId');
  const cleanId = campaignId.trim();

  if (!status || !CAMPAIGN_STATUSES.includes(status)) {
    throw new ApiError({
      message: `Status must be one of: ${CAMPAIGN_STATUSES.join(', ')}`,
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'status', message: 'Invalid campaign status' }],
    });
  }

  const response = await apiClient.patch(`admin/campaigns/${cleanId}/status`, { status });
  return response?.data?.campaign;
}

/**
 * Delete a campaign record.
 * Consumes: DELETE /api/v1/admin/campaigns/:campaignId
 *
 * @param {string} campaignId
 * @returns {Promise<Object>}
 */
export async function deleteAdminCampaign(campaignId) {
  validateObjectId(campaignId, 'campaignId');
  const cleanId = campaignId.trim();
  const response = await apiClient.delete(`admin/campaigns/${cleanId}`);
  return response?.data || response;
}

export const adminCampaignService = {
  getAdminCampaigns,
  getAdminCampaignById,
  createAdminCampaign,
  updateAdminCampaign,
  updateAdminCampaignStatus,
  deleteAdminCampaign,
  validateObjectId,
  CAMPAIGN_STATUSES,
  CAMPAIGN_BANNER_PLACEMENTS,
};

export default adminCampaignService;
