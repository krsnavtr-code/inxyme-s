import express from "express";
import {
  enrollInCourse,
  getMyEnrollments,
  getUserEnrollmentsAdmin,
  adminEnrollUser,
  updateEnrollmentStatus,
  getPendingEnrollments,
  updatePendingToActive,
  getAllEnrollments,
  enrollInBatch,
  getLmsUserEnrollments,
} from "../controller/enrollment.controller.js";
import { protect, admin, authorize } from "../middleware/auth.js";

const router = express.Router();

// Public route for LMS / Smart Board user enrollments
router.route("/lms-user/:userId").get(getLmsUserEnrollments);
router.route("/lms-user").get(getLmsUserEnrollments);

// Public route for course enrollment (both guests and authenticated users)
router.route("/").post(enrollInCourse);

// Protected route for viewing user's enrollments (only for authenticated users)
router.route("/my-enrollments").get(protect, getMyEnrollments);

// Admin route to get a specific user's enrollments
router.route("/user/:userId").get(protect, admin, getUserEnrollmentsAdmin);

// Admin route for enrolling users in courses
router.route("/admin-enroll").post(protect, admin, adminEnrollUser);

// Get all enrollments (admin only)
router.route("/all").get(protect, admin, getAllEnrollments);

// Get pending enrollments (admin only)
router.route("/pending").get(protect, admin, getPendingEnrollments);

// Update enrollment status (admin only)
router.route("/:id/status").put(protect, admin, updateEnrollmentStatus);

// Route for enrolling in a batch (automatically enrolls in the associated course)
router.route("/batch").post(protect, enrollInBatch);

export default router;
