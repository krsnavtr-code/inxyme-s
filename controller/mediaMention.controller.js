import MediaMention from "../model/mediaMention.model.js";
import AppError from "../utils/appError.js";
import catchAsync from "../utils/catchAsync.js";

// Helper function to filter fields that are allowed to be updated
const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach((el) => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

// @desc    Get all media mentions (with filtering, sorting, pagination)
// @route   GET /api/media-mentions
// @access  Public
export const getAllMediaMentions = catchAsync(async (req, res, next) => {
  // 1) Filtering
  const queryObj = { ...req.query };
  const excludedFields = ["page", "sort", "limit", "fields", "status", "search"];
  excludedFields.forEach((el) => delete queryObj[el]);

  // 2) Advanced filtering
  let queryStr = JSON.stringify(queryObj);
  queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);

  let query = MediaMention.find(JSON.parse(queryStr));

  // 3) Filter by status (default to published if not admin)
  if (req.user?.role !== "admin") {
    query = query.find({ status: "published" });
  } else if (req.query.status) {
    query = query.find({ status: req.query.status });
  }

  // 4) Search functionality
  if (req.query.search) {
    query = query.find({
      $text: { $search: req.query.search }
    });
  }

  // 5) Sorting
  if (req.query.sort) {
    const sortBy = req.query.sort.split(",").join(" ");
    query = query.sort(sortBy);
  } else {
    query = query.sort("-publishedDate");
  }

  // 6) Field limiting
  if (req.query.fields) {
    const fields = req.query.fields.split(",").join(" ");
    query = query.select(fields);
  } else {
    query = query.select("-__v");
  }

  // 7) Pagination
  const page = req.query.page * 1 || 1;
  const limit = req.query.limit * 1 || 10;
  const skip = (page - 1) * limit;

  const total = await MediaMention.countDocuments(query.getQuery());
  query = query.skip(skip).limit(limit);

  // Execute query
  const mentions = await query;

  // Send response
  res.status(200).json({
    status: "success",
    results: mentions.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    data: {
      mentions,
    },
  });
});

// @desc    Get featured media mention
// @route   GET /api/media-mentions/featured
// @access  Public
export const getFeaturedMediaMention = catchAsync(async (req, res, next) => {
  const mention = await MediaMention.findOne({
    isFeatured: true,
    status: "published"
  }).sort("-publishedDate");

  if (!mention) {
    // If no featured mention, return the most recent published one
    const latestMention = await MediaMention.findOne({
      status: "published"
    }).sort("-publishedDate");
    
    if (latestMention) {
      return res.status(200).json({
        status: "success",
        data: {
          mention: latestMention,
        },
      });
    }
    
    return next(new AppError("No media mentions found", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      mention,
    },
  });
});

// @desc    Get single media mention by ID
// @route   GET /api/media-mentions/:id
// @access  Admin
export const getMediaMentionById = catchAsync(async (req, res, next) => {
  const mention = await MediaMention.findById(req.params.id);

  if (!mention) {
    return next(new AppError("No media mention found with that ID", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      mention,
    },
  });
});

// @desc    Get single media mention by slug
// @route   GET /api/media-mentions/slug/:slug
// @access  Public
export const getMediaMentionBySlug = catchAsync(async (req, res, next) => {
  const mention = await MediaMention.findOne({ slug: req.params.slug });

  if (!mention) {
    return next(new AppError("No media mention found with that slug", 404));
  }

  // If not admin, only return published mentions
  const isAdmin = req.user && (req.user.role === "admin" || req.user.role === "employee" || Boolean(req.user.adminRoleId));
  if (mention.status !== "published" && !isAdmin) {
    return next(new AppError("This media mention is not published", 403));
  }

  res.status(200).json({
    status: "success",
    data: {
      mention,
    },
  });
});

// @desc    Create new media mention
// @route   POST /api/media-mentions
// @access  Private/Admin
export const createMediaMention = catchAsync(async (req, res, next) => {
  // Allow only specific fields to be set
  const filteredBody = filterObj(
    req.body,
    "title",
    "publisherName",
    "publisherLogo",
    "newsType",
    "publishedDate",
    "shortDescription",
    "mediaUpload",
    "externalLink",
    "status",
    "isFeatured",
    "slug"
  );

  // If isFeatured is set to true, unset it for all other mentions
  if (filteredBody.isFeatured === true) {
    await MediaMention.updateMany({ isFeatured: true }, { isFeatured: false });
  }

  // Create new media mention
  const newMention = await MediaMention.create(filteredBody);

  res.status(201).json({
    status: "success",
    data: {
      mention: newMention,
    },
  });
});

// @desc    Update media mention
// @route   PATCH /api/media-mentions/:id
// @access  Private/Admin
export const updateMediaMention = catchAsync(async (req, res, next) => {
  // 1) Find the mention
  let mention = await MediaMention.findById(req.params.id);

  if (!mention) {
    return next(new AppError("No media mention found with that ID", 404));
  }

  // 2) Allow only specific fields to be updated
  const filteredBody = filterObj(
    req.body,
    "title",
    "publisherName",
    "publisherLogo",
    "newsType",
    "publishedDate",
    "shortDescription",
    "mediaUpload",
    "externalLink",
    "status",
    "isFeatured",
    "slug"
  );

  // If isFeatured is being set to true, unset it for all other mentions
  if (filteredBody.isFeatured === true && !mention.isFeatured) {
    await MediaMention.updateMany({ isFeatured: true }, { isFeatured: false });
  }

  // 3) Update the mention
  mention = await MediaMention.findByIdAndUpdate(req.params.id, filteredBody, {
    new: true,
    runValidators: true,
  });

  // 4) Return the updated mention
  res.status(200).json({
    status: "success",
    data: {
      mention,
    },
  });
});

// @desc    Delete media mention
// @route   DELETE /api/media-mentions/:id
// @access  Private/Admin
export const deleteMediaMention = catchAsync(async (req, res, next) => {
  const mention = await MediaMention.findByIdAndDelete(req.params.id);

  if (!mention) {
    return next(new AppError("No media mention found with that ID", 404));
  }

  res.status(204).json({
    status: "success",
    data: null,
  });
});

// @desc    Get media mentions by type
// @route   GET /api/media-mentions/type/:type
// @access  Public
export const getMediaMentionsByType = catchAsync(async (req, res, next) => {
  const validTypes = ['print', 'digital', 'video', 'press_release'];
  
  if (!validTypes.includes(req.params.type)) {
    return next(new AppError("Invalid media type", 400));
  }

  const mentions = await MediaMention.find({
    newsType: req.params.type,
    status: "published"
  }).sort("-publishedDate");

  res.status(200).json({
    status: "success",
    results: mentions.length,
    data: {
      mentions,
    },
  });
});

// @desc    Search media mentions
// @route   GET /api/media-mentions/search
// @access  Public
export const searchMediaMentions = catchAsync(async (req, res, next) => {
  if (!req.query.q) {
    return next(new AppError("Please provide a search query", 400));
  }

  const searchQuery = req.query.q;
  const mentions = await MediaMention.find(
    { $text: { $search: searchQuery }, status: "published" },
    { score: { $meta: "textScore" } }
  )
    .sort({ score: { $meta: "textScore" } });

  res.status(200).json({
    status: "success",
    results: mentions.length,
    data: {
      mentions,
    },
  });
});
