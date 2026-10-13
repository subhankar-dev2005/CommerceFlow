/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../auth/useAuth.js';
import {
  loadRazorpaySdk,
  createPaymentOrder as apiCreatePaymentOrder,
  verifyPayment as apiVerifyPayment,
} from './payment.service.js';
import { ApiError } from '../../lib/apiClient.js';

export const PaymentContext = createContext(null);

export function PaymentProvider({ children }) {
  const { user, isAuthenticated } = useAuth();

  const [paymentOrder, setPaymentOrder] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [isCreatingPaymentOrder, setIsCreatingPaymentOrder] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isVerificationUncertain, setIsVerificationUncertain] = useState(false);

  const [error, setError] = useState(null);
  const [verificationError, setVerificationError] = useState(null);

  // Synchronous mutex lock to serialize and protect all payment operations
  const isOperatingRef = useRef(false);
  const prevAuthRef = useRef(isAuthenticated);

  // Authentication Lifecycle:
  // Clear all sensitive payment state when user logs out or session expires.
  useEffect(() => {
    if (prevAuthRef.current && !isAuthenticated) {
      setPaymentOrder(null);
      setPaymentStatus(null);
      setError(null);
      setVerificationError(null);
      setIsCreatingPaymentOrder(false);
      setIsVerifyingPayment(false);
      setIsCheckoutOpen(false);
      setIsVerificationUncertain(false);
      isOperatingRef.current = false;
    }
    prevAuthRef.current = isAuthenticated;
  }, [isAuthenticated]);

  /**
   * Reset local error and transient states.
   */
  const resetPaymentState = useCallback(() => {
    setError(null);
    setVerificationError(null);
    setIsVerificationUncertain(false);
  }, []);

  /**
   * Create or fetch backend-authoritative Razorpay payment order for an existing CommerceFlow order.
   *
   * @param {string} orderId - 24-character hex CommerceFlow order ID
   * @returns {Promise<{ razorpayOrderId: string, amount: number, currency: string, keyId: string }>}
   */
  const createPaymentOrder = useCallback(
    async (orderId) => {
      if (!isAuthenticated) {
        const authError = new ApiError({
          message: 'Please sign in to proceed with payment',
          status: 401,
          code: 'AUTH_REQUIRED',
        });
        setError(authError);
        throw authError;
      }

      if (isOperatingRef.current) {
        const conflictError = new ApiError({
          status: 409,
          code: 'PAYMENT_OPERATION_IN_PROGRESS',
          message: 'A payment operation is already in progress.',
        });
        throw conflictError;
      }

      isOperatingRef.current = true;
      setIsCreatingPaymentOrder(true);
      setError(null);

      try {
        const data = await apiCreatePaymentOrder(orderId);
        setPaymentOrder(data);
        return data;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        isOperatingRef.current = false;
        setIsCreatingPaymentOrder(false);
      }
    },
    [isAuthenticated]
  );

  /**
   * Submit Razorpay payment signature identifiers to the backend for cryptographic verification.
   *
   * @param {string} orderId - 24-character hex CommerceFlow order ID
   * @param {Object} paymentResponse - Identifiers from Razorpay checkout
   * @returns {Promise<{ orderId: string, paymentStatus: string, transactionId: string, orderStatus: string }>}
   */
  const verifyPayment = useCallback(
    async (orderId, paymentResponse) => {
      if (!isAuthenticated) {
        const authError = new ApiError({
          message: 'Please sign in to verify payment',
          status: 401,
          code: 'AUTH_REQUIRED',
        });
        setVerificationError(authError);
        throw authError;
      }

      if (isOperatingRef.current) {
        const conflictError = new ApiError({
          status: 409,
          code: 'PAYMENT_OPERATION_IN_PROGRESS',
          message: 'A payment verification operation is already in progress.',
        });
        throw conflictError;
      }

      isOperatingRef.current = true;
      setIsVerifyingPayment(true);
      setVerificationError(null);
      setIsVerificationUncertain(false);

      try {
        const data = await apiVerifyPayment(orderId, paymentResponse);
        if (data?.paymentStatus) {
          setPaymentStatus(data.paymentStatus);
        }
        return data;
      } catch (err) {
        // If network error occurred, mark uncertainty so user is not misled to believe payment failed
        if (err?.code === 'NETWORK_ERROR' || err?.status === 0) {
          setIsVerificationUncertain(true);
        }
        setVerificationError(err);
        throw err;
      } finally {
        isOperatingRef.current = false;
        setIsVerifyingPayment(false);
      }
    },
    [isAuthenticated]
  );

  /**
   * Open official Razorpay Checkout modal for an order.
   * Handles SDK loading, payment order creation/reuse, modal lifecycle, and verification.
   *
   * @param {Object} order - Full CommerceFlow order object
   * @param {Object} [callbacks] - Optional event callbacks
   * @param {Function} [callbacks.onSuccess] - Invoked only after backend verification succeeds
   * @param {Function} [callbacks.onDismiss] - Invoked when customer closes checkout modal
   * @param {Function} [callbacks.onError] - Invoked if initiation or verification fails
   */
  const openCheckout = useCallback(
    async (order, callbacks = {}) => {
      if (!order?._id) {
        const err = new ApiError({
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'Valid order is required to launch payment checkout.',
        });
        setError(err);
        callbacks.onError?.(err);
        return;
      }

      if (!isAuthenticated) {
        const authError = new ApiError({
          message: 'Please sign in to initiate payment',
          status: 401,
          code: 'AUTH_REQUIRED',
        });
        setError(authError);
        callbacks.onError?.(authError);
        return;
      }

      if (isOperatingRef.current) {
        const conflictError = new ApiError({
          status: 409,
          code: 'PAYMENT_OPERATION_IN_PROGRESS',
          message: 'A payment operation is already in progress.',
        });
        setError(conflictError);
        callbacks.onError?.(conflictError);
        return;
      }

      resetPaymentState();

      try {
        // Step 1: Ensure Razorpay SDK is loaded
        await loadRazorpaySdk();

        // Step 2: Create or retrieve backend Razorpay payment order
        // Backend determines amount and currency; frontend never calculates them
        const paymentData = await createPaymentOrder(order._id);

        if (!paymentData?.razorpayOrderId) {
          throw new ApiError({
            status: 500,
            code: 'PAYMENT_INITIALIZATION_FAILED',
            message: 'Invalid payment order received from server.',
          });
        }

        const keyId =
          paymentData.keyId ||
          (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RAZORPAY_KEY_ID);

        if (!keyId) {
          throw new ApiError({
            status: 500,
            code: 'CONFIGURATION_ERROR',
            message: 'Razorpay Key ID is not configured.',
          });
        }

        setIsCheckoutOpen(true);

        // Step 3: Configure Razorpay Checkout options with server-authoritative values
        const rzpOptions = {
          key: keyId,
          amount: paymentData.amount, // Authoritative paise from backend
          currency: paymentData.currency || 'INR',
          name: 'CommerceFlow',
          description: `Order #${order._id}`,
          order_id: paymentData.razorpayOrderId,
          prefill: {
            name: order.shippingAddress?.fullName || user?.name || '',
            contact: order.shippingAddress?.phone || user?.phone || '',
            email: user?.email || '',
          },
          theme: {
            color: '#2563EB',
          },
          modal: {
            confirm_close: true,
            ondismiss: () => {
              setIsCheckoutOpen(false);
              // Neutral note: closing modal is NOT payment failure
              callbacks.onDismiss?.();
            },
          },
          handler: async (response) => {
            setIsCheckoutOpen(false);
            try {
              // Immediately verify with backend using returned cryptographic identifiers
              const verifiedData = await verifyPayment(order._id, response);
              callbacks.onSuccess?.(verifiedData);
            } catch (vErr) {
              callbacks.onError?.(vErr);
            }
          },
        };

        const razorpayInstance = new window.Razorpay(rzpOptions);

        razorpayInstance.on('payment.failed', (response) => {
          setIsCheckoutOpen(false);
          const failErr = new ApiError({
            status: 400,
            code: response?.error?.code || 'PAYMENT_FAILED',
            message: response?.error?.description || 'Payment was not completed by the provider.',
          });
          setError(failErr);
          callbacks.onError?.(failErr);
        });

        razorpayInstance.open();
      } catch (err) {
        setIsCheckoutOpen(false);
        setError(err);
        callbacks.onError?.(err);
      }
    },
    [isAuthenticated, user, createPaymentOrder, verifyPayment, resetPaymentState]
  );

  const value = {
    paymentOrder,
    paymentStatus,
    isCreatingPaymentOrder,
    isVerifyingPayment,
    isCheckoutOpen,
    isVerificationUncertain,
    error,
    verificationError,
    createPaymentOrder,
    verifyPayment,
    openCheckout,
    resetPaymentState,
    setPaymentStatus,
  };

  return <PaymentContext.Provider value={value}>{children}</PaymentContext.Provider>;
}

export default PaymentContext;
