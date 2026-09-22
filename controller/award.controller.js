import Award from "../model/award.model.js";
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

// @desc    Get all awards (with filtering, sorting, pagination)
// @route   GET /api/awards
// @access  Public
export const getAllAwards = catchAsync(async (req, res, next) => {
  // 1) Filtering
  const queryObj = { ...req.query };
  const excludedFields = ["page", "sort", "limit", "fields", "status", "search"];
  excludedFields.forEach((el) => delete queryObj[el]);

  // 2) Advanced filtering
  let queryStr = JSON.stringify(queryObj);
  queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);

  let query = Award.find(JSON.parse(queryStr));

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
    query = query.sort("-displayOrder -awardDate");
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

  const total = await Award.countDocuments(query.getQuery());
  query = query.skip(skip).limit(limit);

  // Execute query
  const awards = await query;

  // Send response
  res.status(200).json({
    status: "success",
    results: awards.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    data: {
      awards,
    },
  });
});

// @desc    Get featured award
// @route   GET /api/awards/featured
// @access  Public
export const getFeaturedAward = catchAsync(async (req, res, next) => {
  const award = await Award.findOne({
    isFeatured: true,
    status: "published"
  }).sort("-displayOrder -awardDate");

  if (!award) {
    // If no featured award, return the most recent published one
    const latestAward = await Award.findOne({
      status: "published"
    }).sort("-displayOrder -awardDate");
    
    if (latestAward) {
      return res.status(200).json({
        status: "success",
        data: {
          award: latestAward,
        },
      });
    }
    
    return next(new AppError("No awards found", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      award,
    },
  });
});

// @desc    Get single award by ID
// @route   GET /api/awards/:id
// @access  Admin
export const getAwardById = catchAsync(async (req, res, next) => {
  const award = await Award.findById(req.params.id);

  if (!award) {
    return next(new AppError("No award found with that ID", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      award,
    },
  });
});

// @desc    Get single award by slug
// @route   GET /api/awards/slug/:slug
// @access  Public
export const getAwardBySlug = catchAsync(async (req, res, next) => {
  const award = await Award.findOne({ slug: req.params.slug });

  if (!award) {
    return next(new AppError("No award found with that slug", 404));
  }

  // If not admin/employee, only return published awards
  const isAuthorizedAdmin =
    req.user &&
    (req.user.role === "admin" ||
      req.user.role === "employee" ||
      Boolean(req.user.adminRoleId));

  if (award.status !== "published" && !isAuthorizedAdmin) {
    return next(new AppError("This award is not published", 403));
  }

  res.status(200).json({
    status: "success",
    data: {
      award,
    },
  });
});

// @desc    Create new award
// @route   POST /api/awards
// @access  Private/Admin
export const createAward = catchAsync(async (req, res, next) => {
  // Allow only specific fields to be set
  const filteredBody = filterObj(
    req.body,
    "title",
    "organizationName",
    "organizationLogo",
    "awardCategory",
    "awardDate",
    "description",
    "awardImage",
    "externalLink",
    "recipientName",
    "recipientRole",
    "status",
    "isFeatured",
    "displayOrder",
    "slug"
  );

  // If isFeatured is set to true, unset it for all other awards
  if (filteredBody.isFeatured === true) {
    await Award.updateMany({ isFeatured: true }, { isFeatured: false });
  }

  // Create new award
  const newAward = await Award.create(filteredBody);

  res.status(201).json({
    status: "success",
    data: {
      award: newAward,
    },
  });
});

// @desc    Update award
// @route   PATCH /api/awards/:id
// @access  Private/Admin
export const updateAward = catchAsync(async (req, res, next) => {
  // 1) Find the award
  let award = await Award.findById(req.params.id);

  if (!award) {
    return next(new AppError("No award found with that ID", 404));
  }

  // 2) Allow only specific fields to be updated
  const filteredBody = filterObj(
    req.body,
    "title",
    "organizationName",
    "organizationLogo",
    "awardCategory",
    "awardDate",
    "description",
    "awardImage",
    "externalLink",
    "recipientName",
    "recipientRole",
    "status",
    "isFeatured",
    "displayOrder",
    "slug"
  );

  // If isFeatured is being set to true, unset it for all other awards
  if (filteredBody.isFeatured === true && !award.isFeatured) {
    await Award.updateMany({ isFeatured: true }, { isFeatured: false });
  }

  // 3) Update the award
  award = await Award.findByIdAndUpdate(req.params.id, filteredBody, {
    new: true,
    runValidators: true,
  });

  // 4) Return the updated award
  res.status(200).json({
    status: "success",
    data: {
      award,
    },
  });
});

// @desc    Delete award
// @route   DELETE /api/awards/:id
// @access  Private/Admin
export const deleteAward = catchAsync(async (req, res, next) => {
  const award = await Award.findByIdAndDelete(req.params.id);

  if (!award) {
    return next(new AppError("No award found with that ID", 404));
  }

  res.status(204).json({
    status: "success",
    data: null,
  });
});

// @desc    Get awards by category
// @route   GET /api/awards/category/:category
// @access  Public
export const getAwardsByCategory = catchAsync(async (req, res, next) => {
  const validCategories = ['excellence', 'innovation', 'leadership', 'recognition', 'achievement', 'partnership', 'other'];
  
  if (!validCategories.includes(req.params.category)) {
    return next(new AppError("Invalid award category", 400));
  }

  const awards = await Award.find({
    awardCategory: req.params.category,
    status: "published"
  }).sort("-displayOrder -awardDate");

  res.status(200).json({
    status: "success",
    results: awards.length,
    data: {
      awards,
    },
  });
});

// @desc    Search awards
// @route   GET /api/awards/search
// @access  Public
export const searchAwards = catchAsync(async (req, res, next) => {
  if (!req.query.q) {
    return next(new AppError("Please provide a search query", 400));
  }

  const searchQuery = req.query.q;
  const awards = await Award.find(
    { $text: { $search: searchQuery }, status: "published" },
    { score: { $meta: "textScore" } }
  )
    .sort({ score: { $meta: "textScore" } });

  res.status(200).json({
    status: "success",
    results: awards.length,
    data: {
      awards,
    },
  });
});