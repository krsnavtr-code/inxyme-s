import User from "../model/User.js";

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
      "_id fullname email role isActive isApproved department createdAt lastLogin enrolledCourses"
    )
      .populate("enrolledCourses", "title thumbnail slug price status isPublished isActive")
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
