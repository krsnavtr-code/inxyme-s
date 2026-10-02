import mongoose from "mongoose";

const visitPageSchema = new mongoose.Schema(
  {
    pageUrl: {
      type: String,
      required: true,
      trim: true,
    },
    pageTitle: {
      type: String,
      trim: true,
      default: "",
    },
    referrer: {
      type: String,
      trim: true,
      default: "",
    },
    ipAddress: {
      type: String,
      default: "",
    },
    userAgent: {
      type: String,
      default: "",
    },
    visitedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const visitorSchema = new mongoose.Schema(
  {
    // Unique UUID generated in frontend cookies / localStorage
    visitorId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    // Browser / Device Hardware Fingerprint (FingerprintJS - survives cookie clearing & incognito)
    fingerprint: {
      type: String,
      index: true,
      trim: true,
      default: "",
    },

    // All visitor UUIDs associated with this physical hardware fingerprint
    visitorIds: [
      {
        type: String,
        index: true,
      },
    ],

    // Whether this visitor was identified via hardware fingerprint after cookie clear / incognito
    isFingerprintMatched: {
      type: Boolean,
      default: false,
    },

    // Device and browser metadata
    device: {
      os: { type: String, default: "" },
      browser: { type: String, default: "" },
      deviceType: { type: String, default: "" },
      screenResolution: { type: String, default: "" },
      language: { type: String, default: "" },
      timezone: { type: String, default: "" },
    },

    // Identity linked once user submits or onBlur enters contact info
    name: {
      type: String,
      trim: true,
      default: "",
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },

    // Has this visitor ever given contact details?
    isKnownLead: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Throttle alert emails so admin isn't spammed on every click
    lastAlertSentAt: {
      type: Date,
      default: null,
    },

    // First and last visit tracking
    firstSeen: {
      type: Date,
      default: Date.now,
      index: true,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
      index: true,
    },

    // Visit statistics
    totalVisits: {
      type: Number,
      default: 1,
    },
    pageViews: {
      type: Number,
      default: 1,
    },

    // Recent page tracking
    lastPageVisited: {
      type: String,
      trim: true,
      default: "",
    },
    lastPageTitle: {
      type: String,
      trim: true,
      default: "",
    },

    // History of visited pages (capped to last 100 for document efficiency)
    history: [visitPageSchema],

    // Network metadata
    ipAddress: String,
    userAgent: String,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for fast queries in admin dashboard
visitorSchema.index({ isKnownLead: 1, lastSeen: -1 });
visitorSchema.index({ totalVisits: -1, lastSeen: -1 });
visitorSchema.index({ email: 1 });
visitorSchema.index({ phone: 1 });
visitorSchema.index({ fingerprint: 1 });
visitorSchema.index({ visitorIds: 1 });

const Visitor = mongoose.model("Visitor", visitorSchema);

export default Visitor;
