import React from 'react';
import recentlyViewedContextModule from './RecentlyViewedContext.jsx';

const RecentlyViewedContext =
  recentlyViewedContextModule?.RecentlyViewedContext ||
  recentlyViewedContextModule?.default?.RecentlyViewedContext ||
  recentlyViewedContextModule?.default ||
  recentlyViewedContextModule;


/**
 * Custom hook to access recently viewed products state and actions.
 * @returns {{
 *   recentlyViewed: Array<{ viewedAt: string|null, product: Object }>,
 *   isLoading: boolean,
 *   isRecording: boolean,
 *   error: Error|null,
 *   recordRecentlyViewed: (productId: string) => Promise<void>,
 *   refreshRecentlyViewed: () => Promise<void>,
 *   clearRecentlyViewed: () => Promise<void>
 * }}
 * @throws {Error} If invoked outside of a <RecentlyViewedProvider>
 */
export function useRecentlyViewed() {
  const context = React.useContext(RecentlyViewedContext);

  if (!context) {
    throw new Error('useRecentlyViewed must be used within a <RecentlyViewedProvider>');
  }

  return context;
}

export default useRecentlyViewed;
