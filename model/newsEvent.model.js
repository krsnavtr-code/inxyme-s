import mongoose from "mongoose";

const newsEventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [300, "Title cannot exceed 300 characters"],
    },
    type: {
      type: String,
      enum: ["masterclass", "placement", "press", "announcement", "archive"],
      default: "masterclass",
    },
    category: {
      type: String,
      enum: ["upcoming", "news", "placement", "past"],
      default: "upcoming",
      required: [true, "Category is required"],
    },
    description: {
      type: String,
      required: [true, "Short description is required"],
      trim: true,
      maxlength: [600, "Description cannot exceed 600 characters"],
    },
    fullContent: {
      type: String,
      trim: true,
      default: "",
    },
    date: {
      type: String,
      required: [true, "Date is required"],
      trim: true,
    },
    time: {
      type: String,
      trim: true,
      default: "",
    },
    location: {
      type: String,
      trim: true,
      default: "Online Session",
    },
    mode: {
      type: String,
      default: "Live Interactive Webinar",
      trim: true,
    },
    organizerName: {
      type: String,
      default: "Inxyme Academic Council",
      trim: true,
    },
    organizerDivision: {
      type: String,
      default: "Executive Directorate",
      trim: true,
    },
    publisher: {
      type: String,
      default: "",
      trim: true,
    },
    image: {
      type: String,
      default: "",
      trim: true,
    },
    tag: {
      type: String,
      default: "Masterclass",
      trim: true,
    },
    featured: {
      type: Boolean,
      default: false,
    },
    registrationOpen: {
      type: Boolean,
      default: true,
    },
    externalLink: {
      type: String,
      default: "",
      trim: true,
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

// Virtual for organizedBy object to match frontend structure
newsEventSchema.virtual("organizedBy").get(function () {
  return {
    name: this.organizerName || "Inxyme Academic Council",
    division: this.organizerDivision || "Executive Directorate",
  };
});

// Text index for search
newsEventSchema.index({
  title: "text",
  description: "text",
  fullContent: "text",
  tag: "text",
  organizerName: "text",
});

// Compound index for filtering
newsEventSchema.index({
  status: 1,
  category: 1,
  featured: 1,
  displayOrder: 1,
  createdAt: -1,
});

const NewsEvent = mongoose.model("NewsEvent", newsEventSchema);

export default NewsEvent;
