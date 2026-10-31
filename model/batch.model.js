import mongoose from "mongoose";

const batchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    schedule: {
      type: String,
      trim: true,
    },
    maxCapacity: {
      type: Number,
      required: true,
      min: 1,
      default: 30,
    },
    currentEnrollment: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["upcoming", "active", "completed", "cancelled"],
      default: "upcoming",
    },
    location: {
      type: String,
      trim: true,
    },
    meetingLink: {
      type: String,
      trim: true,
    },
    whatsappGroupLink: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    students: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    classroomSessions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ClassroomSession",
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Update status based on dates
batchSchema.pre("save", function (next) {
  const now = new Date();
  if (this.startDate > now) {
    this.status = "upcoming";
  } else if (this.startDate <= now && this.endDate >= now) {
    this.status = "active";
  } else if (this.endDate < now) {
    this.status = "completed";
  }
  next();
});

// Index for faster queries
batchSchema.index({ course: 1, teacher: 1 });
batchSchema.index({ status: 1 });
batchSchema.index({ startDate: 1, endDate: 1 });

const Batch = mongoose.model("Batch", batchSchema);

export default Batch;
