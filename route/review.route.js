import express from "express";
import multer from "multer";
import path from "path";
import fsSync from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Always points to server/public/uploads
const uploadsDir = path.resolve(__dirname, "..", "public", "uploads");

import {
  submitReview,
  submitVideoReview,
  uploadReviewVideoFile,
  uploadReviewPhotoFile,
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

// Multer storage for review videos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fsSync.existsSync(uploadsDir)) {
      fsSync.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || ".webm";
    const baseName =
      path
        .basename(file.originalname, ext)
        .replace(/[^\w\d-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "") || "video-review";

    const randomSuffix = Math.floor(Math.random() * 100000)
      .toString()
      .padStart(5, "0");
    const filename = `review-${baseName}-${Date.now()}-${randomSuffix}${ext}`;
    cb(null, filename);
  },
});

const uploadReviewVideo = multer({
  storage: storage,
  limits: {
    fileSize: 150 * 1024 * 1024, // 150MB max file size
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.startsWith("video/") ||
      file.mimetype === "application/octet-stream" ||
      /\.(mp4|webm|mov|mkv|avi|3gp)$/i.test(file.originalname)
    ) {
      cb(null, true);
    } else {
      cb(new Error("Please upload a valid video file (MP4, WebM, MOV)."));
    }
  },
});

// Multer storage for student selfie photos (Written review)
const uploadReviewPhoto = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for selfie photo
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Please upload a valid image file (JPEG, PNG, WebP)."));
    }
  },
});

// ==================== PUBLIC ROUTES ====================
// Submit a written student review (supports optional selfie photo directly or pre-uploaded URL)
router.post("/", uploadReviewPhoto.single("photo"), submitReview);

// Fast selfie photo upload for written review
router.post("/upload-photo", uploadReviewPhoto.single("photo"), uploadReviewPhotoFile);

// Submit a recorded or uploaded video review
router.post("/video", uploadReviewVideo.single("video"), submitVideoReview);

// Fast background video pre-upload
router.post("/upload-video", uploadReviewVideo.single("video"), uploadReviewVideoFile);

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
