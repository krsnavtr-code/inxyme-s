import mongoose from "mongoose";

const referralSchema = new mongoose.Schema(
  {
    referrer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    referrerCode: {
      type: String,
      required: true,
      trim: true,
    },
    referredUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    refereeName: {
      type: String,
      trim: true,
      default: "Prospective Student",
    },
    refereeEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    refereePhone: {
      type: String,
      trim: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
    },
    courseName: {
      type: String,
      default: "Inxyme Certification Program",
    },
    status: {
      type: String,
      enum: ["signed_up", "enrolled", "verified", "rewarded", "cancelled"],
      default: "signed_up",
    },
    rewardAmount: {
      type: Number,
      default: 1000, // ₹1,000 INR per successful referral
    },
    rewardStatus: {
      type: String,
      enum: ["pending", "approved", "paid"],
      default: "pending",
    },
    payoutRequested: {
      type: Boolean,
      default: false,
    },
    payoutMethod: {
      type: String,
      enum: ["UPI", "Bank Transfer", "Wallet"],
      default: "UPI",
    },
    payoutDetails: {
      type: String,
    },
    paidAt: {
      type: Date,
    },
    notes: {
      type: String,
    },
  },
  { timestamps: true }
);

referralSchema.index({ referrer: 1, createdAt: -1 });
referralSchema.index({ referrerCode: 1 });

const Referral = mongoose.model("Referral", referralSchema);
export default Referral;

