import jwt from "jsonwebtoken";
import User from "../model/User.js";
import AppError from "../utils/appError.js";
import catchAsync from "../utils/catchAsync.js";
import crypto from "crypto";
import { sendEmail } from "../utils/email.js";
import LoginRecord from "../model/LoginRecord.js";

// Helper function to parse user agent (simple version without external dependency)
const parseUserAgent = (userAgentString) => {
  const ua = userAgentString || "Unknown";

  // Simple browser detection
  let browser = "Unknown";
  if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari")) browser = "Safari";
  else if (ua.includes("Edge")) browser = "Edge";
  else if (ua.includes("Opera")) browser = "Opera";

  // Simple OS detection
  let os = "Unknown";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iOS")) os = "iOS";

  // Simple device detection
  let device = "Desktop";
  if (ua.includes("Mobile") || ua.includes("Android") || ua.includes("iOS")) {
    device = "Mobile";
  } else if (ua.includes("Tablet")) {
    device = "Tablet";
  }

  return {
    browser,
    os,
    device,
  };
};

// Helper function to get client IP
const getClientIP = (req) => {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-client-ip"] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    "Unknown"
  );
};

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign(
    {
      id, // Store the user ID as 'id' in the token payload
      type: "access",
      iat: Math.floor(Date.now() / 1000), // Issued at time
    },
    process.env.JWT_SECRET || "your_jwt_secret",
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "15m", // Use environment variable or fallback to 15m
    },
  );
};

// Generate Refresh Token
const generateRefreshToken = (id) => {
  return jwt.sign(
    {
      id,
      type: "refresh",
      iat: Math.floor(Date.now() / 1000),
    },
    process.env.JWT_REFRESH_SECRET ||
      process.env.JWT_SECRET ||
      "your_jwt_refresh_secret",
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d", // Refresh token expires in 7 days or use env var
    },
  );
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
export const register = catchAsync(async (req, res, next) => {
  const { fullname, email, password, role, department, phone } = req.body;
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  // Check if user exists
  const userExists = await User.findOne({ email: normalizedEmail });

  if (userExists) {
    return next(
      new AppError("Email already registered. Go to Login page", 409),
    );
  }

  // Generate OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  // Create user with OTP (not approved yet)
  const user = await User.create({
    fullname,
    email: normalizedEmail,
    password,
    role: role || "student",
    department,
    phone,
    isApproved: false, // Require email verification first
    isEmailVerified: false,
    emailVerificationOTP: otp,
    emailVerificationOTPExpires: otpExpires,
  });

  // Send OTP email
  const subject = "Verify Your Email - Inxyme";
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Inxyme</h1>
      </div>
      
      <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
        <h2 style="color: #333; margin-top: 0;">Email Verification</h2>
        
        <p style="color: #666; margin-bottom: 20px;">
          Hello ${fullname || "User"},<br><br>
          Thank you for registering with Inxyme. To complete your registration, 
          please verify your email address using the OTP below:
        </p>
        
        <div style="background: #fff; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0; border: 2px dashed #667eea;">
          <p style="color: #999; font-size: 14px; margin: 0 0 10px 0;">Your Verification OTP</p>
          <p style="color: #667eea; font-size: 32px; font-weight: bold; margin: 0; letter-spacing: 5px;">${otp}</p>
        </div>
        
        <p style="color: #666; font-size: 14px; margin-bottom: 15px;">
          This OTP will expire in 10 minutes for security reasons.
        </p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef;">
          <p style="color: #999; font-size: 12px; margin: 0;">
            If you didn't create an account with Inxyme, please ignore this email.
          </p>
        </div>
      </div>
    </div>
  `;

  try {
    await sendEmail({
      to: normalizedEmail,
      subject,
      html,
    });
  } catch (emailError) {
    console.error("Error sending verification email:", emailError);
    // Don't fail registration if email fails, but log it
  }

  if (user) {
    res.status(201).json({
      _id: user._id,
      fullname: user.fullname,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      message:
        "Registration successful. Please check your email for OTP verification.",
    });
  } else {
    return next(new AppError("Invalid user data", 400));
  }
});

// Helper to convert Mongoose Map to plain object for proper JSON serialization
const formatAdminPermissions = (permissions) => {
  if (!permissions) return {};
  if (permissions instanceof Map || typeof permissions.entries === "function") {
    return Object.fromEntries(permissions);
  }
  if (typeof permissions.toObject === "function") {
    return permissions.toObject();
  }
  return permissions;
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
export const login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // Check for user email
  const user = await User.findOne({ email }).select(
    "+adminRoleId +adminPermissions",
  );

  if (!user) {
    return next(new AppError("Invalid email or password", 401));
  }

  // Check if account is deactivated
  if (user.isActive === false) {
    return next(
      new AppError(
        "Your account has been deactivated. Please contact support.",
        401,
      ),
    );
  }

  // If account is active but not approved yet, still allow login
  // but limit access based on isApproved status (handled by frontend routes)

  // Check password
  const isMatch = await user.matchPassword(password);

  if (!isMatch) {
    return next(new AppError("Invalid email or password", 401));
  }

  // Check if user is admin or employee with role - if so, require OTP verification
  if (
    user.role === "admin" ||
    user.role === "employee" ||
    Boolean(user.adminRoleId)
  ) {
    // Generate OTP for admin login
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP in user document
    user.adminLoginOTP = otp;
    user.adminLoginOTPExpires = otpExpires;
    await user.save();

    // Send OTP email
    const subject = "Admin Login Verification - Inxyme";
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Inxyme</h1>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
          <h2 style="color: #333; margin-top: 0;">Admin Login Verification</h2>
          
          <p style="color: #666; margin-bottom: 20px;">
            Hello ${user.fullname || "Admin"},<br><br>
            An admin login attempt was detected for your account. 
            Please verify your identity using the OTP below:
          </p>
          
          <div style="background: #fff; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0; border: 2px dashed #667eea;">
            <p style="color: #999; font-size: 14px; margin: 0 0 10px 0;">Your Verification OTP</p>
            <p style="color: #667eea; font-size: 32px; font-weight: bold; margin: 0; letter-spacing: 5px;">${otp}</p>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-bottom: 15px;">
            This OTP will expire in 10 minutes for security reasons.
          </p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef;">
            <p style="color: #999; font-size: 12px; margin: 0;">
              If you didn't attempt to login to the admin panel, please ignore this email
              and contact support immediately.
            </p>
          </div>
        </div>
      </div>
    `;

    try {
      await sendEmail({
        to: email,
        subject,
        html,
      });
    } catch (emailError) {
      console.error("Error sending admin login OTP email:", emailError);
      return next(
        new AppError("Failed to send OTP email. Please try again.", 500),
      );
    }

    return res.json({
      success: true,
      requiresOTP: true,
      message: "OTP sent to your email for admin verification",
      email: user.email,
    });
  }

  // For non-admin users, proceed with normal login
  // Update last login
  user.lastLogin = Date.now();
  await user.save();

  // Track login record
  try {
    const userAgentString = req.headers["user-agent"] || "Unknown";
    const ipAddress = getClientIP(req);
    const parsedUA = parseUserAgent(userAgentString);

    await LoginRecord.create({
      user: user._id,
      userEmail: user.email,
      userName: user.fullname,
      userRole: user.role,
      ipAddress,
      userAgent: userAgentString,
      browser: parsedUA.browser,
      os: parsedUA.os,
      device: parsedUA.device,
      loginTime: new Date(),
      status: "active",
    });

    console.log(`Login tracked for user: ${user.email} from IP: ${ipAddress}`);
  } catch (trackingError) {
    console.error("Error tracking login:", trackingError);
    // Don't fail the login if tracking fails
  }

  // Generate tokens
  const token = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  if (!token || !refreshToken) {
    console.error("Token generation failed");
    return next(new AppError("Failed to generate authentication tokens", 500));
  }

  // Store refresh token in user document
  user.refreshToken = refreshToken;
  try {
    await user.save();
  } catch (saveError) {
    console.error("Error saving refresh token:", saveError);
    return next(new AppError("Failed to save refresh token", 500));
  }

  // Prepare user data for response
  const userData = {
    _id: user._id,
    fullname: user.fullname,
    email: user.email,
    role: user.role,
    isApproved: user.isApproved,
    phone: user.phone || "",
    address: user.address || "",
    adminRoleId: user.adminRoleId,
    adminPermissions: user.adminPermissions,
  };

  const responseData = {
    success: true,
    token,
    refreshToken,
    user: userData,
  };

  res.json(responseData);
});

// @desc    Verify admin login OTP
// @route   POST /api/auth/verify-admin-otp
// @access  Public
export const verifyAdminOTP = catchAsync(async (req, res, next) => {
  const { email, otp } = req.body;

  try {
    // Find user by email and select OTP fields
    const user = await User.findOne({ email }).select(
      "+adminLoginOTP +adminLoginOTPExpires +adminRoleId +adminPermissions",
    );

    if (!user) {
      return next(new AppError("No user found with that email address", 404));
    }

    // Check if user is admin or employee with role
    if (
      user.role !== "admin" &&
      user.role !== "employee" &&
      !user.adminRoleId
    ) {
      return next(
        new AppError("OTP verification is only for admin users", 400),
      );
    }

    // Check if OTP exists and is not expired
    if (!user.adminLoginOTP || !user.adminLoginOTPExpires) {
      return next(
        new AppError("No OTP request found. Please login again.", 400),
      );
    }

    // Check if OTP has expired
    if (Date.now() > user.adminLoginOTPExpires) {
      return next(
        new AppError("OTP has expired. Please request a new one.", 400),
      );
    }

    // Verify OTP
    if (user.adminLoginOTP !== otp) {
      return next(new AppError("Invalid OTP. Please try again.", 400));
    }

    // Clear OTP
    user.adminLoginOTP = undefined;
    user.adminLoginOTPExpires = undefined;

    // Update last login
    user.lastLogin = Date.now();
    await user.save();

    // Track login record
    try {
      const userAgentString = req.headers["user-agent"] || "Unknown";
      const ipAddress = getClientIP(req);
      const parsedUA = parseUserAgent(userAgentString);

      await LoginRecord.create({
        user: user._id,
        userEmail: user.email,
        userName: user.fullname,
        userRole: user.role,
        ipAddress,
        userAgent: userAgentString,
        browser: parsedUA.browser,
        os: parsedUA.os,
        device: parsedUA.device,
        loginTime: new Date(),
        status: "active",
      });

      console.log(
        `Admin login tracked for user: ${user.email} from IP: ${ipAddress}`,
      );
    } catch (trackingError) {
      console.error("Error tracking admin login:", trackingError);
      // Don't fail the login if tracking fails
    }

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    if (!token || !refreshToken) {
      console.error("Token generation failed");
      return next(
        new AppError("Failed to generate authentication tokens", 500),
      );
    }

    // Store refresh token in user document
    user.refreshToken = refreshToken;
    try {
      await user.save();
    } catch (saveError) {
      console.error("Error saving refresh token:", saveError);
      return next(new AppError("Failed to save refresh token", 500));
    }

    // Prepare user data for response
    const userData = {
      _id: user._id,
      fullname: user.fullname,
      email: user.email,
      role: user.role,
      isApproved: user.isApproved,
      phone: user.phone || "",
      address: user.address || "",
      adminRoleId: user.adminRoleId,
      adminPermissions: formatAdminPermissions(user.adminPermissions),
    };

    res.json({
      success: true,
      message: "Admin login verified successfully",
      token,
      refreshToken,
      user: userData,
    });
  } catch (error) {
    console.error("Error in verifyAdminOTP:", error);
    next(error);
  }
});

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
export const getUserProfile = catchAsync(async (req, res, next) => {
  try {
    // Get user from the database to ensure we have the latest data
    // Use only inclusion to avoid MongoDB error with mixed inclusion/exclusion
    const user = await User.findById(req.user._id || req.user.id).select(
      "fullname email role isApproved phone address adminRoleId adminPermissions discount createdAt updatedAt isActive",
    );

    if (!user) {
      return next(new AppError("User not found", 404));
    }

    res.json({
      success: true,
      user: {
        _id: user._id,
        fullname: user.fullname,
        email: user.email,
        role: user.role,
        isApproved: user.isApproved,
        isActive: user.isActive !== false,
        phone: user.phone || "",
        address: user.address || "",
        adminRoleId: user.adminRoleId,
        adminPermissions: formatAdminPermissions(user.adminPermissions),
        discount: user.discount || 0,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error in getUserProfile:", error);
    return next(new AppError("Error fetching user profile", 500));
  }
});

// @desc    Refresh access token
// @route   POST /api/auth/refresh-token
// @access  Public
// @desc    Change user password
// @route   PUT /api/auth/change-password
// @access  Private
export const changePassword = catchAsync(async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!req.user || !req.user.id) {
      console.error("No user ID in request");
      return next(new AppError("Authentication required", 401));
    }

    // 1) Get user from collection
    const user = await User.findById(req.user.id).select("+password");
    if (!user) {
      console.error("User not found with ID:", req.user.id);
      return next(new AppError("User not found", 404));
    }

    // 2) Check if current password is correct
    const isPasswordCorrect = await user.correctPassword(
      currentPassword,
      user.password,
    );

    if (!isPasswordCorrect) {
      return next(new AppError("Your current password is incorrect", 401));
    }

    // 3) Update password
    user.password = newPassword;
    // Clear refresh token when password changes
    user.refreshToken = undefined;
    await user.save();

    // 4) Generate new tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Save the new refresh token
    user.refreshToken = refreshToken;
    await user.save();

    // Remove password from output
    user.password = undefined;

    res.status(200).json({
      status: "success",
      message: "Password updated successfully",
      token,
      refreshToken,
      data: {
        user: {
          id: user._id,
          email: user.email,
          fullname: user.fullname,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error("Error in changePassword:", error);
    if (error.name === "ValidationError") {
      return next(new AppError(error.message, 400));
    }
    next(error);
  }
});

// @desc    Refresh access token
// @route   POST /api/auth/refresh-token
// @access  Public
export const refreshToken = catchAsync(async (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return next(new AppError("Refresh token is required", 400));
  }

  try {
    // Verify the refresh token
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || "your_jwt_refresh_secret",
    );

    if (decoded.type !== "refresh") {
      return next(new AppError("Invalid token type", 401));
    }

    // Find the user and check if the refresh token matches
    const user = await User.findOne({
      _id: decoded.id,
      refreshToken: refreshToken,
    }).select("+adminPermissions +adminRoleId");

    if (!user) {
      return next(new AppError("User not found or invalid refresh token", 401));
    }

    // Generate new tokens
    const newAccessToken = generateToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    // Update refresh token in the database
    user.refreshToken = newRefreshToken;
    await user.save();

    res.json({
      token: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        _id: user._id,
        fullname: user.fullname,
        email: user.email,
        role: user.role,
        isApproved: user.isApproved,
        adminRoleId: user.adminRoleId,
        adminPermissions: formatAdminPermissions(user.adminPermissions),
      },
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(new AppError("Refresh token has expired", 401));
    }
    return next(new AppError("Invalid refresh token", 401));
  }
});

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  // Find user by email
  const user = await User.findOne({ email });

  if (!user) {
    return next(new AppError("No user found with that email address", 404));
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString("hex");

  // Hash token and save to user document
  user.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  await user.save();

  // Create reset URL
  const resetURL = `${process.env.CLIENT_URL || "http://localhost:5173"}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

  // Send email
  const subject = "Password Reset Request - Inxyme";
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Inxyme</h1>
      </div>
      
      <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
        <h2 style="color: #333; margin-top: 0;">Password Reset Request</h2>
        
        <p style="color: #666; margin-bottom: 20px;">
          Hello ${user.fullname || "User"},<br><br>
          We received a request to reset your password for your Inxyme account. 
          Click the button below to reset your password:
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetURL}" 
             style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; 
                    padding: 12px 30px; 
                    text-decoration: none; 
                    border-radius: 5px; 
                    font-weight: bold;
                    display: inline-block;
                    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);">
            Reset Password
          </a>
        </div>
        
        <p style="color: #666; font-size: 14px; margin-bottom: 15px;">
          If the button doesn't work, you can copy and paste this link into your browser:
        </p>
        
        <div style="background: #f1f3f4; padding: 15px; border-radius: 5px; word-break: break-all; font-family: monospace; font-size: 12px;">
          ${resetURL}
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef;">
          <p style="color: #999; font-size: 12px; margin: 0;">
            <strong>Important:</strong> This link will expire in 10 minutes for security reasons.
            If you didn't request this password reset, please ignore this email.
          </p>
        </div>
      </div>
    </div>
  `;

  try {
    await sendEmail({
      to: email,
      subject,
      html,
    });

    res.json({
      success: true,
      message: "Password reset instructions have been sent to your email",
    });
  } catch (emailError) {
    console.error("Error sending password reset email:", emailError);
    return next(
      new AppError(
        "Failed to send password reset email. Please try again later.",
        500,
      ),
    );
  }
});

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
export const resetPassword = catchAsync(async (req, res, next) => {
  const { token, email, password } = req.body;

  try {
    // Find user by email and explicitly select password reset fields and password
    const user = await User.findOne({ email }).select(
      "+passwordResetToken +passwordResetExpires +password +refreshToken",
    );

    if (!user) {
      return next(new AppError("No user found with that email address", 404));
    }

    // Check if reset token exists and is not expired
    if (!user.passwordResetToken || !user.passwordResetExpires) {
      return next(new AppError("No password reset request found", 400));
    }

    // Check if token has expired
    if (Date.now() > user.passwordResetExpires) {
      return next(new AppError("Password reset token has expired", 400));
    }

    // Hash the provided token and compare with stored token
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    if (hashedToken !== user.passwordResetToken) {
      return next(new AppError("Invalid reset token", 400));
    }

    user.password = password;

    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.refreshToken = undefined; // Clear refresh tokens on password reset

    await user.save();

    res.json({
      success: true,
      message: "Password has been reset successfully",
    });
  } catch (error) {
    console.error("Error in resetPassword:", error);
    if (error.name === "ValidationError") {
      return next(new AppError(error.message, 400));
    }
    next(error);
  }
});

// @desc    Verify email with OTP
// @route   POST /api/auth/verify-otp
// @access  Public
export const verifyOTP = catchAsync(async (req, res, next) => {
  const { email, otp } = req.body;
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  try {
    // Find user by email and select OTP fields
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+emailVerificationOTP +emailVerificationOTPExpires",
    );

    if (!user) {
      return next(new AppError("No user found with that email address", 404));
    }

    // Check if OTP exists and is not expired
    if (!user.emailVerificationOTP || !user.emailVerificationOTPExpires) {
      return next(new AppError("No OTP request found", 400));
    }

    // Check if OTP has expired
    if (Date.now() > user.emailVerificationOTPExpires) {
      return next(
        new AppError("OTP has expired. Please request a new one.", 400),
      );
    }

    // Verify OTP
    if (user.emailVerificationOTP !== otp) {
      return next(new AppError("Invalid OTP. Please try again.", 400));
    }

    // Mark email as verified and approve user
    user.isEmailVerified = true;
    user.isApproved = true;
    user.emailVerificationOTP = undefined;
    user.emailVerificationOTPExpires = undefined;

    await user.save();

    // Send welcome email
    const welcomeSubject = "Welcome to Inxyme - Your Journey Begins!";
    const welcomeHTML = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Inxyme</h1>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
          <h2 style="color: #333; margin-top: 0;">Welcome to Inxyme!</h2>
          
          <p style="color: #666; margin-bottom: 20px;">
            Dear ${user.fullname || "User"},<br><br>
            We're thrilled to have you join the Inxyme community! Your account has been successfully created and verified.
          </p>
          
          <div style="background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
            <h3 style="color: #667eea; margin-top: 0; font-size: 18px;">What's Next?</h3>
            <ul style="color: #666; margin: 10px 0; padding-left: 20px;">
              <li style="margin-bottom: 10px;">Explore our wide range of courses</li>
              <li style="margin-bottom: 10px;">Enroll in your favorite courses</li>
              <li style="margin-bottom: 10px;">Track your learning progress</li>
              <li>Earn certificates upon completion</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.CLIENT_URL || "http://localhost:5173"}/courses"
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                      color: white; 
                      padding: 12px 30px; 
                      text-decoration: none; 
                      border-radius: 5px; 
                      font-weight: bold;
                      display: inline-block;
                      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);">
              Explore Courses
            </a>
            <a href="${process.env.CLIENT_URL || "http://localhost:5173"}/profile" 
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                      color: white; 
                      padding: 12px 30px; 
                      text-decoration: none; 
                      border-radius: 5px; 
                      font-weight: bold;
                      display: inline-block;
                      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);">
              Go to Profile
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-bottom: 15px;">
            If you have any questions or need assistance, feel free to reach out to our support team.
          </p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef;">
            <p style="color: #999; font-size: 12px; margin: 0;">
              Best regards,<br>
              The Inxyme Team
            </p>
          </div>
        </div>
      </div>
    `;

    try {
      await sendEmail({
        to: normalizedEmail,
        subject: welcomeSubject,
        html: welcomeHTML,
      });
    } catch (emailError) {
      console.error("Error sending welcome email:", emailError);
      // Don't fail verification if welcome email fails
    }

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Save refresh token
    user.refreshToken = refreshToken;
    await user.save();

    res.json({
      success: true,
      message: "Email verified successfully. Your account is now active.",
      token,
      refreshToken,
      user: {
        _id: user._id,
        fullname: user.fullname,
        email: user.email,
        role: user.role,
        isApproved: user.isApproved,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    console.error("Error in verifyOTP:", error);
    next(error);
  }
});

// @desc    Resend OTP
// @route   POST /api/auth/resend-otp
// @access  Public
export const resendOTP = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  try {
    // Find user by email and select OTP fields
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+emailVerificationOTP +emailVerificationOTPExpires",
    );

    if (!user) {
      return next(new AppError("No user found with that email address", 404));
    }

    // Check if already verified
    if (user.isEmailVerified) {
      return next(new AppError("Email is already verified", 400));
    }

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    user.emailVerificationOTP = otp;
    user.emailVerificationOTPExpires = otpExpires;

    await user.save();

    // Send OTP email
    const subject = "Verify Your Email - Inxyme";
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Inxyme</h1>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
          <h2 style="color: #333; margin-top: 0;">Email Verification</h2>
          
          <p style="color: #666; margin-bottom: 20px;">
            Hello ${user.fullname || "User"},<br><br>
            Here is your new verification OTP:
          </p>
          
          <div style="background: #fff; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0; border: 2px dashed #667eea;">
            <p style="color: #999; font-size: 14px; margin: 0 0 10px 0;">Your Verification OTP</p>
            <p style="color: #667eea; font-size: 32px; font-weight: bold; margin: 0; letter-spacing: 5px;">${otp}</p>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-bottom: 15px;">
            This OTP will expire in 10 minutes for security reasons.
          </p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef;">
            <p style="color: #999; font-size: 12px; margin: 0;">
              If you didn't request this OTP, please ignore this email.
            </p>
          </div>
        </div>
      </div>
    `;

    await sendEmail({
      to: normalizedEmail,
      subject,
      html,
    });

    res.json({
      success: true,
      message: "OTP has been resent to your email",
    });
  } catch (error) {
    console.error("Error in resendOTP:", error);
    next(error);
  }
});
