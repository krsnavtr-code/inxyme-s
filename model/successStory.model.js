import mongoose from "mongoose";

const successStorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Student/Cardholder name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    role: {
      type: String,
      required: [true, "Role/Designation is required"],
      trim: true,
      maxlength: [120, "Role cannot exceed 120 characters"],
    },
    company: {
      type: String,
      trim: true,
      default: "",
      maxlength: [120, "Company name cannot exceed 120 characters"],
    },
    course: {
      type: String,
      required: [true, "Course/Specialization is required"],
      trim: true,
      maxlength: [150, "Course cannot exceed 150 characters"],
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      default: "Career Switch",
    },
    image: {
      type: String,
      trim: true,
      default: "",
    },
    hike: {
      type: String,
      trim: true,
      default: "",
      maxlength: [50, "Hike text cannot exceed 50 characters"],
    },
    content: {
      type: String,
      required: [true, "Testimonial content is required"],
      trim: true,
    },
    rating: {
      type: Number,
      default: 5,
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
    },
    featured: {
      type: Boolean,
      default: false,
    },
    batchYear: {
      type: Number,
      default: 2026,
    },
    cardIdNumber: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["published", "draft"],
      default: "published",
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Auto-generate cardIdNumber if not specified
successStorySchema.pre("save", function (next) {
  if (!this.cardIdNumber) {
    const year = this.batchYear || 2026;
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    this.cardIdNumber = `INX-${year}-0${randomSuffix}`;
  }
  next();
});

// Text index for search
successStorySchema.index({
  name: "text",
  role: "text",
  company: "text",
  course: "text",
  content: "text",
});

// Compound index for filtering
successStorySchema.index({
  status: 1,
  displayOrder: 1,
  category: 1,
  featured: 1,
  createdAt: -1,
});

const SuccessStory = mongoose.model("SuccessStory", successStorySchema);

export default SuccessStory;
