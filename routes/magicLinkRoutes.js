import express from "express";
import {
  resolveMagicLink,
  generateMagicLink,
} from "../controller/magicLinkController.js";

const router = express.Router();

// Resolve magic link (public for any returning student/visitor)
router.get("/resolve", resolveMagicLink);
router.get("/:identifier", resolveMagicLink);

// Generate magic link (callable from frontend share or admin)
router.post("/generate", generateMagicLink);

export default router;
