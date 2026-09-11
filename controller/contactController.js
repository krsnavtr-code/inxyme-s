import Contact from "../model/Contact.js";
import { validationResult } from "express-validator";
import mongoose from "mongoose";
import {
  sendContactNotifications,
  sendHotLeadAlertEmail,
} from "../utils/email.js";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";

/**
 * @desc    Submit a contact form
 * @route   POST /api/contacts
 * @access  Public
 */
export const submitContactForm = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = {};
      errors.array().forEach((error) => {
        errorMessages[error.param] = error.msg;
      });

      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: errorMessages,
      });
    }

    const { name, email, phone, message, courseId, courseTitle, subject } =
      req.body;

    // Check if this is a duplicate submission (same email and message within last 5 minutes)
    const recentSubmission = await Contact.findOne({
      email,
      message,
      submittedAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) }, // Last 5 minutes
    });

    if (recentSubmission) {
      return res.status(429).json({
        success: false,
        message:
          "You have recently submitted a similar message. Please wait before submitting again.",
      });
    }

    // Generate unique tracking ID
    const trackingId = uuidv4();

    // Create new contact
    const contactData = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim(),
      subject: (subject || `Enquiry about ${courseTitle || "course"}`).trim(),
      message: message.trim(),
      status: "new",
      submittedAt: new Date(),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      trackingId: trackingId,
    };

    // Add course-related fields if they exist
    if (courseId) {
      contactData.courseId = courseId; // Store the original course ID
    }
    if (courseTitle) {
      contactData.courseTitle = courseTitle?.trim();
    }

    const contact = new Contact(contactData);

    // Save to database
    const savedContact = await contact.save();

    // Sync with CRM (blocking - wait for CRM response)
    try {
      await sendLeadToCRM({
        name: savedContact.name,
        email: savedContact.email,
        phone: savedContact.phone,
        course: savedContact.courseTitle || "",
        message: savedContact.message,
      });
    } catch (crmError) {
      console.error("Error pushing lead to CRM:", crmError.message);
      // Continue with the request even if CRM fails
    }

    // Send email notifications (to user and admin)
    try {
      await sendContactNotifications({
        ...savedContact.toObject(),
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
    } catch (emailError) {
      console.error("Error sending contact notifications:", emailError);
      // Don't fail the request if email sending fails
      // Just log the error and continue
    }

    // Prepare success response
    const responseData = {
      success: true,
      message: "Thank you for your message. We will get back to you soon!",
      data: {
        id: savedContact._id,
        name: savedContact.name,
        email: savedContact.email,
        subject: savedContact.subject,
        submittedAt: savedContact.submittedAt,
        trackingId: savedContact.trackingId,
      },
    };

    // Send response
    return res.status(201).json(responseData);
  } catch (error) {
    console.error("Error submitting contact form:", {
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      body: req.body,
    });

    // Handle duplicate key error (e.g., unique email constraint)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message:
          "You have already submitted a contact form with this email address.",
      });
    }

    // Handle validation errors
    if (error.name === "ValidationError") {
      const errorMessages = {};
      Object.values(error.errors).forEach((err) => {
        errorMessages[err.path] = err.message;
      });

      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: errorMessages,
      });
    }

    // Handle other errors
    res.status(500).json({
      success: false,
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "An error occurred while processing your request. Please try again later.",
    });
  }
};

export const getAllContacts = async (req, res) => {
  try {
    const { status, date, course, page = 1, limit = 10 } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    }

    if (date) {
      // Create a date range for the selected date (from start to end of day)
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);

      query.submittedAt = {
        $gte: startDate,
        $lte: endDate,
      };
    }

    if (course) {
      query.courseTitle = { $regex: course, $options: "i" }; // Case-insensitive partial match
    }

    // Convert limit to number and ensure it's positive
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const pageNum = Math.max(1, parseInt(page, 10) || 1);

    const contacts = await Contact.find(query)
      .sort({ submittedAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum);

    const totalItems = await Contact.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limitNum);

    res.json({
      success: true,
      data: contacts,
      meta: {
        total: totalItems,
        totalPages,
        currentPage: pageNum,
        limit: limitNum,
      },
      currentPage: page,
    });
  } catch (error) {
    console.error("Error fetching contacts:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch contacts",
      error: error.message,
    });
  }
};

export const updateContactStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const contact = await Contact.findByIdAndUpdate(
      id,
      { status },
      { new: true },
    );

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found",
      });
    }

    res.json({
      success: true,
      data: contact,
    });
  } catch (error) {
    console.error("Error updating contact status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update contact status",
      error: error.message,
    });
  }
};

/**
 * @desc    Track user visit for hot lead alerts
 * @route   POST /api/contacts/track-visit
 * @access  Public
 */
export const trackVisit = async (req, res) => {
  try {
    const { trackingId, pageUrl } = req.body;

    if (!trackingId) {
      return res.status(400).json({
        success: false,
        message: "Tracking ID is required",
      });
    }

    // Find contact by tracking ID
    const contactUser = await Contact.findOne({ trackingId });

    if (contactUser) {
      // Add visit to history
      contactUser.visitHistory.push({ pageUrl });
      await contactUser.save();

      // Emit hot lead alert to admin dashboard via socket.io
      if (req.io) {
        req.io.emit("hot-lead-alert", {
          message: `${contactUser.name} is currently looking at ${pageUrl}`,
          phone: contactUser.phone,
          email: contactUser.email,
          pageUrl: pageUrl,
          timestamp: new Date(),
        });
      }

      // Send email notification to krishnaavtar955@gmail.com
      try {
        await sendHotLeadAlertEmail(contactUser, pageUrl);
      } catch (emailError) {
        console.error("Error sending hot lead alert email:", emailError);
        // Don't fail the request if email sending fails
      }
    }

    res.status(200).json({
      success: true,
      message: "Visit tracked successfully",
    });
  } catch (error) {
    console.error("Error tracking visit:", error);
    res.status(500).json({
      success: false,
      message: "Failed to track visit",
      error: error.message,
    });
  }
};

// CRM calling helper function
async function sendLeadToCRM(leadData) {
  const crmUrl = process.env.CRM_API_URL;
  const crmToken = process.env.CRM_API_TOKEN;

  try {
    const response = await axios.post(
      crmUrl,
      {
        name: leadData.name,
        email: leadData.email,
        phone: leadData.phone,
        course: leadData.course || "",
        message: leadData.message || "",
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Inxyme-Token": crmToken,
        },
        timeout: 10000, // 10 seconds timeout limit
      },
    );

    if (response.data.success) {
      console.log(
        `[CRM] Lead successfully synced with CRM. Lead ID: ${response.data.lead_id}`,
      );
      return response.data;
    } else {
      console.warn(
        `[CRM] Duplicate or warning from CRM: ${response.data.message}`,
      );
      return response.data;
    }
  } catch (error) {
    console.error(
      `[CRM] Failed to send lead to CRM:`,
      error.response ? error.response.data : error.message,
    );
    throw error; // Throw error so caller can handle it
  }
}
