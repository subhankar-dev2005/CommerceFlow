import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adminReviewService } from './adminReview.service.js';
import { apiClient } from '../../lib/apiClient.js';

describe('adminReviewService Unit Tests', () => {
  it('calls admin/reviews with status and rating query parameters', async () => {
    let capturedUrl = null;
    const originalGet = apiClient.get;
    apiClient.get = async (url) => {
      capturedUrl = url;
      return {
        data: {
          reviews: [
            {
              _id: 'rev_123',
              rating: 5,
              title: 'Great piece',
              body: 'Super comfy',
              status: 'published'
            }
          ],
          pagination: { totalReviews: 1, totalPages: 1, page: 1, limit: 20 }
        }
      };
    };

    try {
      const result = await adminReviewService.getAdminReviews({
        status: 'published',
        rating: 5,
        search: 'comfy'
      });

      assert.ok(capturedUrl.startsWith('admin/reviews?'));
      assert.ok(capturedUrl.includes('status=published'));
      assert.ok(capturedUrl.includes('rating=5'));
      assert.ok(capturedUrl.includes('search=comfy'));
      assert.equal(result.reviews.length, 1);
      assert.equal(result.reviews[0]._id, 'rev_123');
    } finally {
      apiClient.get = originalGet;
    }
  });

  it('calls PATCH admin/reviews/:id/status to update review status', async () => {
    let capturedUrl = null;
    let capturedBody = null;
    const originalPatch = apiClient.patch;
    apiClient.patch = async (url, body) => {
      capturedUrl = url;
      capturedBody = body;
      return {
        data: {
          review: { _id: 'rev_123', status: 'hidden' }
        }
      };
    };

    try {
      const updated = await adminReviewService.updateReviewStatus('rev_123', 'hidden');

      assert.equal(capturedUrl, 'admin/reviews/rev_123/status');
      assert.deepEqual(capturedBody, { status: 'hidden' });
      assert.equal(updated.status, 'hidden');
    } finally {
      apiClient.patch = originalPatch;
    }
  });

  it('calls DELETE admin/reviews/:id to delete review', async () => {
    let capturedUrl = null;
    const originalDelete = apiClient.delete;
    apiClient.delete = async (url) => {
      capturedUrl = url;
      return {
        data: { reviewId: 'rev_123' }
      };
    };

    try {
      const res = await adminReviewService.deleteReview('rev_123');

      assert.equal(capturedUrl, 'admin/reviews/rev_123');
      assert.equal(res.reviewId, 'rev_123');
    } finally {
      apiClient.delete = originalDelete;
    }
  });
});
