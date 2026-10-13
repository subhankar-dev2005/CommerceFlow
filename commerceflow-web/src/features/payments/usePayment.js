import { useContext } from 'react';
import { PaymentContext } from './payment.context.jsx';

/**
 * Custom hook to access central payment state and actions.
 *
 * @returns {{
 *   paymentOrder: Object|null,
 *   paymentStatus: string|null,
 *   isCreatingPaymentOrder: boolean,
 *   isVerifyingPayment: boolean,
 *   isCheckoutOpen: boolean,
 *   isVerificationUncertain: boolean,
 *   error: Error|null,
 *   verificationError: Error|null,
 *   createPaymentOrder: (orderId: string) => Promise<Object>,
 *   verifyPayment: (orderId: string, paymentResponse: Object) => Promise<Object>,
 *   openCheckout: (order: Object, callbacks?: Object) => Promise<void>,
 *   resetPaymentState: () => void,
 *   setPaymentStatus: (status: string) => void
 * }}
 * @throws {Error} If invoked outside of a <PaymentProvider>
 */
export function usePayment() {
  const context = useContext(PaymentContext);

  if (!context) {
    throw new Error('usePayment must be used within a <PaymentProvider>');
  }

  return context;
}

export default usePayment;
