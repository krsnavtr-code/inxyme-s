import mongoose from "mongoose";
import Review from "../model/review.model.js";
import Course from "../model/course.model.js";

// Helper to recalculate course rating and review counts
export const updateCourseReviewStats = async (courseId) => {
  try {
    if (!courseId) return;

    const stats = await Review.aggregate([
      {
        $match: {
          course: new mongoose.Types.ObjectId(courseId),
          status: "approved",
        },
      },
      {
        $group: {
          _id: "$course",
          totalReviews: { $sum: 1 },
          averageRating: { $avg: "$rating" },
        },
      },
    ]);

    if (stats.length > 0) {
      await Course.findByIdAndUpdate(courseId, {
        totalReviews: stats[0].totalReviews,
        averageRating: Math.round(stats[0].averageRating * 10) / 10,
      });
    } else {
      await Course.findByIdAndUpdate(courseId, {
        totalReviews: 0,
        averageRating: 0,
      });
    }
  } catch (err) {
    console.error("Error updating course review stats:", err);
  }
};

// ==================== PUBLIC CONTROLLERS ====================

// 1. Submit a student review (Public)
export const submitReview = async (req, res) => {
  try {
    const {
      courseId,
      courseSlug,
      studentName,
      studentEmail,
      studentPhone,
      rating,
      tags,
      reviewText,
    } = req.body;

    if (!studentName || !studentName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please enter your name.",
      });
    }

    const numericRating = Number(rating);
    if (!numericRating || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        success: false,
        message: "Please select a star rating between 1 and 5.",
      });
    }

    // Find course by ID or slug if provided
    let courseDoc = null;
    if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
      courseDoc = await Course.findById(courseId);
    }

    if (!courseDoc && courseSlug) {
      courseDoc = await Course.findOne({
        slug: courseSlug.toString().toLowerCase().trim(),
      });
    }

    // IP address logging
    const ipAddress =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      "";

    // Clean tags
    let cleanedTags = [];
    if (Array.isArray(tags)) {
      cleanedTags = tags.filter((t) => typeof t === "string" && t.trim() !== "");
    }

    const resolvedCourseName = courseDoc
      ? courseDoc.title
      : req.body.courseName?.trim() || "Inxyme Learning";

    const newReview = await Review.create({
      course: courseDoc ? courseDoc._id : null,
      courseName: resolvedCourseName,
      courseSlug: courseDoc ? courseDoc.slug : "",
      studentName: studentName.trim(),
      studentEmail: studentEmail ? studentEmail.trim().toLowerCase() : "",
      studentPhone: studentPhone ? studentPhone.trim() : "",
      rating: numericRating,
      tags: cleanedTags,
      reviewText: reviewText ? reviewText.trim() : "",
      status: "pending",
      verified: false,
      ipAddress,
    });

    return res.status(201).json({
      success: true,
      message:
        "Thank you! Your review has been submitted successfully and will be verified by our team.",
      data: newReview,
    });
  } catch (error) {
    console.error("Error submitting review:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while submitting your review. Please try again.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 2. Get list of courses for review selection (Public)
export const getReviewCourses = async (req, res) => {
  try {
    const courses = await Course.find({ isPublished: true })
      .select("_id title slug image thumbnail category duration level price")
      .populate("category", "name")
      .sort({ title: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    console.error("Error fetching review courses:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch courses.",
    });
  }
};

// 3. Get approved reviews (Public, optional for course detail / website)
export const getPublicReviews = async (req, res) => {
  try {
    const { courseId, courseSlug, limit = 10 } = req.query;
    const filter = { status: "approved" };

    if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
      filter.course = courseId;
    } else if (courseSlug) {
      filter.courseSlug = courseSlug.toString().toLowerCase().trim();
    }

    const reviews = await Review.find(filter)
      .select("studentName rating tags reviewText courseName courseSlug createdAt")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

    return res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews,
    });
  } catch (error) {
    console.error("Error fetching public reviews:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch reviews.",
    });
  }
};

// ==================== ADMIN CONTROLLERS ====================

// 4. Get all reviews with filters & pagination (Admin)
export const getAdminReviews = async (req, res) => {
  try {
    const {
      status,
      courseId,
      rating,
      search,
      page = 1,
      limit = 15,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const filter = {};

    if (status && status !== "all") {
      filter.status = status;
    }

    if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
      filter.course = courseId;
    }

    if (rating && !isNaN(rating)) {
      filter.rating = Number(rating);
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      filter.$or = [
        { studentName: { $regex: searchRegex } },
        { studentEmail: { $regex: searchRegex } },
        { studentPhone: { $regex: searchRegex } },
        { reviewText: { $regex: searchRegex } },
        { courseName: { $regex: searchRegex } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    const sortOption = {};
    sortOption[sortBy] = sortOrder === "asc" ? 1 : -1;

    const [reviews, totalCount] = await Promise.all([
      Review.find(filter)
        .populate("course", "title slug thumbnail image")
        .populate("verifiedBy", "fullname email")
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Review.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: reviews,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching admin reviews:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch reviews.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 5. Get review statistics for admin dashboard (Admin)
export const getReviewStats = async (req, res) => {
  try {
    const [total, pending, approved, rejected, ratingStats] = await Promise.all([
      Review.countDocuments(),
      Review.countDocuments({ status: "pending" }),
      Review.countDocuments({ status: "approved" }),
      Review.countDocuments({ status: "rejected" }),
      Review.aggregate([
        { $match: { status: "approved" } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const averageRating =
      ratingStats.length > 0
        ? Math.round(ratingStats[0].averageRating * 10) / 10
        : 0;

    return res.status(200).json({
      success: true,
      data: {
        total,
        pending,
        approved,
        rejected,
        averageRating,
      },
    });
  } catch (error) {
    console.error("Error fetching review stats:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch review statistics.",
    });
  }
};

// 6. Update review status (Verify / Approve / Reject) (Admin)
export const updateReviewStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body;

    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value. Must be 'pending', 'approved', or 'rejected'.",
      });
    }

    const review = await Review.findById(id);
    if (!review) {
      return res.status(400).json({
        success: false,
        message: "Review not found.",
      });
    }

    const isNowApproved = status === "approved";
    review.status = status;
    review.verified = isNowApproved;
    review.verifiedAt = isNowApproved ? new Date() : null;
    review.verifiedBy = isNowApproved ? req.user?._id : null;

    if (adminNote !== undefined) {
      review.adminNote = adminNote.trim();
    }

    await review.save();

    // Recalculate course average rating and review counts
    await updateCourseReviewStats(review.course);

    return res.status(200).json({
      success: true,
      message: `Review ${status === "approved" ? "verified and approved" : status} successfully.`,
      data: review,
    });
  } catch (error) {
    console.error("Error updating review status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update review status.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 7. Delete review (Admin)
export const deleteReview = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found.",
      });
    }

    const courseId = review.course;
    await Review.findByIdAndDelete(id);

    // Recalculate course rating
    await updateCourseReviewStats(courseId);

    return res.status(200).json({
      success: true,
      message: "Review deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete review.",
    });
  }
};
