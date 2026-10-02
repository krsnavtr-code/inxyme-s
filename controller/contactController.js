import Contact from "../model/Contact.js";
import Visitor from "../model/Visitor.js";
import { validationResult } from "express-validator";
import mongoose from "mongoose";
import {
  sendContactNotifications,
  sendHotLeadAlertEmail,
} from "../utils/email.js";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { trackServerSideEvent } from "../utils/serverTracking.js";


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

    const {
      name,
      email,
      phone,
      message,
      courseId,
      courseTitle,
      subject,
      visitorId,
      fingerprint,
      device,
    } = req.body;

    // Check if this is a duplicate submission (same email and message within last 5 minutes)
    const duplicateQuery = {
      email,
      submittedAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) }, // Last 5 minutes
    };
    if (message) {
      duplicateQuery.message = message;
    }
    const recentSubmission = await Contact.findOne(duplicateQuery);

    if (recentSubmission) {
      return res.status(429).json({
        success: false,
        message:
          "You have recently submitted a similar message. Please wait before submitting again.",
      });
    }

    // Generate unique tracking ID or use visitorId
    const activeTrackingId = visitorId || uuidv4();

    // Create new contact
    const contactData = {
      name: name?.trim() || "",
      email: email?.trim().toLowerCase() || "",
      phone: phone?.trim(),
      subject: (subject || `Enquiry about ${courseTitle || "course"}`).trim(),
      message: message?.trim() || (courseTitle ? `Enquiry about ${courseTitle}` : "Lead from website"),
      status: "new",
      submittedAt: new Date(),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      trackingId: activeTrackingId,
      visitorId: visitorId || activeTrackingId,
      fingerprint: fingerprint?.trim() || "",
      device: device || {},
      pageUrl: req.body.pageUrl || "",
      source: req.body.source || "website",
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

    // Link visitor UUID / fingerprint with this newly submitted lead
    if (visitorId || fingerprint) {
      try {
        const query = {
          $or: [
            ...(visitorId ? [{ visitorId }, { visitorIds: visitorId }] : []),
            ...(fingerprint ? [{ fingerprint: fingerprint.trim() }] : []),
          ],
        };

        const vDoc = await Visitor.findOneAndUpdate(
          query,
          {
            $set: {
              name: savedContact.name,
              email: savedContact.email,
              phone: savedContact.phone,
              isKnownLead: true,
              lastSeen: new Date(),
              ...(fingerprint ? { fingerprint: fingerprint.trim() } : {}),
              ...(device ? { device } : {}),
            },
            ...(visitorId ? { $addToSet: { visitorIds: visitorId } } : {}),
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        if (vDoc) {
          savedContact.totalVisits = vDoc.totalVisits || 1;
          savedContact.pageViews = vDoc.pageViews || 1;
          savedContact.lastPageVisited = vDoc.lastPageVisited || savedContact.pageUrl;
          savedContact.visitHistory = vDoc.history || [];
          if (!savedContact.fingerprint && vDoc.fingerprint) {
            savedContact.fingerprint = vDoc.fingerprint;
          }
          await savedContact.save();
        }
      } catch (vErr) {
        console.warn("Visitor link warning:", vErr.message);
      }
    }

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

    // 07 - Server-Side Tracking (Bypassing Ad-Blockers) for Final Lead Submission
    trackServerSideEvent({
      eventType: "Lead",
      pageUrl: savedContact.pageUrl || "",
      pageTitle: savedContact.courseTitle || savedContact.subject || "Contact Form Lead",
      visitorId: savedContact.visitorId || activeTrackingId,
      fingerprint: savedContact.fingerprint || fingerprint || "",
      ipAddress: req.ip || "",
      userAgent: req.get("user-agent") || "",
      userData: {
        name: savedContact.name,
        email: savedContact.email,
        phone: savedContact.phone,
        courseTitle: savedContact.courseTitle,
      },
      customData: {
        source: savedContact.source || "website_contact_form",
        courseId: savedContact.courseId,
        subject: savedContact.subject,
        isPartial: false,
      },
    });

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

    const rawContacts = await Contact.find(query)
      .sort({ submittedAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean();

    const totalItems = await Contact.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limitNum);

    // Cross-reference with Visitor collection to enrich each contact with tracking info
    const visitorIds = rawContacts.map((c) => c.visitorId).filter(Boolean);
    const fingerprints = rawContacts.map((c) => c.fingerprint).filter(Boolean);
    const emails = rawContacts.map((c) => c.email).filter(Boolean);
    const phones = rawContacts.map((c) => c.phone).filter(Boolean);

    let visitors = [];
    if (
      visitorIds.length > 0 ||
      fingerprints.length > 0 ||
      emails.length > 0 ||
      phones.length > 0
    ) {
      try {
        visitors = await Visitor.find({
          $or: [
            ...(visitorIds.length > 0
              ? [
                  { visitorId: { $in: visitorIds } },
                  { visitorIds: { $in: visitorIds } },
                ]
              : []),
            ...(fingerprints.length > 0 ? [{ fingerprint: { $in: fingerprints } }] : []),
            ...(emails.length > 0 ? [{ email: { $in: emails } }] : []),
            ...(phones.length > 0 ? [{ phone: { $in: phones } }] : []),
          ],
        }).lean();
      } catch (err) {
        console.warn("Failed to fetch matching visitors for contacts:", err.message);
      }
    }

    const visitorByIdMap = new Map();
    const visitorByFpMap = new Map();
    const visitorByEmailMap = new Map();
    const visitorByPhoneMap = new Map();

    visitors.forEach((v) => {
      if (v.visitorId) visitorByIdMap.set(v.visitorId, v);
      if (Array.isArray(v.visitorIds)) {
        v.visitorIds.forEach((vid) => visitorByIdMap.set(vid, v));
      }
      if (v.fingerprint) visitorByFpMap.set(v.fingerprint, v);
      if (v.email) visitorByEmailMap.set(v.email.toLowerCase(), v);
      if (v.phone) visitorByPhoneMap.set(v.phone.replace(/\D/g, ""), v);
    });

    const enrichedContacts = rawContacts.map((contact) => {
      const cleanPhone = contact.phone ? contact.phone.replace(/\D/g, "") : "";
      const cleanEmail = contact.email ? contact.email.toLowerCase() : "";

      const v =
        (contact.visitorId && visitorByIdMap.get(contact.visitorId)) ||
        (contact.fingerprint && visitorByFpMap.get(contact.fingerprint)) ||
        (cleanEmail && visitorByEmailMap.get(cleanEmail)) ||
        (cleanPhone && visitorByPhoneMap.get(cleanPhone)) ||
        null;

      const trackingId =
        contact.trackingId ||
        contact.visitorId ||
        v?.visitorId ||
        `TRK-${contact._id.toString().slice(-6).toUpperCase()}`;

      const totalVisits =
        v?.totalVisits ||
        contact.totalVisits ||
        (v?.history?.length > 1 ? v.history.length : 1);

      const pageViews =
        v?.pageViews ||
        contact.pageViews ||
        (v?.history?.length ? v.history.length : 1);

      const lastPageVisited =
        v?.lastPageVisited ||
        contact.lastPageVisited ||
        (v?.history?.length ? v.history[v.history.length - 1]?.pageUrl : contact.pageUrl) ||
        contact.pageUrl ||
        "";

      const visitHistory =
        v?.history && v.history.length > 0
          ? v.history
          : contact.visitHistory && contact.visitHistory.length > 0
          ? contact.visitHistory
          : contact.pageUrl
          ? [
              {
                pageUrl: contact.pageUrl,
                pageTitle: contact.courseTitle || "",
                visitedAt: contact.submittedAt,
              },
            ]
          : [];

      return {
        ...contact,
        trackingId,
        visitorId: contact.visitorId || v?.visitorId,
        totalVisits,
        pageViews,
        lastPageVisited,
        visitHistory,
        fingerprint: contact.fingerprint || v?.fingerprint || "",
        device: contact.device || v?.device || null,
        isFingerprintMatched: v?.isFingerprintMatched || false,
        firstSeen: v?.firstSeen || contact.submittedAt,
        lastSeen: v?.lastSeen || contact.submittedAt,
        isReturning: totalVisits > 1,
      };
    });

    res.json({
      success: true,
      data: enrichedContacts,
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
