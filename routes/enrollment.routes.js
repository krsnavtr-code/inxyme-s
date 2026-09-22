import express from "express";
import {
  enrollInCourse,
  getMyEnrollments,
  adminEnrollUser,
  enrollInBatch,
} from "../controller/enrollment.controller.js";
import { protect, admin } from "../middleware/auth.js";

const router = express.Router();

// Public route for course enrollment (both guests and authenticated users)
router.route("/").post(enrollInCourse);

// Route for viewing user's enrollments
// Admins can view enrollments for any user by providing userId
// Regular users can only view their own enrollments
router.route("/my-enrollments").get(protect, (req, res, next) => {
  // If userId is provided and user is admin, allow viewing other user's enrollments
  const isAdmin = req.user && (req.user.role === "admin" || req.user.role === "employee" || Boolean(req.user.adminRoleId));
  if (req.query.userId && isAdmin) {
    return getMyEnrollments(req, res, next);
  }
  // Otherwise, only allow viewing own enrollments
  return getMyEnrollments(req, res, next);
});

// Admin route for enrolling users in courses
router.route("/admin-enroll").post(protect, admin, adminEnrollUser);

// Route for enrolling in a batch (automatically enrolls in the associated course)
router.route("/batch").post(protect, enrollInBatch);

export default router;
