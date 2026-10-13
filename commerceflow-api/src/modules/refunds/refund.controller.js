import {
  initiateReturnRefund,
  retryRefund,
  reconcileRefund,
  listAdminRefunds,
  getAdminRefundById
} from "./refund.service.js";

/**
 * Admin: List and filter refunds with bounded pagination.
 */
export async function adminListRefunds(req, res, next) {
  try {
    const result = await listAdminRefunds(req.query);

    return res.status(200).json({
      success: true,
      data: result,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Inspect refund detail including immutable financial ledger entries.
 */
export async function adminGetRefundDetail(req, res, next) {
  try {
    const { refundId } = req.params;
    const result = await getAdminRefundById(refundId);

    return res.status(200).json({
      success: true,
      data: result,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Initiate an authoritative gateway refund for an eligible completed return.
 */
export async function adminCreateReturnRefund(req, res, next) {
  try {
    const { returnId } = req.params;
    const { reasonDetail = "" } = req.body || {};

    const refund = await initiateReturnRefund({
      returnId,
      reasonDetail,
      adminUser: req.user,
      req
    });

    return res.status(201).json({
      success: true,
      message: "Gateway refund processed successfully",
      data: {
        refund
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Retry a failed gateway refund.
 */
export async function adminRetryFailedRefund(req, res, next) {
  try {
    const { refundId } = req.params;

    const refund = await retryRefund({
      refundId,
      adminUser: req.user,
      req
    });

    return res.status(200).json({
      success: true,
      message: "Gateway refund retry processed successfully",
      data: {
        refund
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Authoritatively reconcile an ambiguous or post-crash refund with the gateway.
 */
export async function adminReconcileRefund(req, res, next) {
  try {
    const { refundId } = req.params;

    const result = await reconcileRefund({
      refundId,
      adminUser: req.user,
      req
    });

    return res.status(200).json({
      success: true,
      message: `Refund reconciliation complete: Outcome is ${result.outcome}`,
      data: result,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}
