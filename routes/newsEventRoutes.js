import express from "express";
import { protect, authorize } from "../middleware/auth.js";
import {
  getAllNewsEvents,
  getNewsEventById,
  createNewsEvent,
  updateNewsEvent,
  deleteNewsEvent,
  seedDefaultNewsEvents,
} from "../controller/newsEvent.controller.js";

const router = express.Router();

// Public routes
router.get("/", getAllNewsEvents);
router.get("/:id", getNewsEventById);

// Admin routes
router.post("/", protect, authorize("admin", "employee"), createNewsEvent);
router.put("/:id", protect, authorize("admin", "employee"), updateNewsEvent);
router.patch("/:id", protect, authorize("admin", "employee"), updateNewsEvent);
router.delete("/:id", protect, authorize("admin", "employee"), deleteNewsEvent);
router.post("/seed", protect, authorize("admin"), seedDefaultNewsEvents);

export default router;
