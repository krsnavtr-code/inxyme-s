import Enrollment from "../model/enrollment.model.js";
import Course from "../model/course.model.js";
import User from "../model/User.js";
import asyncHandler from "express-async-handler";

// @desc    Enroll in a course (for both guests and authenticated users)
// @route   POST /api/enrollments
// @access  Public
export const enrollInCourse = asyncHandler(async (req, res) => {
  const { courseId, name, email, phone, message } = req.body;
  const userId = req.user?._id; // Will be undefined for guests

  // Check if course exists
  const course = await Course.findById(courseId);
  if (!course) {
    res.status(404);
    throw new Error("Course not found");
  }

  // Check for existing enrollment
  let existingEnrollment;

  if (userId) {
    // For authenticated users, check by user ID and course
    existingEnrollment = await Enrollment.findOne({
      user: userId,
      course: courseId,
      user: { $type: "objectId" },
    });
  } else {
    // For guests, check by email and course
    const guestEmail = (email || req.body.contactInfo?.email || "")
      .toLowerCase()
      .trim();

    if (!guestEmail) {
      res.status(400);
      throw new Error("Email is required for guest enrollment");
    }

    // Check for existing guest enrollment with the same email and course
    existingEnrollment = await Enrollment.findOne({
      "guestInfo.email": guestEmail,
      course: courseId,
      user: { $exists: false },
    });
  }

  if (existingEnrollment) {
    res.status(400);
    throw new Error("You are already enrolled in this course");
  }

  // Prepare base enrollment data
  const enrollmentData = {
    course: courseId,
    courseId: course._id.toString(),
    courseTitle: course.title,
    status: req.body.status || "pending",
    enrollmentDate: new Date(),
    lastAccessed: new Date(),
    progress: req.body.progress || 0,
    isGuestEnrollment: !userId,
    enrolledAt: Date.now(),
    // Explicitly set contactInfo to undefined to avoid index conflicts
    contactInfo: undefined,
  };

  // Handle authenticated user enrollment
  if (userId) {
    enrollmentData.user = userId;
  }
  // Handle guest enrollment
  else {
    // Get contact info from either contactInfo object or individual fields
    const contactInfo = req.body.contactInfo || {};

    // Create guestInfo object with proper validation
    const guestInfo = {
      name: (contactInfo.name || name || "").trim(),
      email: (contactInfo.email || email || "").toLowerCase().trim(),
      phone: (contactInfo.phone || phone || "").trim(),
      message: (contactInfo.message || message || "").trim(),
    };

    // Validate required fields
    if (!guestInfo.name) {
      res.status(400);
      throw new Error("Name is required for guest enrollment");
    }

    if (!guestInfo.email) {
      res.status(400);
      throw new Error("Email is required for guest enrollment");
    }

    // Assign guestInfo to the enrollment
    enrollmentData.guestInfo = guestInfo;
  }

  // Add any additional fields from the request
  if (req.body.progress !== undefined) {
    enrollmentData.progress = req.body.progress;
  }

  if (req.body.status) {
    enrollmentData.status = req.body.status;
  }

  const enrollment = await Enrollment.create(enrollmentData);

  res.status(201).json({
    success: true,
    data: enrollment,
  });
});

// @desc    Get user's enrollments
// @route   GET /api/enrollments/my-enrollments
// @access  Private
// @desc    Admin enrolls a user in a course
// @route   POST /api/enrollments/admin-enroll
// @access  Private/Admin
export const adminEnrollUser = asyncHandler(async (req, res) => {
  const { userId, courseId, status = "active" } = req.body;

  // Check if user exists
  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Check if course exists
  const course = await Course.findById(courseId);
  if (!course) {
    res.status(404);
    throw new Error("Course not found");
  }

  // Check for existing enrollment
  const existingEnrollment = await Enrollment.findOne({
    user: userId,
    course: courseId,
  });

  if (existingEnrollment) {
    res.status(400);
    throw new Error("User is already enrolled in this course");
  }

  // Create new enrollment
  const enrollment = await Enrollment.create({
    user: userId,
    course: courseId,
    courseId: course._id.toString(),
    courseTitle: course.title,
    status,
    enrollmentDate: new Date(),
    lastAccessed: new Date(),
    progress: 0,
    isGuestEnrollment: false,
    enrolledAt: Date.now(),
    enrolledBy: req.user._id, // Track which admin enrolled the user
  });

  res.status(201).json({
    success: true,
    data: enrollment,
  });
});

// @desc    Get user's enrollments
// @route   GET /api/enrollments/my-enrollments
// @access  Private
export const getMyEnrollments = asyncHandler(async (req, res) => {
  try {
    if (!req.user) {
      console.error("No authenticated user found");
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    let query = {};

    // Ensure we have a valid user ID
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      console.error("No user ID found in request");
      return res.status(400).json({
        success: false,
        message: "User ID not found in request",
      });
    }

    // If userId is provided and user is admin/employee, use that userId
    const isAdmin = req.user && (req.user.role === "admin" || req.user.role === "employee" || Boolean(req.user.adminRoleId));
    if (req.query.userId && isAdmin) {
      query.user = req.query.userId;
    } else {
      // For regular users, only return their non-guest enrollments
      query.user = userId; // Use the user ID directly
      query.isGuestEnrollment = { $ne: true }; // Explicitly exclude guest enrollments
    }

    const enrollments = await Enrollment.find(query)
      .populate("course", "title thumbnail price")
      .populate("batch", "name code status teacher whatsappGroupLink")
      .sort("-createdAt")
      .lean(); // Convert to plain JS objects for logging

    res.json({
      success: true,
      data: enrollments,
    });
  } catch (error) {
    console.error("Error in getMyEnrollments:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// @desc    Get all enrollments (admin only)
// @route   GET /api/enrollments/all
// @access  Private/Admin
export const getAllEnrollments = asyncHandler(async (req, res) => {
  const enrollments = await Enrollment.find({})
    .populate("user", "name email")
    .populate("course", "title")
    .sort("-enrolledAt");

  res.json({
    success: true,
    count: enrollments.length,
    data: enrollments,
  });
});

// @desc    Get pending enrollments (admin only)
// @route   GET /api/enrollments/pending
// @access  Private/Admin
export const getPendingEnrollments = asyncHandler(async (req, res) => {
  const enrollments = await Enrollment.find({ status: "pending" })
    .populate("user", "name email")
    .populate("course", "title")
    .sort("-enrolledAt");

  res.json({
    success: true,
    count: enrollments.length,
    data: enrollments,
  });
});

// @desc    Update enrollment status (admin only)
// @route   PUT /api/enrollments/:id/status
// @access  Private/Admin
export const updateEnrollmentStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const enrollment = await Enrollment.findById(req.params.id);

  if (!enrollment) {
    res.status(404);
    throw new Error("Enrollment not found");
  }

  enrollment.status = status;
  await enrollment.save();

  res.json({
    success: true,
    data: enrollment,
  });
});

// @desc    Update pending enrollment to active (admin only)
// @route   PUT /api/enrollments/:id/activate
// @access  Private/Admin
export const updatePendingToActive = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findById(req.params.id);

  if (!enrollment) {
    res.status(404);
    throw new Error("Enrollment not found");
  }

  if (enrollment.status !== "pending") {
    res.status(400);
    throw new Error("Only pending enrollments can be activated");
  }

  enrollment.status = "active";
  await enrollment.save();

  res.json({
    success: true,
    data: enrollment,
  });
});

// @desc    Enroll in a batch (automatically enrolls in the associated course)
// @route   POST /api/enrollments/batch
// @access  Private
export const enrollInBatch = asyncHandler(async (req, res) => {
  const { batchId, userId: targetUserId } = req.body;
  const userId = targetUserId || req.user?._id;

  if (!userId) {
    res.status(401);
    throw new Error("User authentication required");
  }

  if (!batchId) {
    res.status(400);
    throw new Error("Batch ID is required");
  }

  // Import Batch model
  const Batch = (await import("../model/batch.model.js")).default;

  // Check if batch exists
  const batch = await Batch.findById(batchId).populate("course");
  if (!batch) {
    res.status(404);
    throw new Error("Batch not found");
  }

  // Check if batch has capacity
  if (batch.currentEnrollment >= batch.maxCapacity) {
    res.status(400);
    throw new Error("Batch is full");
  }

  // Check if batch is active or upcoming
  if (batch.status === "completed" || batch.status === "cancelled") {
    res.status(400);
    throw new Error("Cannot enroll in a completed or cancelled batch");
  }

  // Check if user is already enrolled in this batch
  const existingBatchEnrollment = await Enrollment.findOne({
    user: userId,
    batch: batchId,
  });

  if (existingBatchEnrollment) {
    res.status(400);
    throw new Error("You are already enrolled in this batch");
  }

  // Check if user is already enrolled in the course (through another batch)
  const existingCourseEnrollment = await Enrollment.findOne({
    user: userId,
    course: batch.course._id,
  });

  if (existingCourseEnrollment) {
    res.status(400);
    throw new Error(
      "You are already enrolled in this course through another batch",
    );
  }

  // Create enrollment with both batch and course
  const enrollment = await Enrollment.create({
    user: userId,
    course: batch.course._id,
    batch: batchId,
    courseId: batch.course._id.toString(),
    courseTitle: batch.course.title,
    status: "active",
    enrollmentDate: new Date(),
    lastAccessed: new Date(),
    progress: 0,
    isGuestEnrollment: false,
    enrolledAt: Date.now(),
  });

  // Update user's enrolled courses
  await User.findByIdAndUpdate(
    userId,
    { $addToSet: { enrolledCourses: batch.course._id } },
    { new: true },
  );

  // Update user's enrolled batches
  await User.findByIdAndUpdate(
    userId,
    { $addToSet: { enrolledBatches: batchId } },
    { new: true },
  );

  // Update batch's current enrollment
  await Batch.findByIdAndUpdate(
    batchId,
    { $inc: { currentEnrollment: 1 } },
    { new: true },
  );

  // Update course's enrollment count
  await Course.findByIdAndUpdate(
    batch.course._id,
    { $inc: { enrollmentCount: 1 } },
    { new: true },
  );

  res.status(201).json({
    success: true,
    message: "Successfully enrolled in batch and course",
    data: enrollment,
  });
});
