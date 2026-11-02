import express from "express";
import {
  getMyReferrals,
  requestPayout,
  createInvite,
  validateReferralCode,
} from "../controller/referral.controller.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Public route to validate a code (for checkouts/leads)
router.get("/validate/:code", validateReferralCode);

// Allow user access (can pass Bearer token or query userId/email)
router.get("/my-referrals", getMyReferrals);
router.post("/payout-request", requestPayout);
router.post("/invite", createInvite);

export default router;

