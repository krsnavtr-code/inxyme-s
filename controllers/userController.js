import User from "../model/User.js";
import Course from "../model/course.model.js";
import { buildLmsInviteEmailContent } from "../utils/invoicePdfGenerator.js";
import { sendBrandedEmailWithRecord } from "../utils/brandedEmailSender.js";
import {
  computeDiscountFromOfferedPrice,
  resolveCourseBasePrice,
} from "../utils/userDiscountPricing.js";

// Get all users
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .populate("enrolledCourses", "title thumbnail slug price originalPrice isFree")
      .sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Error fetching users" });
  }
};

// Get LMS users (public endpoint for Smart Board authentication & directory)
export const getLmsUsers = async (req, res) => {
  try {
    const users = await User.find(
      {},
      "_id fullname email role isActive isApproved department phone address upiId referralCode studentId designation resumeUrl resumeName resumeUpdatedAt createdAt lastLogin enrolledCourses enrolledBatches"
    )
      .populate("enrolledCourses", "title thumbnail slug price status isPublished isActive")
      .populate("enrolledBatches", "batchName batchCode timing")
      .sort({ fullname: 1 })
      .lean();
    res.status(200).json({ success: true, users });
  } catch (error) {
    console.error("Error fetching LMS users:", error);
    res.status(500).json({ success: false, message: "Error fetching LMS users" });
  }
};

// Get user by ID
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate(
      "enrolledCourses",
      "title thumbnail slug price originalPrice isFree"
    );
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Error fetching user" });
  }
};

// Create a new user
export const createUser = async (req, res) => {
  try {
    const user = await User.create(req.body);
    res.status(201).json(user);
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ message: "Error creating user" });
  }
};

// Update user
export const updateUser = async (req, res) => {
  try {
    // Build update object with only provided fields
    const updateData = {};
    const allowedFields = [
      "fullname",
      "email",
      "role",
      "password",
      "phone",
      "address",
      "department",
      "designation",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    const user = await User.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: false, // Don't run validators on update to avoid required field validation
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Error updating user" });
  }
};

// Delete user
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Error deleting user" });
  }
};

// Update user status (active/inactive)
export const updateUserStatus = async (req, res) => {
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
};

// Update user LMS approval status
export const updateUserLMSStatus = async (req, res) => {
  try {
    const { isApproved } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isApproved },
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
      message: "User LMS status updated successfully",
      data: user,
    });
  } catch (error) {
    console.error("Error updating user LMS status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating user LMS status",
      error: error.message,
    });
  }
};

// Update user discount via offered course price (with course price snapshot) or legacy percentage
export const updateUserDiscount = async (req, res) => {
  try {
    const {
      discount,
      courseId = null,
      courseTitle = "",
      coursePrice: clientCoursePrice = null,
      offeredPrice = null,
      action = "set",
      clear = false,
      clearAll = false,
    } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const shouldClear = clear === true || action === "clear" || action === "remove";

    if (shouldClear) {
      if (clearAll || (!courseId && !courseTitle)) {
        user.discount = 0;
        user.discountCourseId = null;
        user.discountCourseTitle = "";
        user.discountCoursePrice = 0;
        user.discountedCoursePrice = null;
        user.discountAmount = 0;
        user.discountUpdatedAt = new Date();
        user.courseDiscounts = [];
      } else {
        const targetId = courseId ? String(courseId) : "";
        const targetTitle = String(courseTitle || "").trim().toLowerCase();
        user.courseDiscounts = (user.courseDiscounts || []).filter((entry) => {
          const entryId = entry?.courseId ? String(entry.courseId) : "";
          const entryTitle = String(entry?.courseTitle || "").trim().toLowerCase();
          if (targetId && entryId === targetId) return false;
          if (targetTitle && entryTitle === targetTitle) return false;
          return true;
        });

        const nextPrimary = user.courseDiscounts[user.courseDiscounts.length - 1] || null;
        if (nextPrimary) {
          user.discount = Number(nextPrimary.discountPercent || 0);
          user.discountCourseId = nextPrimary.courseId || null;
          user.discountCourseTitle = nextPrimary.courseTitle || "";
          user.discountCoursePrice = Number(nextPrimary.originalCoursePrice || 0);
          user.discountedCoursePrice = Number(nextPrimary.offeredPrice || 0);
          user.discountAmount = Number(nextPrimary.discountAmount || 0);
          user.discountUpdatedAt = nextPrimary.updatedAt || new Date();
        } else {
          user.discount = 0;
          user.discountCourseId = null;
          user.discountCourseTitle = "";
          user.discountCoursePrice = 0;
          user.discountedCoursePrice = null;
          user.discountAmount = 0;
          user.discountUpdatedAt = new Date();
        }
      }

      await user.save();
      const updatedUser = await User.findById(user._id)
        .select("-password")
        .populate("enrolledCourses", "title thumbnail slug price originalPrice isFree");

      return res.status(200).json({
        success: true,
        message: "Discount cleared successfully",
        data: updatedUser,
      });
    }

    const hasOfferedPrice =
      offeredPrice !== undefined && offeredPrice !== null && offeredPrice !== "";

    if (hasOfferedPrice) {
      const numericOfferedPrice = Number(offeredPrice);
      if (!Number.isFinite(numericOfferedPrice) || numericOfferedPrice < 0) {
        return res.status(400).json({
          success: false,
          message: "Offered price must be a valid non-negative amount",
        });
      }

      let resolvedCourse = null;
      if (courseId) {
        resolvedCourse = await Course.findById(courseId).select(
          "title price originalPrice isFree"
        );
        if (!resolvedCourse) {
          return res.status(404).json({
            success: false,
            message: "Selected course not found",
          });
        }
      }

      const dbCoursePrice = resolvedCourse ? resolveCourseBasePrice(resolvedCourse) : 0;
      const fallbackCoursePrice =
        clientCoursePrice !== undefined &&
        clientCoursePrice !== null &&
        clientCoursePrice !== ""
          ? Number(clientCoursePrice)
          : 0;

      // Always snapshot the live database course price at save time when available;
      // use admin-provided base price only for custom programs or 0-priced catalog entries.
      const snapshotCoursePrice = dbCoursePrice > 0 ? dbCoursePrice : fallbackCoursePrice;

      if (!Number.isFinite(snapshotCoursePrice) || snapshotCoursePrice <= 0) {
        return res.status(400).json({
          success: false,
          message:
            "A valid positive course price is required to snapshot pricing and calculate discount percentage",
        });
      }

      if (numericOfferedPrice > snapshotCoursePrice) {
        return res.status(400).json({
          success: false,
          message: `Offered price (₹${numericOfferedPrice.toLocaleString("en-IN")}) cannot exceed course price (₹${snapshotCoursePrice.toLocaleString("en-IN")})`,
        });
      }

      const resolvedTitle = String(
        resolvedCourse?.title || courseTitle || "Course Program"
      ).trim();

      const {
        originalCoursePrice,
        offeredPrice: finalOfferedPrice,
        discountAmount,
        discountPercent,
      } = computeDiscountFromOfferedPrice(snapshotCoursePrice, numericOfferedPrice);

      const now = new Date();
      user.discount = discountPercent;
      user.discountCourseId = resolvedCourse?._id || null;
      user.discountCourseTitle = resolvedTitle;
      user.discountCoursePrice = originalCoursePrice;
      user.discountedCoursePrice = finalOfferedPrice;
      user.discountAmount = discountAmount;
      user.discountUpdatedAt = now;

      const existingEntries = Array.isArray(user.courseDiscounts)
        ? [...user.courseDiscounts]
        : [];
      const targetId = resolvedCourse?._id ? String(resolvedCourse._id) : "";
      const normalizedTitle = resolvedTitle.toLowerCase();

      const matchIndex = existingEntries.findIndex((item) => {
        const itemId = item?.courseId ? String(item.courseId) : "";
        const itemTitle = String(item?.courseTitle || "").trim().toLowerCase();
        if (targetId && itemId) return itemId === targetId;
        if (!targetId && !itemId && normalizedTitle) return itemTitle === normalizedTitle;
        return Boolean(targetId && itemId === targetId);
      });

      const snapshotRecord = {
        courseId: resolvedCourse?._id || null,
        courseTitle: resolvedTitle,
        originalCoursePrice,
        offeredPrice: finalOfferedPrice,
        discountAmount,
        discountPercent,
        updatedAt: now,
      };

      if (matchIndex >= 0) {
        existingEntries[matchIndex] = snapshotRecord;
      } else {
        existingEntries.push(snapshotRecord);
      }
      user.courseDiscounts = existingEntries;

      await user.save();
      const updatedUser = await User.findById(user._id)
        .select("-password")
        .populate("enrolledCourses", "title thumbnail slug price originalPrice isFree");

      return res.status(200).json({
        success: true,
        message: "Student course price & calculated discount saved successfully",
        data: updatedUser,
      });
    }

    // Legacy fallback: explicit percentage update
    if (typeof discount !== "number" || discount < 0 || discount > 100) {
      return res.status(400).json({
        success: false,
        message: "Discount must be a number between 0 and 100",
      });
    }

    user.discount = discount;
    user.discountUpdatedAt = new Date();
    if (discount === 0) {
      user.discountCourseId = null;
      user.discountCourseTitle = "";
      user.discountCoursePrice = 0;
      user.discountedCoursePrice = null;
      user.discountAmount = 0;
      user.courseDiscounts = [];
    }

    await user.save();
    const updatedUser = await User.findById(user._id)
      .select("-password")
      .populate("enrolledCourses", "title thumbnail slug price originalPrice isFree");

    res.status(200).json({
      success: true,
      message: "Discount updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error updating discount:", error);
    res.status(500).json({
      success: false,
      message: "Error updating discount",
    });
  }
};

// Get LMS invite email preview for a user
export const getLmsInvitePreview = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password")
      .populate("enrolledCourses", "title thumbnail slug price");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const { lmsLoginUrl, courseNames } = req.query;
    const preview = buildLmsInviteEmailContent(user, {
      lmsLoginUrl,
      courseNames,
    });

    res.status(200).json({
      success: true,
      preview,
      user,
    });
  } catch (error) {
    console.error("Error generating LMS invite email preview:", error);
    res.status(500).json({
      success: false,
      message: "Failed to prepare LMS invite email preview",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Send LMS access welcome/invite email to a user
export const sendLmsInviteEmail = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password")
      .populate("enrolledCourses", "title thumbnail slug price");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const {
      to,
      cc = "",
      subject,
      writtenMessage,
      lmsLoginUrl = "",
      courseNames = "",
      autoApproveLms = true,
    } = req.body;

    const targetEmail = (to || user.email || "").trim().toLowerCase();
    if (!targetEmail || !/\S+@\S+\.\S+/.test(targetEmail)) {
      return res.status(400).json({
        success: false,
        message: "A valid recipient email address is required",
      });
    }

    if (lmsLoginUrl && !/^https?:\/\/\S+$/i.test(String(lmsLoginUrl).trim())) {
      return res.status(400).json({
        success: false,
        message: "LMS login URL must be a valid http:// or https:// URL",
      });
    }

    const emailContent = await sendBrandedEmailWithRecord({
      to: targetEmail,
      cc,
      studentName: user.fullname,
      courseName: courseNames || (user.enrolledCourses || []).map((c) => c?.title).filter(Boolean).join(", "),
      templateUsed: "lms_invite",
      adminUserId: req.user._id,
      buildContent: (hasLogo) =>
        buildLmsInviteEmailContent(user, {
          to: targetEmail,
          subject,
          writtenMessage,
          lmsLoginUrl,
          courseNames,
          useCidLogo: hasLogo,
        }),
    });

    user.lmsInviteSent = true;
    user.lmsInviteSentAt = new Date();
    user.lmsInviteSentCount = (user.lmsInviteSentCount || 0) + 1;
    user.lmsInviteLastSentTo = targetEmail;
    if (autoApproveLms && !user.isApproved) {
      user.isApproved = true;
    }
    await user.save();

    const updatedUser = await User.findById(user._id)
      .select("-password")
      .populate("enrolledCourses", "title thumbnail slug price");

    res.status(200).json({
      success: true,
      message: `LMS invite email sent successfully to ${targetEmail}`,
      data: updatedUser,
      subject: emailContent.subject,
    });
  } catch (error) {
    console.error("Error sending LMS invite email:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to send LMS invite email",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
