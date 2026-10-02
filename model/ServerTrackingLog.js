import mongoose from "mongoose";

const serverTrackingLogSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      enum: ["PageView", "ViewContent", "Lead", "PartialLead", "Custom"],
      index: true,
    },
    eventName: {
      type: String,
      required: true,
    },
    pageUrl: {
      type: String,
      default: "",
    },
    pageTitle: {
      type: String,
      default: "",
    },
    visitorId: {
      type: String,
      index: true,
    },
    fingerprint: {
      type: String,
      index: true,
    },
    ipAddress: {
      type: String,
      default: "",
    },
    userAgent: {
      type: String,
      default: "",
    },
    // User data (hashed when sent to Meta/Google, partially masked here for admin audit)
    userData: {
      name: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
      courseTitle: { type: String, default: "" },
    },
    // Tracking dispatch destinations & statuses
    metaCapi: {
      status: {
        type: String,
        enum: ["dispatched", "simulated", "not_configured", "failed"],
        default: "not_configured",
      },
      fbtraceId: { type: String, default: "" },
      eventsReceived: { type: Number, default: 0 },
      error: { type: String, default: "" },
    },
    ga4MeasurementProtocol: {
      status: {
        type: String,
        enum: ["dispatched", "simulated", "not_configured", "failed"],
        default: "not_configured",
      },
      error: { type: String, default: "" },
    },
    // Ad-blocker immunity flag
    bypassedAdBlocker: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index: Keep server tracking logs for 30 days so database doesn't grow indefinitely
serverTrackingLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const ServerTrackingLog = mongoose.model("ServerTrackingLog", serverTrackingLogSchema);

export default ServerTrackingLog;
