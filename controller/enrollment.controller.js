import Enrollment from "../model/enrollment.model.js";
import Course from "../model/course.model.js";
import User from "../model/User.js";
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";

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

  // Also sync enrolled courses to User document
  if (createdEnrollments.length > 0) {
    try {
      const enrolledIds = createdEnrollments.map(e => e.course || e.courseId).filter(Boolean);
      await User.findByIdAndUpdate(userId, {
        $addToSet: { enrolledCourses: { $each: enrolledIds } }
      });
    } catch (uErr) {
      console.warn("Failed to update user.enrolledCourses:", uErr);
    }
  }

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
  const { userId, courseId, courseIds, status = "active" } = req.body;

  // Check if user exists
  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Support both single courseId and multiple courseIds
  const idsToEnroll = Array.isArray(courseIds)
    ? courseIds
    : courseId
      ? [courseId]
      : [];

  if (idsToEnroll.length === 0) {
    res.status(400);
    throw new Error("Please provide at least one course to enroll");
  }

  const createdEnrollments = [];
  const errors = [];

  for (const cId of idsToEnroll) {
    const course = await Course.findById(cId);
    if (!course) {
      errors.push(`Course not found for ID: ${cId}`);
      continue;
    }

    const existingEnrollment = await Enrollment.findOne({
      user: userId,
      course: cId,
    });

    if (existingEnrollment) {
      errors.push(`User is already enrolled in "${course.title}"`);
      continue;
    }

    const enrollment = await Enrollment.create({
      user: userId,
      course: cId,
      courseId: course._id.toString(),
      courseTitle: course.title,
      status,
      enrollmentDate: new Date(),
      lastAccessed: new Date(),
      progress: 0,
      isGuestEnrollment: false,
      enrolledAt: Date.now(),
      enrolledBy: req.user?._id,
    });

    createdEnrollments.push(enrollment);
  }

  if (createdEnrollments.length === 0 && errors.length > 0) {
    res.status(400);
    throw new Error(errors.join(". "));
  }

  // Sync to User's enrolledCourses array
  if (createdEnrollments.length > 0) {
    const newCourseIds = createdEnrollments.map((e) => e.course);
    await User.findByIdAndUpdate(userId, {
      $addToSet: { enrolledCourses: { $each: newCourseIds } },
    }).catch((err) => console.warn("Failed to sync enrolledCourses to User:", err));
  }

  res.status(201).json({
    success: true,
    data: createdEnrollments.length === 1 && courseId ? createdEnrollments[0] : createdEnrollments,
    enrolledCount: createdEnrollments.length,
    warnings: errors.length > 0 ? errors : undefined,
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

    const currentUserId = req.user?._id || req.user?.id;
    if (!currentUserId) {
      console.error("No user ID found in request");
      return res.status(400).json({
        success: false,
        message: "User ID not found in request",
      });
    }

    const isAdmin =
      req.user &&
      (req.user.role === "admin" ||
        req.user.role === "ADMIN" ||
        req.user.role === "employee" ||
        req.user.role === "teacher" ||
        Boolean(req.user.adminRoleId));

    let targetUserId = currentUserId;
    if (
      req.query.userId &&
      (isAdmin || String(req.query.userId) === String(currentUserId))
    ) {
      targetUserId = req.query.userId;
    }

    const targetUser = await User.findById(targetUserId)
      .populate("enrolledCourses", "title thumbnail price slug category level")
      .lean();

    const orConditions = [{ user: targetUserId }];
    if (targetUser?.email) {
      const cleanEmail = targetUser.email.toLowerCase().trim();
      orConditions.push({ "guestInfo.email": cleanEmail });
      orConditions.push({ "contactInfo.email": cleanEmail });
      orConditions.push({ email: cleanEmail });
    }

    let enrollments = await Enrollment.find({ $or: orConditions })
      .populate("course", "title thumbnail price slug category level")
      .populate("batch", "name code status teacher whatsappGroupLink")
      .sort("-createdAt")
      .lean();

    const enrolledCourseIdSet = new Set();
    enrollments.forEach((e) => {
      const cId = (e.course?._id || e.course || e.courseId)?.toString();
      if (cId) enrolledCourseIdSet.add(cId);
    });

    if (targetUser && Array.isArray(targetUser.enrolledCourses)) {
      for (const c of targetUser.enrolledCourses) {
        if (!c) continue;
        const cId = (c._id || c).toString();
        if (!enrolledCourseIdSet.has(cId)) {
          enrolledCourseIdSet.add(cId);
          enrollments.push({
            _id: "user_course_" + cId,
            user: targetUserId,
            course:
              typeof c === "object"
                ? c
                : { _id: cId, title: "Enrolled Course" },
            courseId: cId,
            courseTitle: typeof c === "object" ? c.title : "Enrolled Course",
            status: "active",
            enrollmentDate:
              targetUser.updatedAt || targetUser.createdAt || new Date(),
            progress: 0,
            isGuestEnrollment: false,
          });
        }
      }
    }

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

// @desc    Admin get user's enrollments by userId
// @route   GET /api/enrollments/user/:userId
// @access  Private/Admin
export const getUserEnrollmentsAdmin = asyncHandler(async (req, res) => {
  req.query.userId = req.params.userId;
  return getMyEnrollments(req, res);
});

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


// @desc    Get user's enrolled courses for LMS / Smart Board
// @route   GET /api/enrollments/lms-user/:userId
// @access  Public (LMS Integration)
export const getLmsUserEnrollments = asyncHandler(async (req, res) => {
  const userId = req.params.userId || req.query.userId;
  const email = (req.query.email || "").toString().toLowerCase().trim();

  let targetUser = null;
  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    targetUser = await User.findById(userId).populate("enrolledCourses").lean();
  }
  if (!targetUser && email) {
    targetUser = await User.findOne({ email }).populate("enrolledCourses").lean();
  }

  const effectiveUserId = targetUser?._id?.toString() || userId;
  const orConditions = [];

  if (effectiveUserId && mongoose.Types.ObjectId.isValid(effectiveUserId)) {
    orConditions.push({ user: effectiveUserId });
  }
  if (targetUser?.email || email) {
    const cleanEmail = (targetUser?.email || email).toLowerCase().trim();
    orConditions.push({ "guestInfo.email": cleanEmail });
    orConditions.push({ "contactInfo.email": cleanEmail });
    orConditions.push({ email: cleanEmail });
  }

  let enrollments = [];
  if (orConditions.length > 0) {
    enrollments = await Enrollment.find({ $or: orConditions })
      .populate("course", "title thumbnail price slug category level isPublished status isActive")
      .populate("batch", "name code status teacher whatsappGroupLink")
      .sort("-createdAt")
      .lean();
  }

  const enrolledCourseIdSet = new Set();
  const enrolledCoursesList = [];

  enrollments.forEach((e) => {
    const cId = (e.course?._id || e.course || e.courseId)?.toString();
    if (cId) {
      enrolledCourseIdSet.add(cId);
      if (e.course && typeof e.course === "object") {
        enrolledCoursesList.push(e.course);
      }
    }
  });

  // Also include courses from user's enrolledCourses array
  if (targetUser && Array.isArray(targetUser.enrolledCourses)) {
    for (const c of targetUser.enrolledCourses) {
      if (!c) continue;
      const cId = (c._id || c).toString();
      if (!enrolledCourseIdSet.has(cId)) {
        enrolledCourseIdSet.add(cId);
        if (typeof c === "object") {
          enrolledCoursesList.push(c);
        }
        enrollments.push({
          _id: "user_course_" + cId,
          user: targetUser._id,
          course: c,
          courseId: cId,
          courseTitle: typeof c === "object" ? c.title : "Enrolled Course",
          status: "active",
          enrollmentDate: targetUser.updatedAt || targetUser.createdAt || new Date(),
          progress: 0,
        });
      }
    }
  }

  // Back-sync to User.enrolledCourses if missing
  if (targetUser?._id && enrolledCourseIdSet.size > 0) {
    const idsToSync = Array.from(enrolledCourseIdSet).filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );
    if (idsToSync.length > 0) {
      await User.findByIdAndUpdate(targetUser._id, {
        $addToSet: { enrolledCourses: { $each: idsToSync } },
      }).catch(() => {});
    }
  }

  res.json({
    success: true,
    count: enrollments.length,
    data: enrollments,
    courses: enrolledCoursesList,
    enrolledCourseIds: Array.from(enrolledCourseIdSet),
    user: {
      id: targetUser?._id || effectiveUserId,
      email: targetUser?.email || email,
      name: targetUser?.fullname,
    },
  });
});
