import { useContext } from 'react';
import cartContextModule from './cart.context.jsx';

const CartContext = cartContextModule?.CartContext || cartContextModule?.default || cartContextModule;

/**
 * Custom hook to access the central cart state and actions.
 *
 * @returns {{
 *   cart: Object|null,
 *   totals: { itemCount: number, totalQuantity: number, subtotal: number },
 *   isLoading: boolean,
 *   isMutating: boolean,
 *   error: Error|null,
 *   refreshCart: () => Promise<Object>,
 *   addToCart: (productId: string, quantity?: number) => Promise<Object>,
 *   updateQuantity: (productId: string, quantity: number) => Promise<Object>,
 *   removeItem: (productId: string) => Promise<Object>,
 *   clearCart: () => Promise<Object>
 * }}
 * @throws {Error} If invoked outside of a <CartProvider>
 */
export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error('useCart must be used within a <CartProvider>');
  }

  return context;
}

export default useCart;
