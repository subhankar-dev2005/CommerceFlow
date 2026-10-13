import mongoose from "mongoose";

const adminAuditLogSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      trim: true
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    actorEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    actorRole: {
      type: String,
      required: true,
      trim: true
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    targetEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: null
    },
    resourceType: {
      type: String,
      trim: true,
      default: null
    },
    resourceId: {
      type: String,
      trim: true,
      default: null
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    },
    ipAddress: {
      type: String,
      trim: true,
      default: null
    },
    userAgent: {
      type: String,
      trim: true,
      default: null
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false
  }
);

// Indexes for evidence-backed query patterns
adminAuditLogSchema.index({ actorUserId: 1, createdAt: -1 });
adminAuditLogSchema.index({ targetUserId: 1, createdAt: -1 });
adminAuditLogSchema.index({ eventType: 1, createdAt: -1 });
adminAuditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
adminAuditLogSchema.index({ createdAt: -1 });

const AdminAuditLog = mongoose.model("AdminAuditLog", adminAuditLogSchema);

export default AdminAuditLog;
