import AdminRole from "../model/AdminRole.js";
import User from "../model/User.js";
import AppError from "../utils/appError.js";
import catchAsync from "../utils/catchAsync.js";

// Get all admin roles
export const getAllAdminRoles = catchAsync(async (req, res, next) => {
  const roles = await AdminRole.find({ isActive: true }).sort({
    createdAt: -1,
  });

  res.status(200).json({
    status: "success",
    results: roles.length,
    data: {
      roles,
    },
  });
});

// Get a single admin role by ID
export const getAdminRole = catchAsync(async (req, res, next) => {
  const role = await AdminRole.findById(req.params.id);

  if (!role) {
    return next(new AppError("No admin role found with that ID", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      role,
    },
  });
});

// Create a new admin role
export const createAdminRole = catchAsync(async (req, res, next) => {
  const { name, description, permissions } = req.body;

  // Check if role name already exists
  const existingRole = await AdminRole.findOne({ name });
  if (existingRole) {
    return next(new AppError("A role with this name already exists", 400));
  }

  const role = await AdminRole.create({
    name,
    description,
    permissions,
  });

  res.status(201).json({
    status: "success",
    data: {
      role,
    },
  });
});

// Update an admin role
export const updateAdminRole = catchAsync(async (req, res, next) => {
  const { name, description, permissions } = req.body;

  const role = await AdminRole.findByIdAndUpdate(
    req.params.id,
    { name, description, permissions },
    { new: true, runValidators: true },
  );

  if (!role) {
    return next(new AppError("No admin role found with that ID", 404));
  }

  // Update permissions for all users with this role
  const adminPermissions = {};
  permissions.forEach((perm) => {
    adminPermissions[perm.page] = {
      canView: perm.canView,
      canCreate: perm.canCreate,
      canEdit: perm.canEdit,
      canDelete: perm.canDelete,
    };
  });

  await User.updateMany(
    { adminRoleId: role._id },
    {
      $set: {
        adminPermissions,
      },
    },
  );

  res.status(200).json({
    status: "success",
    data: {
      role,
    },
  });
});

// Delete an admin role (soft delete)
export const deleteAdminRole = catchAsync(async (req, res, next) => {
  const role = await AdminRole.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true },
  );

  if (!role) {
    return next(new AppError("No admin role found with that ID", 404));
  }

  // Remove role from users and set to default permissions
  await User.updateMany(
    { adminRoleId: role._id },
    {
      $unset: { adminRoleId: 1 },
      $set: { adminPermissions: new Map() },
    },
  );

  res.status(204).json({
    status: "success",
    data: null,
  });
});

// Get all admin users with their roles
export const getAdminUsers = catchAsync(async (req, res, next) => {
  const adminUsers = await User.find({
    $or: [
      { role: "admin" },
      { role: "employee" },
      { adminRoleId: { $exists: true, $ne: null } },
    ],
  })
    .select("+adminPermissions +adminRoleId")
    .populate("adminRoleId", "name description")
    .sort({ createdAt: -1 });

  const formattedUsers = adminUsers.map((u) => {
    const userObj = u.toObject ? u.toObject() : { ...u };
    if (userObj.adminPermissions instanceof Map) {
      userObj.adminPermissions = Object.fromEntries(userObj.adminPermissions);
    }
    return userObj;
  });

  res.status(200).json({
    status: "success",
    results: formattedUsers.length,
    data: {
      users: formattedUsers,
    },
  });
});

// Create admin user with specific role
export const createAdminUser = catchAsync(async (req, res, next) => {
  const { fullname, email, password, adminRoleId } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError("A user with this email already exists", 400));
  }

  // Get the role and its permissions
  const role = await AdminRole.findById(adminRoleId);
  if (!role) {
    return next(new AppError("Invalid admin role specified", 400));
  }

  // Create permissions object from role permissions
  // Users with assigned pages get full CRUD (canView, canCreate, canEdit, canDelete) on those pages
  const adminPermissions = {};
  role.permissions.forEach((perm) => {
    if (perm.canView !== false) {
      adminPermissions[perm.page] = {
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
      };
    } else {
      adminPermissions[perm.page] = {
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
      };
    }
  });

  const user = await User.create({
    fullname,
    email,
    password,
    role: "admin",
    isApproved: true, // Auto-approve admin users
    adminRoleId,
    adminPermissions,
  });

  // Don't return password and sensitive fields
  const userResponseDoc = await User.findById(user._id)
    .select("+adminPermissions +adminRoleId")
    .populate("adminRoleId", "name description");

  const userResponse = userResponseDoc.toObject
    ? userResponseDoc.toObject()
    : { ...userResponseDoc };
  if (userResponse.adminPermissions instanceof Map) {
    userResponse.adminPermissions = Object.fromEntries(
      userResponse.adminPermissions,
    );
  }

  res.status(201).json({
    status: "success",
    data: {
      user: userResponse,
    },
  });
});

// Update admin user role
export const updateAdminUserRole = catchAsync(async (req, res, next) => {
  const { adminRoleId, fullname, email } = req.body;

  const user = await User.findById(req.params.id);
  if (!user) {
    return next(new AppError("No user found with that ID", 404));
  }

  if (user.role !== "admin" && user.role !== "employee" && !user.adminRoleId) {
    return next(new AppError("This user is not an admin", 400));
  }

  // Get the new role and its permissions
  const role = await AdminRole.findById(adminRoleId);
  if (!role) {
    return next(new AppError("Invalid admin role specified", 400));
  }

  // Create permissions object from role permissions
  // Users with assigned pages get full CRUD (canView, canCreate, canEdit, canDelete) on those pages
  const adminPermissions = {};
  role.permissions.forEach((perm) => {
    if (perm.canView !== false) {
      adminPermissions[perm.page] = {
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
      };
    } else {
      adminPermissions[perm.page] = {
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
      };
    }
  });

  // Build update object with fields that are provided
  const updateData = { adminRoleId, adminPermissions };
  if (fullname) updateData.fullname = fullname;
  if (email) updateData.email = email;

  // Update user role, permissions, and optionally fullname/email
  const updatedUserDoc = await User.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true,
  })
    .select("+adminPermissions +adminRoleId")
    .populate("adminRoleId", "name description");

  const updatedUser = updatedUserDoc.toObject
    ? updatedUserDoc.toObject()
    : { ...updatedUserDoc };
  if (updatedUser.adminPermissions instanceof Map) {
    updatedUser.adminPermissions = Object.fromEntries(
      updatedUser.adminPermissions,
    );
  }

  res.status(200).json({
    status: "success",
    data: {
      user: updatedUser,
    },
  });
});

// Get available pages for permissions
export const getAvailablePages = catchAsync(async (req, res, next) => {
  const pages = [
    { key: "dashboard", label: "Dashboard", icon: "dashboard" },
    { key: "lms-management", label: "LMS Management", icon: "book" },
    { key: "test-qa", label: "Test Q&A", icon: "question-circle" },
    { key: "courses", label: "Courses", icon: "graduation-cap" },
    { key: "send-brochure", label: "Send Brochure", icon: "envelope" },
    { key: "send-proposal", label: "Send College Proposal", icon: "file-alt" },
    { key: "custom-email", label: "Custom Email Sender", icon: "mail" },
    { key: "redirects", label: "301 Redirects", icon: "external-link" },
    {
      key: "document-verification",
      label: "Document Verification",
      icon: "check-circle",
    },
    { key: "candidates", label: "Candidates", icon: "users" },
    { key: "categories", label: "Categories", icon: "folder" },
    { key: "users", label: "Users", icon: "user-friends" },
    { key: "blog", label: "Blog", icon: "blog" },
    { key: "contacts", label: "Contacts", icon: "address-book" },
    { key: "payments", label: "Payments", icon: "credit-card" },
    { key: "enrollments", label: "Enrollments", icon: "clipboard-list" },
    { key: "faqs", label: "FAQs", icon: "question" },
    { key: "image-gallery", label: "Media Gallery", icon: "images" },
    { key: "admin-management", label: "Admin Management", icon: "user-shield" },
  ];

  res.status(200).json({
    status: "success",
    data: {
      pages,
    },
  });
});
