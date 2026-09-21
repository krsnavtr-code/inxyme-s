import Candidate from "../model/Candidate.js";
import path from "path";
import fs from "fs";
import nodemailer from "nodemailer";
import generateIdCard from "../utils/idCardGenerator.js";
import dotenv from "dotenv";
import crypto from "crypto";
import { fileURLToPath } from "url";

// Get the current module's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// In-memory store for OTPs (in production, use Redis or database)
const otpStore = new Map();

// Generate a random 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Email configuration
const emailConfig = {
  host: process.env.SMTP_HOST || "smtp.hostinger.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER || "noreply@inxyme.com",
    pass: process.env.SMTP_PASS || "your-email-password",
  },
  tls: {
    rejectUnauthorized: false, // Only for development, remove in production
  },
};

// Use EMAIL_FROM if available, otherwise fall back to SMTP user
const emailFrom = process.env.EMAIL_FROM || emailConfig.auth.user;

const transporter = nodemailer.createTransport(emailConfig);

// Verify SMTP connection
transporter.verify(function (error, success) {
  if (error) {
    console.error("SMTP Connection Error:", error);
  } else {
    console.log("SMTP Server is ready to take our messages");
  }
});

// @desc    Send OTP to email
// @route   POST /api/candidates/send-otp
// @access  Public
export const sendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Check if email already exists
    const existingCandidate = await Candidate.findOne({ email });
    if (existingCandidate) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
        field: "email",
      });
    }

    const otp = generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // OTP valid for 10 minutes

    // Store OTP with email and expiration
    otpStore.set(email, {
      otp,
      expiresAt,
    });

    // Send email with OTP
    const mailOptions = {
      from: `Inxyme <${emailFrom}>`, // Sender address with name
      to: email, // List of recipients
      subject: "Your OTP for Email Verification", // Subject line
      text: `Your OTP for email verification is: ${otp}. This OTP is valid for 10 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4f46e5;">Email Verification</h2>
          <p>Hello,</p>
          <p>Your OTP for email verification is: <strong>${otp}</strong></p>
          <p>This OTP is valid for 10 minutes.</p>
          <p>If you didn't request this OTP, please ignore this email.</p>
          <p>Best regards,<br>Inxyme Team</p>
        </div>
      `,
    };

    try {
      const info = await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error("Error sending email:", error);
      throw error; // Re-throw to be caught by the outer try-catch
    }

    res.status(200).json({
      success: true,
      message: "OTP sent to email",
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP. Please try again.",
    });
  }
};

// @desc    Verify OTP
// @route   POST /api/candidates/verify-otp
// @access  Public
export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const otpData = otpStore.get(email);
    const now = new Date();

    if (!otpData) {
      return res.status(400).json({
        success: false,
        message: "OTP not found or expired. Please request a new one.",
      });
    }

    if (now > otpData.expiresAt) {
      otpStore.delete(email);
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    if (otpData.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP. Please try again.",
      });
    }

    // Mark email as verified
    otpData.verified = true;
    otpStore.set(email, otpData);

    res.status(200).json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify OTP. Please try again.",
    });
  }
};

// @desc    Create a new candidate
// @route   POST /api/candidates
// @access  Public
dotenv.config();
export const createCandidate = async (req, res) => {
  let profilePhotoPath = null;

  // Default values for email template
  const myCompanyName = "Inxyme";
  const eventName = "Career Hiring Camp 2025";
  const eventDate = "November 9, 2025 - Sunday";
  const eventTime = "9:00 AM - 5:00 PM";
  const venue = "Mosaic Hotel Noida - C-1, C Block, Pocket C, Sector 18";
  const city = "Noida, Uttar Pradesh 201301";
  const mapLink = "https://maps.app.goo.gl/PjBJ8U51Kn1as9Aq6";
  const supportEmail = "info@inxyme.com";
  const supportPhone = "9891030303";
  const website = "https://inxyme.com";
  const yourName = "Inxyme";

  try {
    const {
      name,
      email,
      phone,
      course,
      college,
      university,
      companyName,
      userType = "student",
      companyName: userCompanyName,
    } = req.body;
    // Store the file path for cleanup in case of errors
    if (req.file) {
      profilePhotoPath = req.file.path;
    }
    // Validate user type
    if (!["student", "company"].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user type. Must be either 'student' or 'company'.",
        field: "userType",
      });
    }
    // Validate required fields based on user type
    if (userType === "student" && (!course || !college || !university)) {
      return res.status(400).json({
        success: false,
        message: "Course, college, and university are required for students",
      });
    }

    if (userType === "company" && !userCompanyName) {
      return res.status(400).json({
        success: false,
        message: "Company name is required",
        field: "companyName",
      });
    }
    // Check if email is verified
    const otpData = otpStore.get(email);
    if (!otpData || !otpData.verified) {
      // Clean up the uploaded file if it exists
      if (profilePhotoPath && fs.existsSync(profilePhotoPath)) {
        fs.unlink(profilePhotoPath, (err) => {
          if (err) console.error("Error deleting uploaded file:", err);
        });
      }

      return res.status(400).json({
        success: false,
        message: "Please verify your email address first.",
        field: "email",
      });
    }

    /// Clear the OTP data after successful verification and before saving to database
    otpStore.delete(email);

    // Rest of the existing code remains the same, but update the candidate creation part:
    const candidateData = {
      name,
      email,
      phone,
      userType,
      ...(userType === "student"
        ? { course, college, university }
        : {
          companyName,
          isPaymentDone:
            req.body.isPaymentDone === "true" ||
            req.body.isPaymentDone === true,
        }),
    };

    // Check if email already exists in the database
    const existingCandidate = await Candidate.findOne({ email });
    if (existingCandidate) {
      // Clean up the uploaded file if it exists
      if (profilePhotoPath && fs.existsSync(profilePhotoPath)) {
        fs.unlink(profilePhotoPath, (err) => {
          if (err) console.error("Error deleting uploaded file:", err);
        });
      }

      return res.status(400).json({
        success: false,
        message: "An application with this email already exists.",
        field: "email",
      });
    }

    // Check if phone already exists
    const existingPhone = await Candidate.findOne({ phone });
    if (existingPhone) {
      // Clean up the uploaded file if it exists
      if (profilePhotoPath && fs.existsSync(profilePhotoPath)) {
        fs.unlink(profilePhotoPath, (err) => {
          if (err) console.error("Error deleting uploaded file:", err);
        });
      }

      return res.status(400).json({
        success: false,
        message: "An application with this phone number already exists.",
        field: "phone",
      });
    }

    let profilePhotoUrl = "";

    // Handle file upload if provided
    if (req.file) {
      // Construct the URL path to the uploaded file
      profilePhotoUrl = `/candidate_profile/${req.file.filename}`;
    }

    // Create new candidate
    const candidate = await Candidate.create({
      ...candidateData,
      profilePhoto: profilePhotoUrl,
    });

    // Send welcome email
    const welcomeMailOptions = {
      from: `Inxyme <${emailFrom}>`,
      to: email,
      subject: `Registration Confirmed — JobFair 2025 | Inxyme`,
      html: `
  <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f5f7fb; padding: 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; max-width:600px; margin:0 auto; background:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 6px 18px rgba(32,33,36,0.08);">
      <tr>
        <td style="padding:20px 24px; text-align:left; background: linear-gradient(90deg,#4f46e5 0%, #6366f1 100%); color:#fff;">
          <h1 style="margin:0; font-size:20px; line-height:1.2;">Welcome, ${name}!</h1>
          <p style="margin:6px 0 0; font-size:14px; opacity:0.95;">Your registration for <strong>${eventName
        }</strong> is confirmed.</p>
        </td>
      </tr>

      <tr>
        <td style="padding:20px 24px;">
            <p style="margin:0 0 12px; font-size:15px; color:#111827;">
                Thank you for registering for <strong>${eventName}</strong>, organized by <strong> <span style="color: rgb(30, 144, 255)">e</span><span style="color: rgb(244, 124, 38)">KLABYA</span> </ strong> in collaboration with our partner companies. We’re excited to have you ${userType === "student"
          ? "— this event will connect you directly with recruiters, provide skill sessions, and  create  real job & internship opportunities."
          : "— this event will connect you with talented students from multiple colleges, helping     you     discover the right candidates for your hiring needs."
        }
            </p>


          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin-top:12px;">
            <tr>
              <td style="vertical-align:top; padding:8px 0;">
                <p style="margin:0; font-weight:600; color:#374151;">📍 Event</p>
                <p style="margin:6px 0 0; color:#4b5563;">
                  <strong>${eventName}</strong><br>
                  <span style="display:block; margin-top:6px;"><strong>Date:</strong> ${eventDate}
                </span>
                  <span style="display:block;"><strong>Time:</strong> ${eventTime}
                </span>
                  <span style="display:block;"><strong>Venue:</strong> ${venue}
                </span>
                  <span style="display:block;"><strong>City:</strong> ${city}
                </span>
                </p>
              </td>
            </tr>
          </table>

          <div style="margin:18px 0;">
            <a href="${mapLink}" style="display:inline-block; text-decoration:none; padding:10px 16px; border-radius:8px; background:#4f46e5; color:#ffffff; font-weight:600; font-size:14px;">
              View Location / Google Maps
            </a>
          </div>

          <hr style="border:none; border-top:1px solid #eef2ff; margin:18px 0;">

          <p style="margin:0 0 8px; font-weight:600; color:#374151;">
            ${userType === "student" ? "🎓 What to Expect" : "💼 Event Benefits for Hiring Partners"}
            </p>

            <ul style="margin:8px 0 0 18px; color:#4b5563; padding:0;">
                ${userType === "student"
          ? `
        <li>On-the-spot interviews & hiring opportunities</li>
        <li>Free career and skill-development sessions</li>
        <li>Interaction with top industry recruiters</li>
        <li>Participation certificate for all attendees</li>
      `
          : `
        <li>Dedicated hiring booth with branding visibility</li>
        <li>Access to 2000+ qualified student profiles</li>
        <li>On-the-spot interview and selection opportunity</li>
        <li>Media exposure & recognition as hiring partner</li>
      `
        }
        </ul>


        ${userType === "student"
          ? `
            <p style="margin:14px 0 8px; font-weight:600; color:#374151;">📋 What to Bring</p>
            <ul style="margin:8px 0 0 18px; color:#4b5563; padding:0;">
              <li>Updated Resume</li>
              <li>College ID Card / Valid Photo ID</li>
              <li>Inxyme Provided Invitation (Find Attached in this Email)</li>
              <li>Passport-size photograph (optional)</li>
            </ul>
          `
          : ""
        }
          

         <p style="margin:18px 0 0; color:#374151; font-weight:600;">🌐 Stay Connected</p>

<ul style="margin:10px 0 0; padding:0 0 0 18px; list-style-type:none; color:#111827;">
  <li style="margin-bottom:8px;">
    <span style="margin:0; font-size:13px; color:#6b7280;"><strong>Email: </strong></span>
    <span style="margin:4px 0 0; font-size:14px; color:#111827;">
      ${supportEmail}
    </span>
  </li>

  <li style="margin-bottom:8px;">
    <span style="margin:0; font-size:13px; color:#6b7280;"><strong>Phone: </strong></span>
    <span style="margin:4px 0 0; font-size:14px; color:#111827;">
      ${supportPhone}
    </span>
  </li>

  <li>
    <span style="margin:0; font-size:13px; color:#6b7280;"><strong>Website: </strong></span>
    <span style="margin:4px 0 0; font-size:14px; color:#111827;">
      ${website}
    </span>
  </li>
</ul>

        </td>
      </tr>

      <tr>
        <td style="background:#f9fafb; padding:14px 24px; text-align:center; color:#6b7280; font-size:13px;">
          <div style="max-width:520px; margin:0 auto;">
            <p style="margin:0 0 8px;">Need to update your registration? Reply to this email or contact us at ${supportEmail}.</p>
            <p style="margin:0;">© ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
          </div>
        </td>
      </tr>
    </table>
  </div>
  `,
      text: `Welcome to ${companyName}, ${name}!

Thank you for registering for ${eventName}.

Event Details:
- Date: ${eventDate}
- Time: ${eventTime}
- Venue: ${venue}
- City: ${city}

What to Expect:
- On-the-spot interviews & hiring opportunities
- Free career & skill development sessions
- Interaction with industry recruiters
- Participation certificate for all attendees

Please bring:
- Updated Resume
- College ID / Valid Photo ID
- Passport-size photograph (optional)

For questions contact: ${supportEmail} | ${supportPhone}

Warm regards,
${yourName}
${companyName}
`,
    };

    // Read profile photo if it exists
    let profilePhotoData = null;
    if (req.file) {
      try {
        const fileData = fs.readFileSync(req.file.path);
        const mimeType = req.file.mimetype || "image/jpeg";
        profilePhotoData = {
          data: fileData,
          mimeType: mimeType,
          base64: fileData.toString("base64"),
        };
      } catch (err) {
        console.error("Error reading profile photo:", err);
      }
    }

    // Generate ID card with profile photo
    const idCard = await generateIdCard(
      {
        ...candidate.toObject(),
        profilePhoto: profilePhotoData,
      },
      {
        eventName,
        eventDate,
        venue,
        city,
        qrCodeUrl: `https://inxyme.com/verify/${candidate._id}`,
        logoUrl: "https://www.inxyme.com/api/upload/file/Inxyme-capital-logo-png-9402.png",
      },
    );

    // Add ID card as PDF attachment
    welcomeMailOptions.attachments = [
      {
        filename: idCard.filename,
        content: idCard.buffer,
        contentType: "application/pdf",
      },
    ];

    // Extract registration ID from the filename (removing 'ID_Card_' and '.pdf')
    const registrationId = idCard.filename
      .replace("ID_Card_", "")
      .replace(".pdf", "");

    // Save registration ID to the candidate document
    try {
      await Candidate.findByIdAndUpdate(
        candidate._id,
        { registrationId },
        { new: true, runValidators: true },
      );
    } catch (error) {
      console.error("Error saving registration ID to candidate:", error);
      throw new Error("Failed to save registration ID");
    }

    // Add ID card download link in email body
    const idCardSection = `
            <div style="margin: 20px 0; padding: 15px; background: #f0f9ff; border-left: 4px solid #3b82f6; border-radius: 4px;">
                <h3 style="margin: 0 0 10px 0; color: #1e40af;">📌 Your Event ID Card</h3>
                <p style="margin: 0 0 10px 0; color: #1e3a8a;">
                    Your personalized event ID card is attached to this email. Please download and carry to the event for verification.
                </p>
                <p style="margin: 0; font-size: 13px; color: #3b82f6;">
                    <strong>ID Number:</strong> ${registrationId}
                </p>
            </div>
        `;

    // Insert ID card section after the greeting
    welcomeMailOptions.html = welcomeMailOptions.html.replace(
      '<p style="margin:0 0 12px; font-size:15px; color:#111827;">',
      idCardSection +
      '<p style="margin:0 0 12px; font-size:15px; color:#111827;">',
    );

    // Send admin notification email
    const adminEmail = process.env.ADMIN_EMAIL_YAHOO || "anand24h@yahoo.com";
    const adminMailOptions = {
      from: `Inxyme <${emailFrom}>`,
      to: adminEmail,
      subject: `New Candidate Registration: ${name}`,
      html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #4f46e5;">New Candidate Registration</h2>
                    <p>A new candidate has submitted their application:</p>
                    
                    <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 16px 0;">
                        <p><strong>Name:</strong> ${name}</p>
                        <p><strong>Registration ID:</strong> ${registrationId}</p>
                        <p><strong>Email:</strong> ${email}</p>
                        <p><strong>Phone:</strong> ${phone}</p>
                        ${userType === "student"
          ? `
                                <p><strong>Course:</strong> ${course || "N/A"}</p>
                                <p><strong>College:</strong> ${college || "N/A"}</p>
                                <p><strong>University:</strong> ${university || "N/A"}</p>
                              `
          : `
                                <p><strong>Organization:</strong> ${companyName || "N/A"}</p>
                              `
        }
                          
                        <p><strong>Registration Date:</strong> ${new Date().toLocaleString()}</p>
                    </div>
                    
                    <p>You can view all candidates in the admin dashboard.</p>
                    
                    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
                        <p>This is an automated notification. Please do not reply to this email.</p>
                    </div>
                </div>
            `,
      text: `New Candidate Registration

A new candidate has submitted their application:

Name: ${name}
Registration ID: ${registrationId}
Email: ${email}
Phone: ${phone}
${userType === "student"
          ? `Course: ${course || "N/A"}
College: ${college || "N/A"}
University: ${university || "N/A"}`
          : `Organization: ${companyName || "N/A"}`
        }
Registration Date: ${new Date().toLocaleString()}

You can view all candidates in the admin dashboard.

This is an automated notification. Please do not reply to this email.`,
    };

    // Send welcome email to candidate (don't await to avoid delaying the response)
    const sendWelcomeEmail = transporter
      .sendMail(welcomeMailOptions)
      .then((info) => {
        // Clean up the temporary ID card file after sending
        if (fs.existsSync(idCard.filePath)) {
          fs.unlink(idCard.filePath, (err) => {
            if (err) console.error("Error deleting temporary ID card:", err);
          });
        }
        return info;
      })
      .catch((error) => {
        console.error("Error sending welcome email:", error);
        // Clean up the temporary ID card file on error
        if (fs.existsSync(idCard.filePath)) {
          fs.unlink(idCard.filePath, (err) => {
            if (err) console.error("Error deleting temporary ID card:", err);
          });
        }
        throw error;
      });

    // Send admin notification (don't await to avoid delaying the response)
    const sendAdminEmail = transporter
      .sendMail(adminMailOptions)
      .then((info) => {
        return info;
      })
      .catch((error) => {
        throw error;
      });

    // Log any errors that occur during email sending
    Promise.allSettled([sendWelcomeEmail, sendAdminEmail]).then((results) => {
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(`Email ${index + 1} failed:`, result.reason);
        }
      });
    });

    res.status(201).json({
      success: true,
      message: "Application submitted successfully",
      data: candidate,
    });
  } catch (error) {
    console.error("Error creating candidate:", error);

    // Clean up the uploaded file if it exists
    if (profilePhotoPath && fs.existsSync(profilePhotoPath)) {
      fs.unlink(profilePhotoPath, (err) => {
        if (err) console.error("Error deleting uploaded file:", err);
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Error submitting application",
    });
  }
};

// @desc    Check if email exists
// @route   GET /api/candidates/check-email
// @access  Public
export const checkEmail = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Check if email exists in the database
    const existingCandidate = await Candidate.findOne({ email });

    res.status(200).json({
      success: true,
      exists: !!existingCandidate,
    });
  } catch (error) {
    console.error("Error checking email:", error);
    res.status(500).json({
      success: false,
      message: "Error checking email",
      error: error.message,
    });
  }
};

// @desc    Check if phone number exists
// @route   GET /api/candidates/check-phone
// @access  Public
export const checkPhone = async (req, res) => {
  try {
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    // Check if phone exists in the database
    const existingCandidate = await Candidate.findOne({ phone });

    res.status(200).json({
      success: true,
      exists: !!existingCandidate,
    });
  } catch (error) {
    console.error("Error checking phone:", error);
    res.status(500).json({
      success: false,
      message: "Error checking phone number",
      error: error.message,
    });
  }
};

export const checkCompanyPaymentStatus = async (req, res) => {
  try {
    const { email, phone } = req.query;

    const candidate = await Candidate.findOne({
      email: email.toLowerCase(),
      phone,
      userType: "company",
    });

    res.json({
      exists: !!candidate,
      userType: candidate?.userType,
      isPaymentDone: candidate?.isPaymentDone,
    });
  } catch (error) {
    console.error("Error checking company payment status:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Get all candidates (for admin)
// @route   GET /api/candidates
// @access  Private/Admin
export const getCandidates = async (req, res) => {
  try {
    const candidates = await Candidate.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: candidates.length,
      data: candidates,
    });
  } catch (error) {
    console.error("Error fetching candidates:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching candidates",
      error: error.message,
    });
  }
};

// @desc    Update candidate status (for admin)
// @route   PUT /api/candidates/:id/status
// @access  Private/Admin
export const updateCandidateStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;
    const candidate = await Candidate.findByIdAndUpdate(
      req.params.id,
      { status, notes },
      { new: true, runValidators: true },
    );

    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: "Candidate not found",
      });
    }

    res.status(200).json({
      success: true,
      data: candidate,
    });
  } catch (error) {
    console.error("Error updating candidate status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating candidate status",
    });
  }
};
