import jwt from "jsonwebtoken";
import User from "../model/User.js";
import AppError from "../utils/appError.js";

export const protect = async (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization;

    // Check for token in Authorization header
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    // If no token, check cookies
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, no token provided",
      });
    }

    try {
      // Trim and verify the token
      const trimmedToken = token.trim();

      // Try to decode without verification first to see the token structure
      try {
        const unverified = jwt.decode(trimmedToken);
      } catch (decodeError) {
        console.error("Failed to decode token:", decodeError);
      }

      let decoded;
      const jwtSecret = process.env.JWT_SECRET || "your_jwt_secret";
      const refreshSecret =
        process.env.JWT_REFRESH_SECRET || "your_jwt_refresh_secret";

      // First, try to verify with the access token secret
      try {
        decoded = jwt.verify(trimmedToken, jwtSecret, {
          ignoreExpiration: true,
        });

        // Verify it's an access token
        if (decoded.type !== "access") {
          console.error("Invalid token type with JWT_SECRET:", decoded.type);
          return res.status(401).json({
            success: false,
            message: "Invalid token type. Access token required.",
          });
        }

        // Check if token is expired (but allow for /auth/me endpoint to trigger refresh)
        const now = Math.floor(Date.now() / 1000);
        const isAuthMeEndpoint =
          req.originalUrl?.includes("/auth/me") ||
          req.url?.includes("/auth/me");

        if (decoded.exp && decoded.exp < now && !isAuthMeEndpoint) {
          console.error("Token expired:", new Date(decoded.exp * 1000));
          return res.status(401).json({
            success: false,
            message: "Your session has expired. Please log in again.",
          });
        } else if (decoded.exp && decoded.exp < now && isAuthMeEndpoint) {
          console.log("Token expired for /auth/me, allowing client to refresh");
          // Still return 401 to trigger client-side refresh, but with a specific message
          return res.status(401).json({
            success: false,
            message: "Token expired - refresh needed",
            requiresRefresh: true,
          });
        }
      } catch (accessError) {
        // If access token verification fails, try with refresh token secret
        try {
          decoded = jwt.verify(trimmedToken, refreshSecret, {
            ignoreExpiration: true,
          });

          // If we get here with a refresh token, it's the wrong token type
          if (decoded.type === "refresh") {
            console.error("Refresh token used as access token");
            return res.status(401).json({
              success: false,
              message: "Access token required. Please log in again.",
            });
          }

          // Check if token is expired
          const now = Math.floor(Date.now() / 1000);
          if (decoded.exp && decoded.exp < now) {
            console.error(
              "Refresh token expired:",
              new Date(decoded.exp * 1000),
            );
            return res.status(401).json({
              success: false,
              message: "Your session has expired. Please log in again.",
            });
          }
        } catch (refreshError) {
          console.error("Token verification failed with both secrets");
          console.error("Access token error:", accessError.message);
          console.error("Refresh token error:", refreshError.message);

          if (
            accessError.name === "TokenExpiredError" ||
            refreshError.name === "TokenExpiredError"
          ) {
            return res.status(401).json({
              success: false,
              message: "Your session has expired. Please log in again.",
            });
          }

          return res.status(401).json({
            success: false,
            message: "Invalid token. Please log in again.",
            debug: {
              tokenLength: trimmedToken.length,
              tokenPrefix: trimmedToken.substring(0, 10) + "...",
              error: accessError.message,
            },
          });
        }
      }

      if (!decoded) {
        console.error("Token could not be decoded");
        return res.status(401).json({
          success: false,
          message: "Invalid token format: Token could not be decoded",
        });
      }

      // Get user from the token
      const targetUserId = decoded.id || decoded.userId || decoded._id;
      const currentUser = await User.findById(targetUserId).select("-password");
      if (!currentUser) {
        console.error("User not found for ID:", targetUserId);
        return res.status(401).json({
          success: false,
          message: "The user belonging to this token no longer exists.",
        });
      }

      // Check if user is active
      if (!currentUser.isActive) {
        console.error("User account is not active:", currentUser.email);
        return res.status(401).json({
          success: false,
          message: "User account is not active",
        });
      }

      // Check if user is approved (if applicable)
      if (currentUser.isApproved === false) {
        console.error("User account not approved:", currentUser.email);
        return res.status(403).json({
          success: false,
          message: "Your account is pending approval from the administrator.",
        });
      }

      // Attach user to request object
      req.user = currentUser;

      // Populate admin permissions if user is admin or employee with role
      if (
        (currentUser.role === "admin" ||
          currentUser.role === "employee" ||
          currentUser.adminRoleId) &&
        currentUser.adminRoleId
      ) {
        try {
          const adminUser = await User.findById(currentUser._id)
            .select("+adminPermissions +adminRoleId")
            .populate("adminRoleId", "name permissions");

          if (adminUser) {
            req.user.adminPermissions = adminUser.adminPermissions;
            req.user.adminRoleId = adminUser.adminRoleId;
          }
        } catch (popError) {
          console.error("Error populating admin permissions:", popError);
        }
      }

      next();
    } catch (error) {
      console.error("Token verification error:", error);

      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Session expired. Please log in again.",
        });
      }

      if (error.name === "JsonWebTokenError") {
        return res.status(401).json({
          success: false,
          message: "Invalid token. Please log in again.",
        });
      }

      return res.status(401).json({
        success: false,
        message: "Not authorized, token verification failed",
        error: error.message,
      });
    }
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const admin = (req, res, next) => {
  if (
    req.user &&
    (req.user.role === "admin" ||
      req.user.role === "employee" ||
      Boolean(req.user.adminRoleId))
  ) {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: "Not authorized as an admin",
    });
  }
};

export const restrictTo = (...roles) => {
  return (req, res, next) => {
    const isAdminAllowed = roles.includes("admin");
    const isAuthorized =
      req.user &&
      (roles.includes(req.user.role) ||
        (isAdminAllowed &&
          (req.user.role === "employee" || Boolean(req.user.adminRoleId))));

    if (!isAuthorized) {
      return next(
        new AppError("You do not have permission to perform this action", 403),
      );
    }
    next();
  };
};
