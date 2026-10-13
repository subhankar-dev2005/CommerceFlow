import { useContext } from 'react';
import { OrderContext } from './order.context.jsx';

/**
 * Custom hook to access central order state and operations.
 *
 * @returns {{
 *   orders: Array<Object>,
 *   pagination: { page: number, limit: number, totalOrders: number, totalPages: number },
 *   selectedOrder: Object|null,
 *   isLoading: boolean,
 *   isLoadingDetail: boolean,
 *   isMutating: boolean,
 *   error: Error|null,
 *   detailError: Error|null,
 *   createOrder: (addressId: string) => Promise<Object>,
 *   refreshOrders: (params?: Object) => Promise<{ orders: Array<Object>, pagination: Object }>,
 *   getOrderById: (orderId: string) => Promise<Object>,
 *   cancelOrder: (orderId: string) => Promise<Object>
 * }}
 * @throws {Error} If invoked outside of an <OrderProvider>
 */
export function useOrder() {
  const context = useContext(OrderContext);

  if (!context) {
    throw new Error('useOrder must be used within an <OrderProvider>');
  }

  return context;
}

export default useOrder;
