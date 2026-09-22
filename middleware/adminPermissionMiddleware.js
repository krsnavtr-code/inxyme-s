import AppError from "../utils/appError.js";

// Helper function to extract permission object for a page from Map or plain object
const getPagePermission = (userPermissions, page) => {
  if (!userPermissions) return null;
  if (userPermissions instanceof Map || typeof userPermissions.get === "function") {
    return userPermissions.get(page) || null;
  }
  return userPermissions[page] || null;
};

// Check if user has admin/employee authorization
const isUserAdminOrEmployee = (user) => {
  if (!user) return false;
  return (
    user.role === "admin" ||
    user.role === "employee" ||
    Boolean(user.adminRoleId)
  );
};

// Check if admin/employee user has permission for a specific page and action
export const checkPermission = (page, action = "canView") => {
  return async (req, res, next) => {
    try {
      // Only check permissions for admin/employee users
      if (!isUserAdminOrEmployee(req.user)) {
        return next(new AppError("Admin access required", 403));
      }

      // Super admin check - if user has no adminRoleId, they have full access
      if (!req.user.adminRoleId) {
        return next();
      }

      // Get user permissions
      const userPermissions = req.user.adminPermissions;
      const pagePermission = getPagePermission(userPermissions, page);

      if (!pagePermission) {
        return next(
          new AppError(`You do not have permission to access ${page}`, 403),
        );
      }

      // If the user has permission to this page (canView is true),
      // allow all CRUD actions (canView, canCreate, canEdit, canDelete) on this page
      if (
        pagePermission.canView === true ||
        (action && pagePermission[action] === true)
      ) {
        return next();
      }

      const actionText = action.replace("can", "").toLowerCase();
      return next(
        new AppError(
          `You do not have permission to ${actionText} ${page}`,
          403,
        ),
      );
    } catch (error) {
      return next(new AppError("Permission check failed", 500));
    }
  };
};

// Middleware to populate admin permissions for the current user
export const populateAdminPermissions = async (req, res, next) => {
  try {
    if (isUserAdminOrEmployee(req.user)) {
      // Populate admin permissions if not already loaded
      const hasPermissions =
        req.user.adminPermissions &&
        (req.user.adminPermissions instanceof Map
          ? req.user.adminPermissions.size > 0
          : Object.keys(req.user.adminPermissions).length > 0);

      if (!hasPermissions) {
        const User = req.user.constructor;
        const user = await User.findById(req.user._id || req.user.id)
          .select("+adminPermissions +adminRoleId")
          .populate("adminRoleId", "permissions");

        if (user) {
          req.user.adminPermissions = user.adminPermissions || {};
          req.user.adminRoleId = user.adminRoleId;
        }
      }
    }
    next();
  } catch (error) {
    return next(new AppError("Failed to populate permissions", 500));
  }
};

// Check multiple permissions (for routes that need multiple page access)
export const checkMultiplePermissions = (permissions, requireAll = true) => {
  return async (req, res, next) => {
    try {
      if (!isUserAdminOrEmployee(req.user)) {
        return next(new AppError("Admin access required", 403));
      }

      // Super admin check
      if (!req.user.adminRoleId) {
        return next();
      }

      const userPermissions = req.user.adminPermissions;

      if (requireAll) {
        // Require ALL permissions (AND logic)
        for (const { page, action = "canView" } of permissions) {
          const pagePermission = getPagePermission(userPermissions, page);

          if (
            !pagePermission ||
            (pagePermission.canView !== true && pagePermission[action] !== true)
          ) {
            return next(
              new AppError(`You do not have required permissions`, 403),
            );
          }
        }
      } else {
        // Require ANY permission (OR logic)
        let hasAnyPermission = false;
        for (const { page, action = "canView" } of permissions) {
          const pagePermission = getPagePermission(userPermissions, page);

          if (
            pagePermission &&
            (pagePermission.canView === true || pagePermission[action] === true)
          ) {
            hasAnyPermission = true;
            break;
          }
        }

        if (!hasAnyPermission) {
          return next(
            new AppError(`You do not have required permissions`, 403),
          );
        }
      }

      next();
    } catch (error) {
      return next(new AppError("Permission check failed", 500));
    }
  };
};

// Get user's accessible pages for UI rendering
export const getAccessiblePages = (user) => {
  if (!isUserAdminOrEmployee(user)) {
    return [];
  }

  // Super admin has access to all pages
  if (!user.adminRoleId) {
    return [
      "dashboard",
      "lms-management",
      "test-qa",
      "courses",
      "send-brochure",
      "send-proposal",
      "candidates",
      "categories",
      "users",
      "blog",
      "contacts",
      "payments",
      "enrollments",
      "faqs",
      "image-gallery",
      "admin-management",
    ];
  }

  const userPermissions = user.adminPermissions || {};
  const accessiblePages = [];

  if (userPermissions instanceof Map || typeof userPermissions.entries === "function") {
    for (const [page, permissions] of userPermissions.entries()) {
      if (permissions && permissions.canView) {
        accessiblePages.push(page);
      }
    }
  } else {
    for (const [page, permissions] of Object.entries(userPermissions)) {
      if (permissions && permissions.canView) {
        accessiblePages.push(page);
      }
    }
  }

  return accessiblePages;
};
