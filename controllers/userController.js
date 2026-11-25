import User from "../model/User.js";
import { buildLmsInviteEmailContent } from "../utils/invoicePdfGenerator.js";
import { sendBrandedEmailWithRecord } from "../utils/brandedEmailSender.js";

// Get all users
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().populate("enrolledCourses", "title thumbnail slug price").sort({ createdAt: -1 });
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
    const user = await User.findById(req.params.id).populate("enrolledCourses", "title thumbnail slug price");
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

// Update user discount
export const updateUserDiscount = async (req, res) => {
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

    res.status(200).json({
      success: true,
      message: "Discount updated successfully",
      data: user,
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
