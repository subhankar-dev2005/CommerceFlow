import { apiClient, ApiError } from '../../lib/apiClient.js';

/**
 * Payment Service
 * Communicates with the CommerceFlow Payment API endpoints.
 * All payment endpoints require authentication.
 */

const RAZORPAY_SDK_URL = 'https://checkout.razorpay.com/v1/checkout.js';
let sdkLoadingPromise = null;

/**
 * Validate that an ID is a 24-character hex MongoDB ObjectId.
 * @param {string} id
 * @param {string} fieldName
 * @throws {ApiError}
 */
function validateObjectId(id, fieldName = 'orderId') {
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
 * Asynchronously loads the official Razorpay Checkout SDK.
 * Caches the loading promise to prevent duplicate script tags.
 *
 * @returns {Promise<boolean>}
 * @throws {ApiError}
 */
export function loadRazorpaySdk() {
  if (typeof window === 'undefined') {
    return Promise.resolve(false);
  }

  if (window.Razorpay) {
    return Promise.resolve(true);
  }

  if (sdkLoadingPromise) {
    return sdkLoadingPromise;
  }

  sdkLoadingPromise = new Promise((resolve, reject) => {
    // Check if script tag is already in DOM
    const existingScript = document.querySelector(`script[src="${RAZORPAY_SDK_URL}"]`);
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(true));
      existingScript.addEventListener('error', () => {
        sdkLoadingPromise = null;
        reject(
          new ApiError({
            message: 'Failed to load Razorpay payment SDK. Please check your connection and try again.',
            status: 500,
            code: 'RAZORPAY_SDK_LOAD_ERROR',
          })
        );
      });
      return;
    }

    const script = document.createElement('script');
    script.src = RAZORPAY_SDK_URL;
    script.async = true;

    script.onload = () => {
      resolve(true);
    };

    script.onerror = () => {
      sdkLoadingPromise = null;
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      reject(
        new ApiError({
          message: 'Failed to load Razorpay payment SDK. Please check your connection and try again.',
          status: 500,
          code: 'RAZORPAY_SDK_LOAD_ERROR',
        })
      );
    };

    document.body.appendChild(script);
  });

  return sdkLoadingPromise;
}

/**
 * Create or retrieve a Razorpay order on the backend for a given CommerceFlow order.
 *
 * SERVER-AUTHORITATIVE CONTRACT:
 * Frontend must NOT send amount, subtotal, total, currency, product prices, or cart items.
 * The backend determines the payment amount from the CommerceFlow order.
 *
 * @param {string} orderId - 24-character hex CommerceFlow order ID
 * @returns {Promise<{ razorpayOrderId: string, amount: number, currency: string, keyId: string }>}
 */
export async function createPaymentOrder(orderId) {
  validateObjectId(orderId, 'orderId');

  const cleanId = orderId.trim();
  const response = await apiClient.post(`payments/orders/${encodeURIComponent(cleanId)}`, {});

  return response?.data;
}

/**
 * Verify Razorpay payment signature and capture status with the backend.
 *
 * SERVER-AUTHORITATIVE CONTRACT:
 * Frontend sends ONLY the payment identifiers/signature returned by the Razorpay checkout callback.
 * Frontend does NOT send calculated amounts, subtotals, or client-generated signatures.
 *
 * @param {string} orderId - 24-character hex CommerceFlow order ID
 * @param {Object} paymentData
 * @param {string} paymentData.razorpayPaymentId
 * @param {string} paymentData.razorpayOrderId
 * @param {string} paymentData.razorpaySignature
 * @returns {Promise<{ orderId: string, paymentStatus: string, transactionId: string, orderStatus: string }>}
 */
export async function verifyPayment(orderId, paymentData) {
  validateObjectId(orderId, 'orderId');

  if (!paymentData || typeof paymentData !== 'object') {
    throw new ApiError({
      message: 'Payment verification data is required',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'paymentData', message: 'Payment data must be an object' }],
    });
  }

  const razorpayPaymentId =
    paymentData.razorpayPaymentId || paymentData.razorpay_payment_id;
  const razorpayOrderId =
    paymentData.razorpayOrderId || paymentData.razorpay_order_id;
  const razorpaySignature =
    paymentData.razorpaySignature || paymentData.razorpay_signature;

  if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
    throw new ApiError({
      message: 'Missing required Razorpay payment verification fields',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [
        {
          field: 'razorpayPaymentId',
          message: 'Razorpay payment ID, order ID, and signature are required',
        },
      ],
    });
  }

  const cleanId = orderId.trim();
  const payload = {
    razorpayPaymentId: String(razorpayPaymentId).trim(),
    razorpayOrderId: String(razorpayOrderId).trim(),
    razorpaySignature: String(razorpaySignature).trim(),
  };

  const response = await apiClient.post(
    `payments/orders/${encodeURIComponent(cleanId)}/verify`,
    payload
  );

  return response?.data;
}

export const paymentService = {
  loadRazorpaySdk,
  createPaymentOrder,
  verifyPayment,
};

export default paymentService;
