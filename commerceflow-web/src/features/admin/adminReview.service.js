import { apiClient } from '../../lib/apiClient.js';

export const adminReviewService = {
  /**
   * Retrieves paginated admin reviews across the catalog
   */
  async getAdminReviews({ status = 'all', rating, search = '', page = 1, limit = 20 } = {}) {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.append('status', status);
    if (rating && rating !== 'all') params.append('rating', String(rating));
    if (search && search.trim()) params.append('search', search.trim());
    params.append('page', String(page));
    params.append('limit', String(limit));

    const response = await apiClient.get(`admin/reviews?${params.toString()}`);
    return response?.data || { reviews: [], pagination: { totalReviews: 0, totalPages: 1 } };
  },

  /**
   * Updates moderation status of a review (published, hidden, flagged)
   */
  async updateReviewStatus(reviewId, status) {
    const response = await apiClient.patch(`admin/reviews/${reviewId}/status`, { status });
    return response?.data?.review;
  },

  /**
   * Deletes a review permanently
   */
  async deleteReview(reviewId) {
    const response = await apiClient.delete(`admin/reviews/${reviewId}`);
    return response?.data;
  }
};

export default adminReviewService;
