import express from "express";
import {
  submitReview,
  getReviewCourses,
  getPublicReviews,
  getAdminReviews,
  getReviewStats,
  updateReviewStatus,
  deleteReview,
} from "../controller/review.controller.js";
import { protect, restrictTo } from "../middleware/authMiddleware.js";
import {
  populateAdminPermissions,
  checkPermission,
} from "../middleware/adminPermissionMiddleware.js";

const router = express.Router();

// ==================== PUBLIC ROUTES ====================
// Submit a student review
router.post("/", submitReview);

// Get list of active courses for dropdown
router.get("/courses", getReviewCourses);

// Get approved public reviews
router.get("/public", getPublicReviews);

// ==================== ADMIN ROUTES ====================
// These can be accessed via /api/reviews/admin/* or directly via the dedicated adminReviewRouter
router.get(
  "/admin/all",
  protect,
  restrictTo("admin"),
  populateAdminPermissions,
  checkPermission("reviews", "canView"),
  getAdminReviews
);

router.get(
  "/admin/stats",
  protect,
  restrictTo("admin"),
  populateAdminPermissions,
  checkPermission("reviews", "canView"),
  getReviewStats
);

router.patch(
  "/admin/:id/status",
  protect,
  restrictTo("admin"),
  populateAdminPermissions,
  checkPermission("reviews", "canEdit"),
  updateReviewStatus
);

router.delete(
  "/admin/:id",
  protect,
  restrictTo("admin"),
  populateAdminPermissions,
  checkPermission("reviews", "canDelete"),
  deleteReview
);

// Dedicated router for mounting at /api/admin/reviews
export const adminReviewRouter = express.Router();
adminReviewRouter.use(protect);
adminReviewRouter.use(restrictTo("admin"));
adminReviewRouter.use(populateAdminPermissions);

adminReviewRouter.get("/", checkPermission("reviews", "canView"), getAdminReviews);
adminReviewRouter.get("/stats", checkPermission("reviews", "canView"), getReviewStats);
adminReviewRouter.patch("/:id/status", checkPermission("reviews", "canEdit"), updateReviewStatus);
adminReviewRouter.delete("/:id", checkPermission("reviews", "canDelete"), deleteReview);

export default router;
