import mongoose from "mongoose";

const permissionSchema = new mongoose.Schema(
  {
    page: {
      type: String,
      required: true,
      enum: [
        "dashboard",
        "lms-management",
        "test-qa",
        "courses",
        "send-brochure",
        "send-proposal",
        "custom-email",
        "redirects",
        "document-verification",
        "candidates",
        "categories",
        "users",
        "blog",
        "contacts",
        "payments",
        "enrollments",
        "faqs",
        "image-gallery",
        "admin-management",
        "reviews",
      ],
    },
    canView: {
      type: Boolean,
      default: true,
    },
    canCreate: {
      type: Boolean,
      default: false,
    },
    canEdit: {
      type: Boolean,
      default: false,
    },
    canDelete: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false },
);

const adminRoleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  permissions: [permissionSchema],
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field on save
adminRoleSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

const AdminRole = mongoose.model("AdminRole", adminRoleSchema);

export default AdminRole;
