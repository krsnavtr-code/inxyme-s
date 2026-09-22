import jwt from "jsonwebtoken";
import User from "../model/User.js";
import AdminRole from "../model/AdminRole.js";

export const isAdmin = async (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const token = authHeader.replace("Bearer ", "");

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key",
    );

    // Check for both 'id' and 'userId' in the token
    const userId = decoded.id || decoded.userId;

    if (!userId) {
      console.error("Invalid token format - missing user ID");
      return res.status(401).json({
        success: false,
        message: "Invalid token format - missing user ID",
      });
    }

    const user = await User.findById(userId).select(
      "+adminPermissions +adminRoleId",
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    const isAuthorized =
      user.role === "admin" ||
      user.role === "employee" ||
      Boolean(user.adminRoleId);

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    req.user = user;

    // Populate admin role and permissions if user has a role
    if (user.adminRoleId) {
      const adminRole = await AdminRole.findById(user.adminRoleId);
      if (adminRole) {
        req.user.adminRoleId = adminRole;
        // Permissions are already stored in user.adminPermissions
      }
    }

    next();
  } catch (error) {
    console.error("Admin middleware error:", error);

    let errorMessage = "Authentication failed";
    if (error.name === "JsonWebTokenError") {
      errorMessage = "Invalid token";
    } else if (error.name === "TokenExpiredError") {
      errorMessage = "Token expired";
    }

    return res.status(401).json({
      success: false,
      message: errorMessage,
      error: error.message,
    });
  }
};
