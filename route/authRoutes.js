import express from "express";
import {
  register,
  login,
  getUserProfile,
  refreshToken,
  changePassword,
  forgotPassword,
  verifyResetToken,
  resetPassword,
  verifyOTP,
  resendOTP,
  verifyAdminOTP,
} from "../controller/authController.js";
import { updateProfile } from "../controller/user.controller.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public routes
router.post("/register", register);
router.post("/login", login);
router.post("/refresh-token", refreshToken);
router.post("/forgot-password", forgotPassword);
router.get("/verify-reset-token", verifyResetToken);
router.post("/reset-password", resetPassword);
router.post("/verify-otp", verifyOTP);
router.post("/resend-otp", resendOTP);
router.post("/verify-admin-otp", verifyAdminOTP);

// Protected routes
router.get("/me", protect, getUserProfile);
router.get("/profile", protect, getUserProfile);
router.put("/profile", protect, updateProfile);
router.put("/change-password", protect, changePassword);

export default router;
