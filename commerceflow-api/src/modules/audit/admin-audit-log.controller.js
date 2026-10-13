import AdminAuditLog from "./admin-audit-log.model.js";
import { sanitizeAuditMetadata } from "./admin-audit.service.js";

/**
 * GET /api/v1/admin/audit-logs
 * Retrieves paginated, strictly projected administrative audit logs.
 * Supports filtering by eventType, actorUserId, targetUserId, and date ranges.
 * Enforces deterministic sorting and bounded pagination.
 */
export async function getAdminAuditLogs(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      50
    );
    const skip = (page - 1) * limit;

    const filter = {};

    // 1. Strict eventType filter
    if (
      req.query.eventType &&
      typeof req.query.eventType === "string" &&
      req.query.eventType.trim() !== "" &&
      req.query.eventType !== "all"
    ) {
      filter.eventType = req.query.eventType.trim();
    }

    // 2. Exact actorUserId filter
    if (
      req.query.actorUserId &&
      typeof req.query.actorUserId === "string" &&
      req.query.actorUserId.trim() !== ""
    ) {
      filter.actorUserId = req.query.actorUserId.trim();
    }

    // 3. Exact targetUserId filter
    if (
      req.query.targetUserId &&
      typeof req.query.targetUserId === "string" &&
      req.query.targetUserId.trim() !== ""
    ) {
      filter.targetUserId = req.query.targetUserId.trim();
    }

    // 4. Exact resourceType filter
    if (
      req.query.resourceType &&
      typeof req.query.resourceType === "string" &&
      req.query.resourceType.trim() !== ""
    ) {
      filter.resourceType = req.query.resourceType.trim().toLowerCase();
    }

    // 5. Exact resourceId filter
    if (
      req.query.resourceId &&
      typeof req.query.resourceId === "string" &&
      req.query.resourceId.trim() !== ""
    ) {
      filter.resourceId = req.query.resourceId.trim();
    }

    // 6. Safe date range filtering
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) {
        const parsedStart = new Date(req.query.startDate);
        if (!isNaN(parsedStart.getTime())) {
          filter.createdAt.$gte = parsedStart;
        }
      }
      if (req.query.endDate) {
        const parsedEnd = new Date(req.query.endDate);
        if (!isNaN(parsedEnd.getTime())) {
          filter.createdAt.$lte = parsedEnd;
        }
      }
      // If neither date was valid, cleanup empty createdAt filter
      if (Object.keys(filter.createdAt).length === 0) {
        delete filter.createdAt;
      }
    }

    // 7. Total count for pagination metadata
    const totalLogs = await AdminAuditLog.countDocuments(filter);

    // 8. Deterministic newest-first sort with _id tie-breaker
    const sortQuery = {
      createdAt: -1,
      _id: -1
    };

    // 9. Strict projection: strictly safe fields only
    const logs = await AdminAuditLog.find(filter)
      .select(
        "_id eventType actorUserId actorEmail actorRole targetUserId targetEmail resourceType resourceId metadata ipAddress userAgent createdAt"
      )
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      .lean();

    const formattedLogs = logs.map((log) => ({
      id: log._id.toString(),
      _id: log._id.toString(),
      eventType: log.eventType,
      actorUserId: log.actorUserId ? log.actorUserId.toString() : null,
      actorEmail: log.actorEmail,
      actorRole: log.actorRole,
      targetUserId: log.targetUserId ? log.targetUserId.toString() : null,
      targetEmail: log.targetEmail || null,
      resourceType: log.resourceType || null,
      resourceId: log.resourceId || null,
      metadata: sanitizeAuditMetadata(log.metadata) || {},
      ipAddress: log.ipAddress || null,
      userAgent: log.userAgent || null,
      createdAt: log.createdAt
    }));

    const totalPages = Math.max(Math.ceil(totalLogs / limit), 1);

    return res.status(200).json({
      success: true,
      message: "Admin audit logs retrieved successfully",
      data: {
        auditLogs: formattedLogs,
        pagination: {
          page,
          limit,
          total: totalLogs,
          totalLogs,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}
