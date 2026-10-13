/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../auth/useAuth.js';
import {
  createOrder as apiCreateOrder,
  getOrders as apiGetOrders,
  getOrderById as apiGetOrderById,
  cancelOrder as apiCancelOrder,
} from './order.service.js';
import { ApiError } from '../../lib/apiClient.js';

const INITIAL_PAGINATION = {
  page: 1,
  limit: 10,
  totalOrders: 0,
  totalPages: 1,
};

export const OrderContext = createContext(null);

export function OrderProvider({ children }) {
  const { isAuthenticated } = useAuth();

  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState(INITIAL_PAGINATION);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const [error, setError] = useState(null);
  const [detailError, setDetailError] = useState(null);

  // Mutex lock to serialize and protect against overlapping order mutations
  const isMutatingRef = useRef(false);
  const prevAuthRef = useRef(isAuthenticated);
  const ordersReqSeqRef = useRef(0);
  const detailReqSeqRef = useRef(0);

  // Authentication Lifecycle:
  // When session ends/expires, immediately clear orders, pagination, selected order, and errors.
  // Note: We do NOT automatically fetch orders on login/mount; orders are loaded on demand.
  useEffect(() => {
    if (prevAuthRef.current && !isAuthenticated) {
      ordersReqSeqRef.current += 1;
      detailReqSeqRef.current += 1;
      setOrders([]);
      setPagination(INITIAL_PAGINATION);
      setSelectedOrder(null);
      setError(null);
      setDetailError(null);
      isMutatingRef.current = false;
    }
    prevAuthRef.current = isAuthenticated;
  }, [isAuthenticated]);

  /**
   * Fetch paginated orders for the authenticated user.
   *
   * @param {Object} [params] - Query parameters (page, limit, status, sortOrder)
   * @returns {Promise<{ orders: Array<Object>, pagination: Object }>}
   */
  const refreshOrders = useCallback(
    async (params) => {
      if (!isAuthenticated) {
        setOrders([]);
        setPagination(INITIAL_PAGINATION);
        setError(null);
        return { orders: [], pagination: INITIAL_PAGINATION };
      }

      const reqId = ++ordersReqSeqRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const data = await apiGetOrders(params);
        if (reqId === ordersReqSeqRef.current) {
          setOrders(data.orders);
          setPagination(data.pagination);
        }
        return data;
      } catch (err) {
        if (reqId === ordersReqSeqRef.current) {
          setError(err);
        }
        throw err;
      } finally {
        if (reqId === ordersReqSeqRef.current) {
          setIsLoading(false);
        }
      }
    },
    [isAuthenticated]
  );

  /**
   * Fetch detailed information for a single order by ID.
   *
   * @param {string} orderId - 24-character hex order ID
   * @returns {Promise<Object>} Populated order document
   */
  const getOrderById = useCallback(
    async (orderId) => {
      if (!isAuthenticated) {
        const authError = new ApiError({
          message: 'Please sign in to view order details',
          status: 401,
          code: 'AUTH_REQUIRED',
        });
        setDetailError(authError);
        throw authError;
      }

      const reqId = ++detailReqSeqRef.current;
      setIsLoadingDetail(true);
      setDetailError(null);

      try {
        const order = await apiGetOrderById(orderId);
        if (reqId === detailReqSeqRef.current) {
          setSelectedOrder(order);
        }
        return order;
      } catch (err) {
        if (reqId === detailReqSeqRef.current) {
          setDetailError(err);
        }
        throw err;
      } finally {
        if (reqId === detailReqSeqRef.current) {
          setIsLoadingDetail(false);
        }
      }
    },
    [isAuthenticated]
  );

  /**
   * Create a new order with the selected delivery address.
   *
   * SERVER AUTHORITY RULES:
   * - Frontend sends ONLY addressId.
   * - Backend reads cart, checks stock, computes subtotal, and clears the cart.
   * - Frontend does NOT calculate subtotal, total, or clear cart manually.
   * - Frontend does NOT create a payment order here.
   *
   * @param {string} addressId - 24-character hex address ID
   * @param {string|null} [couponCode] - Optional applied coupon code
   * @returns {Promise<Object>} Created order document
   */
  const createOrder = useCallback(
    async (addressId, couponCode = null) => {
      if (!isAuthenticated) {
        const authError = new ApiError({
          message: 'Please sign in to place an order',
          status: 401,
          code: 'AUTH_REQUIRED',
        });
        setError(authError);
        throw authError;
      }

      if (isMutatingRef.current) {
        const conflictError = new ApiError({
          status: 409,
          code: 'ORDER_MUTATION_IN_PROGRESS',
          message: 'An order operation is already in progress.',
        });
        throw conflictError;
      }

      isMutatingRef.current = true;
      setIsMutating(true);
      setError(null);

      try {
        const createdOrder = await apiCreateOrder(addressId, couponCode);
        return createdOrder;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        isMutatingRef.current = false;
        setIsMutating(false);
      }
    },
    [isAuthenticated]
  );

  /**
   * Cancel an order owned by the user.
   *
   * SERVER AUTHORITY RULES:
   * - Backend validates status and restores inventory stock automatically.
   * - Frontend relies on server response for final order status.
   *
   * @param {string} orderId - 24-character hex order ID
   * @param {Object} [cancellationData] - Optional { reason, reasonDetail }
   * @returns {Promise<Object>} Updated order document
   */
  const cancelOrder = useCallback(
    async (orderId, cancellationData = {}) => {
      if (!isAuthenticated) {
        const authError = new ApiError({
          message: 'Please sign in to cancel an order',
          status: 401,
          code: 'AUTH_REQUIRED',
        });
        setError(authError);
        throw authError;
      }

      if (isMutatingRef.current) {
        const conflictError = new ApiError({
          status: 409,
          code: 'ORDER_MUTATION_IN_PROGRESS',
          message: 'An order operation is already in progress.',
        });
        throw conflictError;
      }

      isMutatingRef.current = true;
      setIsMutating(true);
      setError(null);

      try {
        const updatedOrder = await apiCancelOrder(orderId, cancellationData);

        // Update selected order in state if it matches the cancelled order
        setSelectedOrder((prev) => (prev && prev._id === orderId ? updatedOrder : prev));

        // Update order in list if currently loaded
        setOrders((prev) =>
          prev.map((ord) => (ord._id === orderId ? updatedOrder : ord))
        );

        return updatedOrder;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        isMutatingRef.current = false;
        setIsMutating(false);
      }
    },
    [isAuthenticated]
  );

  // Guarantee memory isolation for unauthenticated state
  const activeOrders = isAuthenticated ? orders : [];
  const activePagination = isAuthenticated ? pagination : INITIAL_PAGINATION;
  const activeSelectedOrder = isAuthenticated ? selectedOrder : null;
  const activeError = isAuthenticated ? error : null;
  const activeDetailError = isAuthenticated ? detailError : null;

  const value = {
    orders: activeOrders,
    pagination: activePagination,
    selectedOrder: activeSelectedOrder,
    isLoading,
    isLoadingDetail,
    isMutating,
    error: activeError,
    detailError: activeDetailError,
    createOrder,
    refreshOrders,
    getOrderById,
    cancelOrder,
  };

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
}

export default OrderContext;
