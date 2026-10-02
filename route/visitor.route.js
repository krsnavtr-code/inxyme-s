import { Router } from "express";
import {
  trackVisitor,
  identifyVisitor,
  getAllVisitors,
  getServerTrackingStats,
} from "../controller/visitorController.js";
import { protect } from "../middleware/auth.js";
import { isAdmin } from "../middleware/admin.js";
import { socketMiddleware } from "../middleware/socketMiddleware.js";

const router = Router();

// Public tracking routes (called silently from frontend)
router.post("/track", socketMiddleware, trackVisitor);
router.post("/identify", identifyVisitor);
router.get("/server-tracking-stats", getServerTrackingStats);

// Protected admin routes
router.get("/", protect, isAdmin, getAllVisitors);

export default router;

