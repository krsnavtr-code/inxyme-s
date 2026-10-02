import { Router } from "express";
import {
  capturePartialLead,
  convertPartialLead,
  getAllPartialLeads,
} from "../controller/partialLeadController.js";
import { protect } from "../middleware/auth.js";
import { isAdmin } from "../middleware/admin.js";

const router = Router();

// Public routes — called silently from frontend onBlur events
router.post("/", capturePartialLead);
router.patch("/convert", convertPartialLead);

// Protected admin routes
router.get("/", protect, isAdmin, getAllPartialLeads);

export default router;
