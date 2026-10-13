import { useContext } from 'react';
import wishlistContextModule from './wishlist.context.jsx';

const WishlistContext =
  wishlistContextModule?.WishlistContext ||
  wishlistContextModule?.default ||
  wishlistContextModule;

/**
 * Custom hook to access the central wishlist state and actions.
 *
 * @returns {{
 *   wishlist: { items: Array<Object>, totalItems: number },
 *   isLoading: boolean,
 *   isMutating: boolean,
 *   error: Error|null,
 *   refreshWishlist: () => Promise<void>,
 *   addToWishlist: (productId: string) => Promise<void>,
 *   removeFromWishlist: (productId: string) => Promise<void>,
 *   toggleWishlist: (productOrId: Object|string) => Promise<void>,
 *   clearWishlist: () => Promise<void>,
 *   isWishlisted: (productId: string) => boolean,
 *   isProductMutating: (productId: string) => boolean,
 * }}
 * @throws {Error} If invoked outside of a <WishlistProvider>
 */
export function useWishlist() {
  const context = useContext(WishlistContext);

  if (!context) {
    throw new Error('useWishlist must be used within a <WishlistProvider>');
  }

  return context;
}

export default useWishlist;
