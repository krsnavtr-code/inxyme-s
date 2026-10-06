import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: false,
      default: null,
      index: true,
    },
    courseName: {
      type: String,
      required: false,
      trim: true,
      default: "Inxyme Course / Learning",
    },
    courseSlug: {
      type: String,
      trim: true,
      default: "",
    },
    studentName: {
      type: String,
      required: [true, "Student name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    studentEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    studentPhone: {
      type: String,
      trim: true,
      default: "",
    },
    rating: {
      type: Number,
      required: [true, "Rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
      index: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    reviewText: {
      type: String,
      required: [true, "Review text is required"],
      trim: true,
      minlength: [5, "Review must be at least 5 characters long"],
      maxlength: [2000, "Review cannot exceed 2000 characters"],
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    verified: {
      type: Boolean,
      default: false,
      index: true,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    adminNote: {
      type: String,
      trim: true,
      default: "",
    },
    ipAddress: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast queries in admin & public
reviewSchema.index({ course: 1, status: 1 });
reviewSchema.index({ createdAt: -1 });

const Review = mongoose.model("Review", reviewSchema);

export default Review;
