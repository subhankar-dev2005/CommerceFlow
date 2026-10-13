/**
 * Recently Viewed Products - Constants & Configuration
 * Production limits and retention periods for P1.4.
 */

export const DEFAULT_RECENTLY_VIEWED_LIMIT = 10;
export const MAX_RECENTLY_VIEWED_LIMIT = 20;
export const MAX_STORED_RECENTLY_VIEWED = 12;
export const RECENTLY_VIEWED_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days retention
