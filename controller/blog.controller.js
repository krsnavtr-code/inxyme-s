import BlogPost from "../model/BlogPost.js";
import AppError from "../utils/appError.js";
import catchAsync from "../utils/catchAsync.js";
import { updateSitemapAsync } from "../utils/sitemapUpdater.js";

// Helper function to filter fields that are allowed to be updated
const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach((el) => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

// @desc    Get all blog posts (with filtering, sorting, pagination)
// @route   GET /api/blog/posts
// @access  Public
export const getAllBlogPosts = catchAsync(async (req, res, next) => {
  // 1) Filtering
  const queryObj = { ...req.query };
  const excludedFields = ["page", "sort", "limit", "fields", "status"];
  excludedFields.forEach((el) => delete queryObj[el]);

  // 2) Advanced filtering
  let queryStr = JSON.stringify(queryObj);
  queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);

  let query = BlogPost.find(JSON.parse(queryStr));

  // 3) Filter by status (default to published if not admin)
  if (req.user?.role !== "admin") {
    query = query.find({ status: "published" });
  } else if (req.query.status) {
    query = query.find({ status: req.query.status });
  }

  // 4) Sorting
  if (req.query.sort) {
    const sortBy = req.query.sort.split(",").join(" ");
    query = query.sort(sortBy);
  } else {
    query = query.sort("-createdAt");
  }

  // 5) Field limiting
  if (req.query.fields) {
    const fields = req.query.fields.split(",").join(" ");
    query = query.select(fields);
  } else {
    query = query.select("-__v");
  }

  // 6) Pagination
  const page = req.query.page * 1 || 1;
  const limit = req.query.limit * 1 || 10;
  const skip = (page - 1) * limit;

  const total = await BlogPost.countDocuments(query.getQuery());
  query = query.skip(skip).limit(limit);

  // Execute query
  const posts = await query
    .populate("author", "fullname email")
    .populate("categories", "name slug");

  // Send response
  res.status(200).json({
    status: "success",
    results: posts.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    data: {
      posts,
    },
  });
});

// @desc    Get single blog post by ID
// @route   GET /api/blog/posts/id/:id
// @access  Admin
export const getBlogPostById = catchAsync(async (req, res, next) => {
  const post = await BlogPost.findById(req.params.id)
    .populate("author", "fullname email")
    .populate("categories", "name slug");

  if (!post) {
    return next(new AppError("No blog post found with that ID", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      post,
    },
  });
});

// @desc    Get single blog post by slug
// @route   GET /api/blog/posts/:slug
// @access  Public
export const getBlogPost = catchAsync(async (req, res, next) => {
  const post = await BlogPost.findOne({ slug: req.params.slug })
    .populate("author", "fullname email")
    .populate("categories", "name slug");

  if (!post) {
    return next(new AppError("No blog post found with that slug", 404));
  }

  // If not admin, only return published posts
  const isAdmin = req.user && (req.user.role === "admin" || req.user.role === "employee" || Boolean(req.user.adminRoleId));
  if (post.status !== "published" && !isAdmin) {
    return next(new AppError("This blog post is not published", 403));
  }

  res.status(200).json({
    status: "success",
    data: {
      post,
    },
  });
});

// @desc    Create new blog post
// @route   POST /api/blog/posts
// @access  Private/Admin
export const createBlogPost = catchAsync(async (req, res, next) => {
  // Allow only specific fields to be set
  const filteredBody = filterObj(
    req.body,
    "title",
    "slug",
    "content",
    "excerpt",
    "featuredImage",
    "status",
    "categories",
    "tags",
    "seo",
  );

  // Set the author to the current user
  filteredBody.author = req.user.id;

  // Create new blog post
  const newPost = await BlogPost.create(filteredBody);

  // Auto-update sitemap when blog post is created
  updateSitemapAsync();

  res.status(201).json({
    status: "success",
    data: {
      post: newPost,
    },
  });
});

// @desc    Update blog post
// @route   PATCH /api/blog/posts/:id
// @access  Private/Admin
export const updateBlogPost = catchAsync(async (req, res, next) => {
  // 1) Find the post
  let post = await BlogPost.findById(req.params.id);

  if (!post) {
    return next(new AppError("No blog post found with that ID", 404));
  }

  // 2) Allow only specific fields to be updated
  const filteredBody = filterObj(
    req.body,
    "title",
    "content",
    "excerpt",
    "featuredImage",
    "status",
    "categories",
    "tags",
    "seo",
  );

  // 3) Update the post
  post = await BlogPost.findByIdAndUpdate(req.params.id, filteredBody, {
    new: true,
    runValidators: true,
  });

  // Auto-update sitemap when blog post is updated
  updateSitemapAsync();

  // 4) Return the updated post
  res.status(200).json({
    status: "success",
    data: {
      post,
    },
  });
});

// @desc    Delete blog post
// @route   DELETE /api/blog/posts/:id
// @access  Private/Admin
export const deleteBlogPost = catchAsync(async (req, res, next) => {
  const post = await BlogPost.findByIdAndDelete(req.params.id);

  if (!post) {
    return next(new AppError("No blog post found with that ID", 404));
  }

  // Auto-update sitemap when blog post is deleted
  updateSitemapAsync();

  res.status(204).json({
    status: "success",
    data: null,
  });
});

// @desc    Get posts by category
// @route   GET /api/blog/categories/:category
// @access  Public
export const getPostsByCategory = catchAsync(async (req, res, next) => {
  const posts = await BlogPost.find({
    categories: req.params.category,
    status: "published",
  })
    .populate("author", "fullname")
    .populate("categories", "name slug");

  res.status(200).json({
    status: "success",
    results: posts.length,
    data: {
      posts,
    },
  });
});

// @desc    Search blog posts
// @route   GET /api/blog/search
// @access  Public
export const searchBlogPosts = catchAsync(async (req, res, next) => {
  if (!req.query.q) {
    return next(new AppError("Please provide a search query", 400));
  }

  const searchQuery = req.query.q;
  const posts = await BlogPost.find(
    { $text: { $search: searchQuery }, status: "published" },
    { score: { $meta: "textScore" } },
  )
    .sort({ score: { $meta: "textScore" } })
    .populate("author", "fullname")
    .populate("categories", "name slug");

  res.status(200).json({
    status: "success",
    results: posts.length,
    data: {
      posts,
    },
  });
});
