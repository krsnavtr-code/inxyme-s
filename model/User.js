import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    fullname: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/\S+@\S+\.\S+/, "Please enter a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters long"],
    },
    role: {
      type: String,
      enum: ["admin", "teacher", "student", "employee"],
      default: "student",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
    department: {
      type: String,
      required: function () {
        return this.role === "teacher" || this.role === "student";
      },
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[0-9\-\+\s]*$/, "Please enter a valid phone number"],
    },
    address: {
      type: String,
      trim: true,
    },
    refreshToken: {
      type: String,
      select: false, // Don't include this field by default in queries
    },
    passwordResetToken: {
      type: String,
      select: false, // Don't include this field by default in queries
    },
    passwordResetExpires: {
      type: Date,
      select: false, // Don't include this field by default in queries
    },
    emailVerificationOTP: {
      type: String,
      select: false, // Don't include this field by default in queries
    },
    emailVerificationOTPExpires: {
      type: Date,
      select: false, // Don't include this field by default in queries
    },
    adminLoginOTP: {
      type: String,
      select: false, // Don't include this field by default in queries
    },
    adminLoginOTPExpires: {
      type: Date,
      select: false, // Don't include this field by default in queries
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    enrolledCourses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
      },
    ],
    enrolledBatches: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Batch",
      },
    ],
    assignedBatches: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Batch",
      },
    ],
    completedLessons: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Lesson",
      },
    ],
    learningProgress: [
      {
        course: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Course",
        },
        completedLessons: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Lesson",
          },
        ],
        progress: {
          type: Number,
          min: 0,
          max: 100,
          default: 0,
        },
        lastAccessed: {
          type: Date,
          default: Date.now,
        },
        completed: {
          type: Boolean,
          default: false,
        },
        completedAt: Date,
      },
    ],
    certificates: [
      {
        course: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Course",
        },
        certificateId: String,
        issuedAt: {
          type: Date,
          default: Date.now,
        },
        downloadUrl: String,
      },
    ],
    isApproved: {
      type: Boolean,
      default: false,
    },
    studentId: {
      type: String,
      sparse: true,
      unique: true,
    },
    designation: {
      type: String,
    },
    adminRoleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminRole",
      sparse: true, // Only for admin users
    },
    adminPermissions: {
      type: Map,
      of: {
        canView: { type: Boolean, default: false },
        canCreate: { type: Boolean, default: false },
        canEdit: { type: Boolean, default: false },
        canDelete: { type: Boolean, default: false },
      },
      default: new Map(),
      select: false, // Don't include by default for security
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: true,
  },
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Method to compare passwords
userSchema.methods.matchPassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword,
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// Remove password from output
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  return user;
};

const User = mongoose.model("User", userSchema);

export default User;
