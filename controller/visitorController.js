import Visitor from "../model/Visitor.js";
import catchAsync from "../utils/catchAsync.js";
import { sendHotLeadAlertEmail } from "../utils/email.js";

/**
 * @desc    Track visitor page view (silent background sync)
 * @route   POST /api/visitors/track
 * @access  Public
 */
export const trackVisitor = catchAsync(async (req, res) => {
  const { visitorId, fingerprint, device, pageUrl, pageTitle, referrer } = req.body;

  if (!visitorId || !pageUrl) {
    return res.status(400).json({
      success: false,
      message: "visitorId and pageUrl are required",
    });
  }

  const now = new Date();
  const ip = req.ip || req.headers["x-forwarded-for"] || "";
  const userAgent = req.get("user-agent") || "";

  // 1. Try finding visitor by direct visitorId or associated visitorIds
  let visitor = await Visitor.findOne({
    $or: [{ visitorId }, { visitorIds: visitorId }],
  });

  let matchedViaFingerprint = false;

  // 2. If NOT found by visitorId, check Browser Fingerprint (Survives Incognito & Cookie Clearing!)
  if (!visitor && fingerprint && fingerprint.trim().length > 0) {
    visitor = await Visitor.findOne({ fingerprint: fingerprint.trim() });
    if (visitor) {
      matchedViaFingerprint = true;
      visitor.isFingerprintMatched = true;
      console.log(
        `🕵️ [Fingerprint Match] Incognito/Cache-Cleared visitor matched to profile: ${visitor.name || visitor.phone || visitor.visitorId} (Fingerprint: ${fingerprint})`
      );
    }
  }

  if (visitor) {
    // Determine if this is a new session visit (more than 30 minutes since last activity or matched via new incognito session)
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const isNewSession = matchedViaFingerprint || !visitor.lastSeen || visitor.lastSeen < thirtyMinutesAgo;

    if (isNewSession) {
      visitor.totalVisits = (visitor.totalVisits || 1) + 1;
    }

    visitor.pageViews = (visitor.pageViews || 0) + 1;
    visitor.lastSeen = now;
    visitor.lastPageVisited = pageUrl;
    visitor.lastPageTitle = pageTitle || visitor.lastPageTitle || "";
    visitor.ipAddress = ip;
    visitor.userAgent = userAgent;

    // Attach / update fingerprint
    if (fingerprint && (!visitor.fingerprint || visitor.fingerprint.startsWith("fb_"))) {
      visitor.fingerprint = fingerprint.trim();
    }

    // Attach / update device info
    if (device && typeof device === "object") {
      visitor.device = {
        ...visitor.device?.toObject?.(),
        ...device,
      };
    }

    // Associate new visitor UUID with this hardware profile
    if (!visitor.visitorIds) {
      visitor.visitorIds = [];
    }
    if (!visitor.visitorIds.includes(visitorId)) {
      visitor.visitorIds.push(visitorId);
    }

    // Append to page visit history (keep last 100 visits)
    visitor.history.push({
      pageUrl,
      pageTitle: pageTitle || "",
      referrer: referrer || "",
      ipAddress: ip,
      userAgent: userAgent,
      visitedAt: now,
    });

    if (visitor.history.length > 100) {
      visitor.history = visitor.history.slice(-100);
    }

    await visitor.save();

    // If this visitor is a known lead who submitted/blurred before, alert counselors/admin
    if (visitor.isKnownLead) {
      const modeLabel = matchedViaFingerprint ? "[Incognito / Cookie Cleared]" : "[Returning Lead]";
      console.log(
        `🔥 ${modeLabel} ${visitor.name || "Known Lead"} (${visitor.phone || visitor.email}) returned to: ${pageUrl}`
      );

      if (req.io) {
        req.io.emit("hot-lead-alert", {
          message: `${visitor.name || "A returning student"} ${matchedViaFingerprint ? "(Incognito / Cache Cleared)" : ""} is currently viewing ${pageUrl}`,
          phone: visitor.phone,
          email: visitor.email,
          pageUrl: pageUrl,
          totalVisits: visitor.totalVisits,
          isFingerprintMatched: matchedViaFingerprint,
          timestamp: now,
        });
      }

      // Send instant Email Alert (throttled to 1 email per 15 mins per visitor to prevent inbox spam)
      const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000);
      if (!visitor.lastAlertSentAt || visitor.lastAlertSentAt < fifteenMinsAgo) {
        visitor.lastAlertSentAt = now;
        sendHotLeadAlertEmail(visitor, pageUrl).catch((err) =>
          console.warn("Returning lead email alert warning:", err.message)
        );
      }
    }

    return res.status(200).json({
      success: true,
      isReturning: true,
      isKnownLead: visitor.isKnownLead,
      isFingerprintMatched: matchedViaFingerprint,
      name: visitor.name,
      totalVisits: visitor.totalVisits,
      pageViews: visitor.pageViews,
      fingerprint: visitor.fingerprint,
    });
  }

  // New first-time visitor
  visitor = await Visitor.create({
    visitorId,
    fingerprint: fingerprint?.trim() || "",
    visitorIds: [visitorId],
    device: device || {},
    firstSeen: now,
    lastSeen: now,
    totalVisits: 1,
    pageViews: 1,
    lastPageVisited: pageUrl,
    lastPageTitle: pageTitle || "",
    history: [
      {
        pageUrl,
        pageTitle: pageTitle || "",
        referrer: referrer || "",
        ipAddress: ip,
        userAgent: userAgent,
        visitedAt: now,
      },
    ],
    ipAddress: ip,
    userAgent: userAgent,
  });

  return res.status(200).json({
    success: true,
    isReturning: false,
    isKnownLead: false,
    totalVisits: 1,
    pageViews: 1,
    fingerprint: visitor.fingerprint,
  });
});

/**
 * @desc    Link visitor UUID & browser fingerprint with lead contact details (name, email, phone)
 * @route   POST /api/visitors/identify
 * @access  Public
 */
export const identifyVisitor = catchAsync(async (req, res) => {
  const { visitorId, fingerprint, device, name, email, phone } = req.body;

  if (!visitorId && !fingerprint) {
    return res.status(400).json({
      success: false,
      message: "visitorId or fingerprint is required",
    });
  }

  const query = {
    $or: [
      ...(visitorId ? [{ visitorId }, { visitorIds: visitorId }] : []),
      ...(fingerprint ? [{ fingerprint: fingerprint.trim() }] : []),
    ],
  };

  const updateData = {
    ...(name && { name: name.trim() }),
    ...(email && { email: email.trim().toLowerCase() }),
    ...(phone && { phone: phone.trim() }),
    ...(fingerprint && { fingerprint: fingerprint.trim() }),
    ...(device && { device }),
    isKnownLead: true,
    lastSeen: new Date(),
  };

  const visitor = await Visitor.findOneAndUpdate(
    query,
    {
      $set: updateData,
      ...(visitorId ? { $addToSet: { visitorIds: visitorId } } : {}),
      $setOnInsert: {
        visitorId: visitorId || `fp_${Date.now()}`,
        firstSeen: new Date(),
        totalVisits: 1,
        pageViews: 1,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return res.status(200).json({
    success: true,
    message: "Visitor identified and linked successfully",
    data: {
      visitorId: visitor.visitorId,
      fingerprint: visitor.fingerprint,
      name: visitor.name,
      email: visitor.email,
      phone: visitor.phone,
      isKnownLead: visitor.isKnownLead,
    },
  });
});

/**
 * @desc    Get all visitors with activity history
 * @route   GET /api/visitors
 * @access  Protected (admin)
 */
export const getAllVisitors = catchAsync(async (req, res) => {
  const { page = 1, limit = 50, isKnownLead, returningOnly, search } = req.query;

  const query = {};
  if (isKnownLead !== undefined) {
    query.isKnownLead = isKnownLead === "true";
  }
  if (returningOnly === "true") {
    query.$or = [{ totalVisits: { $gt: 1 } }, { pageViews: { $gt: 1 } }];
  }
  if (search) {
    const re = new RegExp(search, "i");
    query.$or = [
      { name: re },
      { email: re },
      { phone: re },
      { visitorId: re },
      { fingerprint: re },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [visitors, total] = await Promise.all([
    Visitor.find(query).sort({ lastSeen: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    Visitor.countDocuments(query),
  ]);

  return res.status(200).json({
    success: true,
    data: visitors,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});
