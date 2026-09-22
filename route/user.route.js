import express from "express";
import bcrypt from "bcryptjs";
import User from "../model/User.js";
import { isAdmin } from "../middleware/admin.js";
import jwt from "jsonwebtoken";
import { signup, login } from "../controller/user.controller.js";
import validateObjectId from "../middleware/validateObjectId.js";

// Auth middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return res
        .status(401)
        .json({ message: "No token, authorization denied" });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your_jwt_secret",
    );
    const userId = decoded.userId || decoded.id || decoded._id;
    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth error:", error);
    res.status(401).json({ message: "Token is not valid" });
  }
};

const router = express.Router();

// ====================================
// Public Routes (No Authentication)
// ====================================

// @route   POST /api/users/signup
// @desc    Register a new user
// @access  Public
router.post("/signup", signup);

// @route   GET /api/users/signup
// @desc    Prevent signup page from being treated as an ID
// @access  Public
router.get("/signup", (req, res) => {
  res.status(405).json({
    success: false,
    message:
      "Method not allowed. Use POST /api/users/signup to register a new user.",
    error: "METHOD_NOT_ALLOWED",
  });
});

// @route   POST /api/users/login
// @desc    Authenticate user & get token
// @access  Public
router.post("/login", login);

// @route   GET /api/users/login
// @desc    Prevent login page from being treated as an ID
// @access  Public
router.get("/login", (req, res) => {
  res.status(405).json({
    success: false,
    message: "Method not allowed. Use POST /api/users/login to authenticate.",
    error: "METHOD_NOT_ALLOWED",
  });
});

// @route   POST /api/users/reset-password
// @desc    Reset password (temporary route for development)
// @access  Public
router.post("/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email and new password are required",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    await user.save();

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during password reset",
    });
  }
});

// ====================================
// Protected Routes (Require Authentication)
// ====================================

// @route   GET /api/users
// @desc    Get all users (Admin only)
// @access  Private/Admin
router.get("/", [auth, isAdmin], async (req, res) => {
  try {
    const users = await User.find({}).select("-password");
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ====================================
// Parameterized Routes (Must come after specific routes)
// ====================================

// @route   GET /api/users/:id
// @desc    Get user by ID (Admin only)
// @access  Private/Admin
router.get("/:id", [auth, isAdmin, validateObjectId], async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        error: "USER_NOT_FOUND",
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Error fetching user:", error);

    // Handle specific MongoDB errors
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
        error: "INVALID_USER_ID",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while fetching user",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// @route   POST /api/users
// @desc    Create a user (Admin only)
// @access  Private/Admin
router.post("/", [auth, isAdmin], async (req, res) => {
  try {
    const { email, password, role, ...rest } = req.body;

    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Create user
    user = new User({
      email,
      password,
      role,
      ...rest,
    });

    await user.save();

    // Remove password from response
    user = user.toObject();
    delete user.password;

    res.status(201).json(user);
  } catch (error) {
    console.error("Error creating user:", error);
    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: "Validation error",
        errors: Object.values(error.errors).map((err) => err.message),
      });
    }
    res.status(500).json({ message: "Server error" });
  }
});

// @route   PUT /api/users/:id
// @desc    Update user (Admin only)
// @access  Private/Admin
// @route   PUT /api/users/:id/status
// @desc    Update user status (active/inactive)
// @access  Private/Admin
router.put(
  "/:id/status",
  [auth, isAdmin, validateObjectId],
  async (req, res) => {
    try {
      const { isActive } = req.body;

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { isActive },
        { new: true, runValidators: true },
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "User status updated successfully",
        data: user,
      });
    } catch (error) {
      console.error("Error updating user status:", error);
      res.status(500).json({
        success: false,
        message: "Error updating user status",
        error: error.message,
      });
    }
  },
);

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Private/Admin
router.put("/:id", [auth, isAdmin, validateObjectId], async (req, res) => {
  try {
    const { fullname, name, email, role, isActive } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        error: "USER_NOT_FOUND",
      });
    }

    // Check if email is being updated and if it's already taken
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Email already in use",
          error: "EMAIL_IN_USE",
        });
      }
      user.email = email;
    }

    // Update user fields
    // Prefer `fullname` field used in the schema; accept `name` as fallback for legacy payloads
    if (fullname || name) user.fullname = fullname || name;
    if (role) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();

    // Remove sensitive data before sending response
    const userObj = user.toObject();
    delete userObj.password;
    delete userObj.__v;

    res.json({
      success: true,
      data: userObj,
      message: "User updated successfully",
    });
  } catch (error) {
    console.error("Error updating user:", error);

    // Handle duplicate key error (e.g., duplicate email)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Email already in use",
        error: "DUPLICATE_EMAIL",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while updating user",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete user (Admin only)
// @access  Private/Admin
router.delete("/:id", [auth, isAdmin, validateObjectId], async (req, res) => {
  try {
    // Prevent deleting own account
    if (req.user.id === req.params.id) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete your own account",
        error: "SELF_DELETE_NOT_ALLOWED",
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        error: "USER_NOT_FOUND",
      });
    }

    await user.remove();

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting user:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
        error: "INVALID_USER_ID",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while deleting user",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile (phone and address only)
// @access  Private (any authenticated user)
router.put(
  "/profile",
  // Only use auth middleware, not isAdmin
  auth,
  async (req, res) => {
    try {
      const { phone, address, ...otherData } = req.body;

      // Only allow updating specific fields
      const updateData = {};
      if (phone !== undefined) updateData.phone = phone;
      if (address !== undefined) updateData.address = address;

      // Prevent updating other fields through this endpoint
      if (Object.keys(otherData).length > 0) {
        return res.status(400).json({
          success: false,
          message:
            "Only phone and address can be updated through this endpoint",
        });
      }

      const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: updateData },
        { new: true, runValidators: true },
      ).select("-password");

      if (!user) {
        console.error("User not found for profile update:", req.user._id);
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        message: "Profile updated successfully",
        user,
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      if (error.name === "ValidationError") {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: Object.values(error.errors).map((err) => err.message),
        });
      }
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  },
);

// @route   PUT /api/users/:id/status
// @desc    Update user status (Admin only)
// @access  Private/Admin
router.put("/:id/status", [auth, isAdmin], async (req, res) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be a boolean" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true },
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error updating user status:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route   PUT /api/users/:id/password
// @desc    Change user password (Admin only)
// @access  Private/Admin
router.put("/:id/password", [auth, isAdmin], async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters long" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { password: hashedPassword },
      { new: true },
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route   PUT /api/users/:id/lms-status
// @desc    Update user LMS approval status (Admin only)
// @access  Private/Admin
router.put("/:id/lms-status", [auth, isAdmin], async (req, res) => {
  try {
    const { isApproved } = req.body;

    if (typeof isApproved !== "boolean") {
      return res.status(400).json({ message: "isApproved must be a boolean" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isApproved },
      { new: true },
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      success: true,
      message: "LMS status updated successfully",
      data: user,
    });
  } catch (error) {
    console.error("Error updating LMS status:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route   PUT /api/users/:id/discount
// @desc    Update user discount percentage (Admin only)
// @access  Private/Admin
router.put("/:id/discount", [auth, isAdmin], async (req, res) => {
  try {
    const { discount } = req.body;

    // Validate discount value
    if (typeof discount !== "number" || discount < 0 || discount > 100) {
      return res.status(400).json({
        success: false,
        message: "Discount must be a number between 0 and 100",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { discount },
      { new: true, runValidators: true },
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      message: "Discount updated successfully",
      data: user,
    });
  } catch (error) {
    console.error("Error updating discount:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

export default router;
