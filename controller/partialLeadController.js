import PartialLead from "../model/PartialLead.js";
import Contact from "../model/Contact.js";
import catchAsync from "../utils/catchAsync.js";

/**
 * @desc    Capture a partial lead (onBlur event from frontend forms)
 * @route   POST /api/partial-leads
 * @access  Public
 *
 * The frontend sends whatever fields the user has filled so far (name,
 * email, phone, etc.) along with a unique `sessionFingerprint`. We
 * upsert on that fingerprint so that multiple blur events from the same
 * session update the same record instead of creating duplicates.
 *
 * It simultaneously saves to BOTH:
 * 1. PartialLead collection (partialleads)
 * 2. Contact collection (contacts)
 */
export const capturePartialLead = catchAsync(async (req, res) => {
  const {
    name,
    email,
    phone,
    source,
    pageUrl,
    courseId,
    courseTitle,
    sessionFingerprint,
  } = req.body;

  // Must have at least one useful contact detail
  const hasContact =
    (email && email.trim()) || (phone && phone.trim());

  if (!hasContact) {
    return res.status(200).json({
      success: false,
      message: "Need at least an email or phone number to save a partial lead.",
    });
  }

  // Basic email format check (lightweight, no hard validation)
  if (email && email.trim()) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(200).json({
        success: false,
        message: "Invalid email format, skipping partial lead.",
      });
    }
  }

  // Basic phone check — at least 7 digits
  if (phone && phone.trim()) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) {
      return res.status(200).json({
        success: false,
        message: "Phone number too short, skipping partial lead.",
      });
    }
  }

  // Build the upsert data for PartialLead
  const updateData = {
    ...(name && { name: name.trim() }),
    ...(email && { email: email.trim().toLowerCase() }),
    ...(phone && { phone: phone.trim() }),
    ...(source && { source: source.trim() }),
    ...(pageUrl && { pageUrl: pageUrl.trim() }),
    ...(courseId && { courseId }),
    ...(courseTitle && { courseTitle: courseTitle.trim() }),
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  };

  let lead;

  if (sessionFingerprint) {
    // Upsert: update existing partial lead for this session or create new
    lead = await PartialLead.findOneAndUpdate(
      { sessionFingerprint },
      { $set: updateData, $setOnInsert: { sessionFingerprint } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } else {
    // No fingerprint — create a new record (fallback)
    lead = await PartialLead.create({
      ...updateData,
      sessionFingerprint: `nofp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    });
  }

  // Simultaneously sync to Contact collection (contacts)
  try {
    const contactName =
      name && name.trim()
        ? name.trim()
        : phone
        ? `Lead (${phone.trim()})`
        : "Website Lead";

    const contactData = {
      name: contactName,
      ...(email && { email: email.trim().toLowerCase() }),
      ...(phone && { phone: phone.trim() }),
      ...(courseId && { courseId }),
      ...(courseTitle && { courseTitle: courseTitle.trim() }),
      source: source?.trim() || "website",
      pageUrl: pageUrl?.trim() || "",
      subject: (courseTitle
        ? `Enquiry: ${courseTitle.trim()}`
        : `Partial Lead (${source?.trim() || "Website"})`
      ).substring(0, 200),
      message: `Partial lead captured via onBlur from ${pageUrl?.trim() || source?.trim() || "website"}`,
      status: "new",
      isPartial: true,
      lastUpdated: new Date(),
    };

    if (sessionFingerprint) {
      await Contact.findOneAndUpdate(
        { sessionFingerprint },
        {
          $set: contactData,
          $setOnInsert: { submittedAt: new Date() },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } else {
      await Contact.create({
        ...contactData,
        submittedAt: new Date(),
      });
    }
  } catch (contactErr) {
    console.error("Error syncing partial lead to Contact collection:", contactErr.message);
  }

  return res.status(200).json({
    success: true,
    message: "Partial lead captured",
    data: { id: lead._id },
  });
});

/**
 * @desc    Mark a partial lead as converted (called after final form submit)
 * @route   PATCH /api/partial-leads/convert
 * @access  Public
 */
export const convertPartialLead = catchAsync(async (req, res) => {
  const { sessionFingerprint, email } = req.body;

  const query = {};
  if (sessionFingerprint) {
    query.sessionFingerprint = sessionFingerprint;
  } else if (email) {
    query.email = email.trim().toLowerCase();
    query.converted = false;
  }

  if (Object.keys(query).length === 0) {
    return res.status(200).json({ success: false, message: "Nothing to convert" });
  }

  const result = await PartialLead.updateMany(query, {
    $set: {
      converted: true,
      convertedAt: new Date(),
      status: "converted",
    },
  });

  // Also update corresponding Contact record
  try {
    const contactQuery = {};
    if (sessionFingerprint) {
      contactQuery.sessionFingerprint = sessionFingerprint;
    } else if (email) {
      contactQuery.email = email.trim().toLowerCase();
      contactQuery.isPartial = true;
    }

    if (Object.keys(contactQuery).length > 0) {
      await Contact.updateMany(contactQuery, {
        $set: {
          isPartial: false,
          lastUpdated: new Date(),
        },
      });
    }
  } catch (contactErr) {
    console.error("Error updating Contact on convert:", contactErr.message);
  }

  return res.status(200).json({
    success: true,
    message: `${result.modifiedCount} partial lead(s) marked as converted`,
  });
});

/**
 * @desc    Get all partial leads (for admin dashboard)
 * @route   GET /api/partial-leads
 * @access  Protected (admin)
 */
export const getAllPartialLeads = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 50,
    status,
    converted,
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (converted !== undefined) filter.converted = converted === "true";
  if (search) {
    const re = new RegExp(search, "i");
    filter.$or = [{ name: re }, { email: re }, { phone: re }];
  }

  const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [leads, total] = await Promise.all([
    PartialLead.find(filter).sort(sort).skip(skip).limit(parseInt(limit)).lean(),
    PartialLead.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    data: leads,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});
