import mongoose from "mongoose";
import Contact from "../model/Contact.js";
import PartialLead from "../model/PartialLead.js";
import User from "../model/User.js";
import { trackServerSideEvent } from "../utils/serverTracking.js";

/**
 * 09 - Pre-filled Magic Links (For Returning Users)
 * Resolve a magic token or UID from WhatsApp / Email links
 * @route   GET /api/magic-link/:identifier
 * @route   GET /api/magic-link/resolve?uid=...
 * @access  Public
 */
export const resolveMagicLink = async (req, res) => {
  try {
    const rawId = req.params.identifier || req.query.uid || req.query.token;

    if (!rawId || typeof rawId !== "string" || !rawId.trim()) {
      return res.status(400).json({
        success: false,
        message: "A valid uid or magic token is required",
      });
    }

    const identifier = rawId.trim();

    // 1. Check if it is a base64url encoded token (starts with ml_ or is standard base64)
    if (identifier.startsWith("ml_")) {
      try {
        const base64Str = identifier.substring(3);
        const decodedStr = Buffer.from(base64Str, "base64url").toString("utf8");
        const payload = JSON.parse(decodedStr);

        if (payload && (payload.name || payload.email || payload.phone)) {
          return res.status(200).json({
            success: true,
            source: "token",
            data: {
              uid: payload.uid || identifier,
              name: payload.name || "",
              email: payload.email || "",
              phone: payload.phone || "",
              courseTitle: payload.courseTitle || "",
              courseId: payload.courseId || "",
              courseSlug: payload.courseSlug || "",
            },
          });
        }
      } catch (err) {
        // Not a valid encoded payload, proceed to database lookups
      }
    }

    // 2. Check if it's a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      // 2a. Check Contact collection (completed enquiries/leads)
      const contact = await Contact.findById(identifier).lean();
      if (contact && (contact.name || contact.email || contact.phone)) {
        try {
          trackServerSideEvent(req, "magic_link_opened", {
            uid: identifier,
            source: "contact",
            contactId: contact._id,
            email: contact.email,
            phone: contact.phone,
          });
        } catch {
          // Non-blocking
        }

        return res.status(200).json({
          success: true,
          source: "contact",
          data: {
            uid: contact._id.toString(),
            name: contact.name && contact.name !== "Website Lead" ? contact.name : "",
            email: contact.email || "",
            phone: contact.phone || "",
            courseTitle: contact.courseTitle || "",
            courseId: contact.courseId || "",
            pageUrl: contact.pageUrl || "",
          },
        });
      }

      // 2b. Check PartialLead collection (captured onBlur)
      const partialLead = await PartialLead.findById(identifier).lean();
      if (partialLead && (partialLead.name || partialLead.email || partialLead.phone)) {
        try {
          trackServerSideEvent(req, "magic_link_opened", {
            uid: identifier,
            source: "partial_lead",
            leadId: partialLead._id,
            email: partialLead.email,
            phone: partialLead.phone,
          });
        } catch {
          // Non-blocking
        }

        return res.status(200).json({
          success: true,
          source: "partial_lead",
          data: {
            uid: partialLead._id.toString(),
            name: partialLead.name || "",
            email: partialLead.email || "",
            phone: partialLead.phone || "",
            courseTitle: partialLead.courseTitle || "",
            courseId: partialLead.courseId || "",
            pageUrl: partialLead.pageUrl || "",
          },
        });
      }

      // 2c. Check User collection (registered student)
      const user = await User.findById(identifier)
        .select("fullname name email phone")
        .lean();
      if (user && (user.fullname || user.name || user.email || user.phone)) {
        return res.status(200).json({
          success: true,
          source: "user",
          data: {
            uid: user._id.toString(),
            name: user.fullname || user.name || "",
            email: user.email || "",
            phone: user.phone || "",
          },
        });
      }
    }

    // 3. Fallback: Search by visitorId or sessionFingerprint if passed
    const contactByVisitor = await Contact.findOne({
      $or: [{ visitorId: identifier }, { sessionFingerprint: identifier }],
    })
      .sort({ createdAt: -1 })
      .lean();

    if (contactByVisitor && (contactByVisitor.name || contactByVisitor.email || contactByVisitor.phone)) {
      return res.status(200).json({
        success: true,
        source: "visitor",
        data: {
          uid: contactByVisitor._id.toString(),
          name:
            contactByVisitor.name && contactByVisitor.name !== "Website Lead"
              ? contactByVisitor.name
              : "",
          email: contactByVisitor.email || "",
          phone: contactByVisitor.phone || "",
          courseTitle: contactByVisitor.courseTitle || "",
          courseId: contactByVisitor.courseId || "",
        },
      });
    }

    return res.status(404).json({
      success: false,
      message: "Magic link expired or user record not found",
    });
  } catch (error) {
    console.error("Error resolving magic link:", error);
    return res.status(500).json({
      success: false,
      message: "Server error resolving magic link",
    });
  }
};

/**
 * Generate a pre-filled magic link with WhatsApp & Email template
 * @route   POST /api/magic-link/generate
 * @access  Public / Admin
 */
export const generateMagicLink = async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      courseSlug,
      courseTitle,
      contactId,
      userId,
      baseUrl,
      customNote,
    } = req.body;

    let uid = contactId || userId;

    // If no DB ID provided, encode as a portable token
    if (!uid) {
      const payload = {
        name: name || "",
        phone: phone || "",
        email: email || "",
        courseSlug: courseSlug || "",
        courseTitle: courseTitle || "",
        ts: Date.now(),
      };
      const token = Buffer.from(JSON.stringify(payload)).toString("base64url");
      uid = `ml_${token}`;
    }

    const base = baseUrl || process.env.CLIENT_URL || "https://www.inxyme.com";
    const path = courseSlug ? `/course/${courseSlug}` : "/courses";
    const magicUrl = `${base.replace(/\/$/, "")}${path}?uid=${encodeURIComponent(uid)}`;

    const studentName = name?.trim() || "Student";
    const title = courseTitle?.trim() || "Course";

    const whatsappMessage = `Hi ${studentName}! Here is your direct link for ${title}:
${magicUrl}

⚡ We have already pre-filled your details (Name & Number) — just tap 'Submit' to confirm your seat without typing! 🚀`;

    const cleanPhone = phone ? phone.replace(/[^0-9]/g, "") : "";
    const whatsappUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappMessage)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappMessage)}`;

    return res.status(200).json({
      success: true,
      data: {
        uid,
        magicUrl,
        whatsappUrl,
        whatsappMessage,
        studentName,
        courseTitle: title,
      },
    });
  } catch (error) {
    console.error("Error generating magic link:", error);
    return res.status(500).json({
      success: false,
      message: "Server error generating magic link",
    });
  }
};
