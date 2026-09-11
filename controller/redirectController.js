import Redirect from "../model/redirect.model.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/appError.js";

// @desc    Get all redirects
// @route   GET /api/redirects
// @access  Private (Admin only)
export const getAllRedirects = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const redirects = await Redirect.find()
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Redirect.countDocuments();

  res.json({
    success: true,
    data: redirects,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

// @desc    Get a single redirect
// @route   GET /api/redirects/:id
// @access  Private (Admin only)
export const getRedirect = catchAsync(async (req, res, next) => {
  const redirect = await Redirect.findById(req.params.id);

  if (!redirect) {
    return next(new AppError("Redirect not found", 404));
  }

  res.json({
    success: true,
    data: redirect,
  });
});

// @desc    Create a new redirect
// @route   POST /api/redirects
// @access  Private (Admin only)
export const createRedirect = catchAsync(async (req, res, next) => {
  const { sourceUrl, targetUrl, statusCode, description } = req.body;

  // Check if source URL already exists
  const existingRedirect = await Redirect.findOne({ sourceUrl });
  if (existingRedirect) {
    return next(
      new AppError("A redirect for this source URL already exists", 400),
    );
  }

  const redirect = await Redirect.create({
    sourceUrl,
    targetUrl,
    statusCode: statusCode || 301,
    description,
  });

  res.status(201).json({
    success: true,
    data: redirect,
  });
});

// @desc    Update a redirect
// @route   PATCH /api/redirects/:id
// @access  Private (Admin only)
export const updateRedirect = catchAsync(async (req, res, next) => {
  const { sourceUrl, targetUrl, statusCode, isActive, description } = req.body;

  const redirect = await Redirect.findById(req.params.id);

  if (!redirect) {
    return next(new AppError("Redirect not found", 404));
  }

  // If sourceUrl is being changed, check if it already exists
  if (sourceUrl && sourceUrl !== redirect.sourceUrl) {
    const existingRedirect = await Redirect.findOne({ sourceUrl });
    if (existingRedirect) {
      return next(
        new AppError("A redirect for this source URL already exists", 400),
      );
    }
  }

  const updatedRedirect = await Redirect.findByIdAndUpdate(
    req.params.id,
    {
      sourceUrl: sourceUrl || redirect.sourceUrl,
      targetUrl: targetUrl || redirect.targetUrl,
      statusCode: statusCode || redirect.statusCode,
      isActive: isActive !== undefined ? isActive : redirect.isActive,
      description: description || redirect.description,
    },
    { new: true, runValidators: true },
  );

  res.json({
    success: true,
    data: updatedRedirect,
  });
});

// @desc    Delete a redirect
// @route   DELETE /api/redirects/:id
// @access  Private (Admin only)
export const deleteRedirect = catchAsync(async (req, res, next) => {
  const redirect = await Redirect.findById(req.params.id);

  if (!redirect) {
    return next(new AppError("Redirect not found", 404));
  }

  await Redirect.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: "Redirect deleted successfully",
  });
});

// @desc    Toggle redirect active status
// @route   PATCH /api/redirects/:id/toggle
// @access  Private (Admin only)
export const toggleRedirect = catchAsync(async (req, res, next) => {
  const redirect = await Redirect.findById(req.params.id);

  if (!redirect) {
    return next(new AppError("Redirect not found", 404));
  }

  redirect.isActive = !redirect.isActive;
  await redirect.save();

  res.json({
    success: true,
    data: redirect,
  });
});

// @desc    Get redirect by source URL (for middleware)
// @access  Public
export const getRedirectBySource = async (sourceUrlOrUrls) => {
  const query = {
    isActive: true,
  };

  if (Array.isArray(sourceUrlOrUrls)) {
    query.sourceUrl = { $in: sourceUrlOrUrls };
  } else {
    query.sourceUrl = sourceUrlOrUrls;
  }

  const redirect = await Redirect.findOne(query);

  if (redirect) {
    // Update redirect count and last redirected time in background (non-blocking)
    Redirect.updateOne(
      { _id: redirect._id },
      {
        $inc: { redirectCount: 1 },
        $set: { lastRedirectedAt: new Date() },
      },
    ).catch((err) => console.error("Error updating redirect stats:", err));
  }

  return redirect;
};

// Generate all possible candidate URLs for robust, domain/protocol-agnostic matching
const getRedirectCandidates = (path, host, protocol) => {
  const candidates = [path];

  // Normalise clean path
  const cleanPath = path.split("?")[0];
  if (cleanPath !== path && !candidates.includes(cleanPath)) {
    candidates.push(cleanPath);
  }

  // Add current host candidates (both http and https to handle proxy protocol mismatches)
  if (host) {
    candidates.push(`http://${host}${path}`);
    candidates.push(`https://${host}${path}`);
    if (cleanPath !== path) {
      candidates.push(`http://${host}${cleanPath}`);
      candidates.push(`https://${host}${cleanPath}`);
    }

    // Add www variants if host doesn't have it
    if (!host.startsWith("www.")) {
      candidates.push(`http://www.${host}${path}`);
      candidates.push(`https://www.${host}${path}`);
      if (cleanPath !== path) {
        candidates.push(`http://www.${host}${cleanPath}`);
        candidates.push(`https://www.${host}${cleanPath}`);
      }
    } else {
      // Add non-www variants if host has it
      const nonWwwHost = host.substring(4);
      candidates.push(`http://${nonWwwHost}${path}`);
      candidates.push(`https://${nonWwwHost}${path}`);
      if (cleanPath !== path) {
        candidates.push(`http://${nonWwwHost}${cleanPath}`);
        candidates.push(`https://${nonWwwHost}${cleanPath}`);
      }
    }
  }

  // Add production domain candidates (very important for dev/staging and absolute redirects in DB)
  const prodHosts = ["www.inxyme.com", "inxyme.com"];
  prodHosts.forEach((prodHost) => {
    candidates.push(`http://${prodHost}${path}`);
    candidates.push(`https://${prodHost}${path}`);
    if (cleanPath !== path) {
      candidates.push(`http://${prodHost}${cleanPath}`);
      candidates.push(`https://${prodHost}${cleanPath}`);
    }
  });

  // De-duplicate
  return [...new Set(candidates)];
};

// @desc    Check if a path has a redirect (public endpoint for client-side check)
// @route   GET /api/redirects/check?path=/some-path
// @access  Public
export const checkRedirect = catchAsync(async (req, res, next) => {
  const { path: reqPath } = req.query;

  if (!reqPath) {
    return next(new AppError("Path parameter is required", 400));
  }

  const host = req.headers.host || "";
  const protocol = req.protocol || "http";

  // Parse path to extract the pure relative path if it's passed as a full URL
  let parsedPath = reqPath;
  if (reqPath.startsWith("http://") || reqPath.startsWith("https://")) {
    try {
      const urlObj = new URL(reqPath);
      parsedPath = urlObj.pathname + urlObj.search;
    } catch (e) {
      // Ignore URL parsing errors
    }
  }

  // Generate robust candidates list
  const uniqueCandidates = getRedirectCandidates(parsedPath, host, protocol);

  const redirect = await Redirect.findOne({
    sourceUrl: { $in: uniqueCandidates },
    isActive: true,
  });

  if (redirect) {
    // Update redirect count and last redirected time in background (non-blocking)
    Redirect.updateOne(
      { _id: redirect._id },
      {
        $inc: { redirectCount: 1 },
        $set: { lastRedirectedAt: new Date() },
      },
    ).catch((err) =>
      console.error("Error updating redirect stats in checkRedirect:", err),
    );
  }

  res.json({
    success: true,
    data: redirect,
  });
});
