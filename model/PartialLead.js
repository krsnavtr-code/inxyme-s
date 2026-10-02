import mongoose from "mongoose";

const partialLeadSchema = new mongoose.Schema(
  {
    // Contact info captured on blur
    name: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
    },

    // Which page / form the lead came from
    source: {
      type: String,
      trim: true,
      default: "website",
    },
    pageUrl: {
      type: String,
      trim: true,
    },

    // Optional course interest
    courseId: {
      type: String,
      trim: true,
    },
    courseTitle: {
      type: String,
      trim: true,
    },

    // Was the full form eventually submitted?
    converted: {
      type: Boolean,
      default: false,
    },
    convertedAt: {
      type: Date,
      default: null,
    },

    // Status for CRM / admin follow-up
    status: {
      type: String,
      enum: ["partial", "converted", "contacted", "spam", "ignored"],
      default: "partial",
      index: true,
    },

    // Metadata
    ipAddress: String,
    userAgent: String,

    // A session-level fingerprint so duplicate blur events for the same
    // visitor on the same form don't create multiple records. We upsert
    // on this field.
    sessionFingerprint: {
      type: String,
      index: true,
      unique: true,
      sparse: true,
    },
  },
  {
    timestamps: true, // createdAt = first blur, updatedAt = last blur
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Composite indexes for admin queries
partialLeadSchema.index({ status: 1, createdAt: -1 });
partialLeadSchema.index({ email: 1, createdAt: -1 });
partialLeadSchema.index({ phone: 1, createdAt: -1 });
partialLeadSchema.index({ converted: 1, createdAt: -1 });

const PartialLead = mongoose.model("PartialLead", partialLeadSchema);

export default PartialLead;
