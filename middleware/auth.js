import jwt from 'jsonwebtoken';
import User from '../model/User.js';

// Protect routes - verify JWT token
export const protect = async (req, res, next) => {
  try {
    let token;

    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    // Get token from x-auth-token header
    else if (req.headers['x-auth-token']) {
      token = req.headers['x-auth-token'];
    } else {
      console.log('No token found in headers');
    }

    // Check if no token
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'Not authorized to access this route. No token provided.'
      });
    }
    

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
      
      // Get user from the token - check for both 'id' and 'userId' in the token
      const userId = decoded.id || decoded.userId || decoded._id;
      if (!userId) {
        console.error('Invalid token format - missing user ID');
        return res.status(401).json({
          success: false,
          message: 'Invalid token format: No user ID found in token.'
        });
      }
      
      // Find the user and attach to request object
      const user = await User.findById(userId).select('-password +adminPermissions +adminRoleId');
      if (!user) {
        console.error('User not found with ID:', userId);
        return res.status(401).json({
          success: false,
          message: 'User not found with this ID.'
        });
      }
      
      // Attach user object to request with all necessary fields
      req.user = {
        _id: user._id,
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        adminRoleId: user.adminRoleId,
        adminPermissions: user.adminPermissions,
      };
      
      next();
    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route. Invalid token.'
      });
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during authentication.'
    });
  }
};

// Grant access to specific roles
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route. No user in request.'
      });
    }
    
    const isAdminAllowed = roles.includes("admin");
    const isAuthorized =
      roles.includes(req.user.role) ||
      (isAdminAllowed &&
        (req.user.role === "employee" || Boolean(req.user.adminRoleId)));

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    next();
  };
};

// Admin middleware (shortcut for authorize('admin'))
export const admin = authorize('admin');
