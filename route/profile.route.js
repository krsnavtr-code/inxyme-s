import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../model/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Helper to extract user ID from token safely
const getUserIdFromHeader = (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.decode(token);
      if (decoded) {
        return decoded.id || decoded.userId || decoded._id;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
};

// @route   GET /api/profile
// @desc    Get user/student profile by query (userId or email) or token
// @access  Public with query or Private with token
router.get('/', async (req, res) => {
  try {
    const { userId, email } = req.query;
    let query = null;

    if (userId) {
      query = { _id: userId };
    } else if (email) {
      query = { email: String(email).trim().toLowerCase() };
    } else {
      const extractedId = getUserIdFromHeader(req);
      if (extractedId) {
        query = { _id: extractedId };
      }
    }

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'userId or email is required to fetch profile',
      });
    }

    const user = await User.findOne(query)
      .populate('enrolledCourses', 'title thumbnail slug price category level status isPublished')
      .populate('enrolledBatches', 'batchName batchCode timing')
      .select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found',
      });
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching user profile',
    });
  }
});

// @route   PUT /api/profile
// @desc    Update user profile (fullname, phone, address, upiId, department)
// @access  Supports both session token and direct payload with userId/email
router.put('/', async (req, res) => {
  try {
    const { userId, email, fullname, phone, address, upiId, department, designation, resumeUrl, resumeName } = req.body;

    let targetId = userId;
    if (!targetId && email) {
      const existingUser = await User.findOne({ email: String(email).trim().toLowerCase() });
      if (existingUser) {
        targetId = existingUser._id;
      }
    }

    if (!targetId) {
      targetId = getUserIdFromHeader(req);
    }

    if (!targetId) {
      return res.status(400).json({
        success: false,
        message: 'User ID or Email is required for updating profile',
      });
    }

    const updateData = {};
    if (fullname !== undefined && fullname.trim()) updateData.fullname = fullname.trim();
    if (phone !== undefined) updateData.phone = phone.trim();
    if (address !== undefined) updateData.address = address.trim();
    if (upiId !== undefined) updateData.upiId = upiId.trim();
    if (department !== undefined) updateData.department = department.trim();
    if (designation !== undefined) updateData.designation = designation.trim();
    if (resumeUrl !== undefined) {
      updateData.resumeUrl = resumeUrl.trim();
      updateData.resumeName = (resumeName || 'Resume.pdf').trim();
      updateData.resumeUpdatedAt = new Date();
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No editable fields provided for update',
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      targetId,
      { $set: updateData },
      { new: true, runValidators: false }
    )
      .populate('enrolledCourses', 'title thumbnail slug price category level status isPublished')
      .populate('enrolledBatches', 'batchName batchCode timing')
      .select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map((err) => err.message),
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || 'Server error while updating profile',
    });
  }
});

export default router;
