import express from "express";
import { protect, authorize } from "../middleware/auth.js";
import {
  getAllSuccessStories,
  getSuccessStoryById,
  createSuccessStory,
  updateSuccessStory,
  deleteSuccessStory,
  seedDefaultSuccessStories,
} from "../controller/successStory.controller.js";

const router = express.Router();

// Public routes
router.get("/", getAllSuccessStories);
router.get("/:id", getSuccessStoryById);

// Admin routes
router.post("/", protect, authorize("admin", "employee"), createSuccessStory);
router.put("/:id", protect, authorize("admin", "employee"), updateSuccessStory);
router.patch("/:id", protect, authorize("admin", "employee"), updateSuccessStory);
router.delete("/:id", protect, authorize("admin", "employee"), deleteSuccessStory);
router.post("/seed", protect, authorize("admin"), seedDefaultSuccessStories);

export default router;
