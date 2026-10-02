import crypto from "crypto";
import axios from "axios";
import ServerTrackingLog from "../model/ServerTrackingLog.js";

/**
 * SHA-256 Hash helper compliant with Meta Conversions API specifications
 * All PII (email, phone, name) must be lowercased, trimmed, and SHA-256 hashed.
 */
export const hashData = (value) => {
  if (!value || typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return crypto.createHash("sha256").update(normalized).digest("hex");
};

/**
 * Normalize phone number for Meta CAPI (removes spaces/symbols, ensures country code)
 */
export const normalizePhone = (phone) => {
  if (!phone) return undefined;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return undefined;
  // If standard 10 digit Indian number without country code, prefix with 91
  if (digits.length === 10) {
    return "91" + digits;
  }
  return digits;
};

/**
 * Dispatches event directly to Meta (Facebook) Conversions API (CAPI)
 * Completely server-to-server, 100% immune to browser ad-blockers (Brave, uBlock, AdGuard).
 */
const sendToMetaCAPI = async ({
  pixelId,
  accessToken,
  eventName,
  pageUrl,
  pageTitle,
  visitorId,
  fingerprint,
  ipAddress,
  userAgent,
  userData = {},
  customData = {},
}) => {
  const isConfigured = Boolean(pixelId && accessToken && accessToken.trim().length > 10);

  // If token is missing, run in high-fidelity simulation mode
  if (!isConfigured) {
    return {
      status: "simulated",
      message: "Meta CAPI simulated (add META_CAPI_ACCESS_TOKEN in .env for live Meta Graph API hits)",
      pixelId: pixelId || "1612208420573846",
    };
  }

  const { email, phone, name } = userData;
  const nameParts = (name || "").trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

  const hashedEmail = hashData(email);
  const hashedPhone = hashData(normalizePhone(phone));
  const hashedFirstName = hashData(firstName);
  const hashedLastName = hashData(lastName);
  const hashedExternalId = hashData(visitorId || fingerprint);

  const metaUserData = {
    client_ip_address: ipAddress || undefined,
    client_user_agent: userAgent || undefined,
    ...(hashedEmail && { em: [hashedEmail] }),
    ...(hashedPhone && { ph: [hashedPhone] }),
    ...(hashedFirstName && { fn: [hashedFirstName] }),
    ...(hashedLastName && { ln: [hashedLastName] }),
    ...(hashedExternalId && { external_id: [hashedExternalId] }),
  };

  const eventPayload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_source_url: pageUrl,
        user_data: metaUserData,
        custom_data: {
          content_name: customData.courseTitle || pageTitle || "Inxyme Tech Academy",
          content_category: "Education & Career Programs",
          ...customData,
        },
      },
    ],
  };

  const metaUrl = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`;

  const response = await axios.post(metaUrl, eventPayload, {
    headers: { "Content-Type": "application/json" },
    timeout: 5000,
  });

  return {
    status: "dispatched",
    eventsReceived: response.data?.events_received || 1,
    fbtraceId: response.data?.fbtrace_id || "",
  };
};

/**
 * Dispatches event directly to Google Analytics 4 (GA4) Measurement Protocol
 * Completely server-to-server, immune to browser ad-blockers.
 */
const sendToGA4MeasurementProtocol = async ({
  measurementId,
  apiSecret,
  eventName,
  pageUrl,
  pageTitle,
  visitorId,
  fingerprint,
  userData = {},
  customData = {},
}) => {
  const isConfigured = Boolean(
    measurementId &&
      apiSecret &&
      measurementId.startsWith("G-") &&
      apiSecret.trim().length > 5
  );

  // If secret is missing, run in high-fidelity simulation mode
  if (!isConfigured) {
    return {
      status: "simulated",
      message: "GA4 Measurement Protocol simulated (add GA4_MEASUREMENT_ID & GA4_API_SECRET in .env)",
      measurementId: measurementId || "G-WP77FSW2",
    };
  }

  // Convert Meta event names to GA4 standard event names
  let ga4EventName = "page_view";
  if (eventName === "ViewContent") ga4EventName = "view_item";
  if (eventName === "Lead" || eventName === "PartialLead") ga4EventName = "generate_lead";

  const clientId = visitorId || fingerprint || `srv_${Date.now()}`;

  const payload = {
    client_id: clientId,
    ...(userData.email && { user_id: hashData(userData.email) }),
    events: [
      {
        name: ga4EventName,
        params: {
          page_location: pageUrl,
          page_title: pageTitle || customData.courseTitle || "Inxyme Tech Academy",
          source: "server_side_bypassing_ad_blockers",
          ...customData,
        },
      },
    ],
  };

  const ga4Url = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`;

  await axios.post(ga4Url, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: 5000,
  });

  return {
    status: "dispatched",
  };
};

/**
 * Universal Server-Side Tracker
 * Called silently from controllers whenever:
 *  1. A visitor views a page / course (/api/visitors/track)
 *  2. A user fills in form inputs onBlur (/api/partial-leads)
 *  3. A user submits a form or exit-intent offer (/api/contacts)
 *
 * Runs 100% NON-BLOCKING (fire-and-forget) so client requests are never delayed!
 */
export const trackServerSideEvent = ({
  eventType = "PageView", // PageView, ViewContent, Lead, PartialLead
  pageUrl = "",
  pageTitle = "",
  visitorId = "",
  fingerprint = "",
  ipAddress = "",
  userAgent = "",
  userData = {}, // { name, phone, email, courseTitle }
  customData = {},
}) => {
  // Fire asynchronously in background
  setImmediate(async () => {
    try {
      const metaPixelId = process.env.META_PIXEL_ID || "1612208420573846";
      const metaAccessToken = process.env.META_CAPI_ACCESS_TOKEN || "";
      const ga4MeasurementId = process.env.GA4_MEASUREMENT_ID || "";
      const ga4ApiSecret = process.env.GA4_API_SECRET || "";

      // Determine Meta event name (Lead / PartialLead takes priority over ViewContent)
      let metaEventName = "PageView";
      if (eventType === "Lead" || eventType === "PartialLead") {
        metaEventName = "Lead";
      } else if (eventType === "ViewContent" || (pageUrl && pageUrl.includes("/courses/"))) {
        metaEventName = "ViewContent";
      }

      // 1. Dispatch to Meta CAPI
      let metaResult;
      try {
        metaResult = await sendToMetaCAPI({
          pixelId: metaPixelId,
          accessToken: metaAccessToken,
          eventName: metaEventName,
          pageUrl,
          pageTitle,
          visitorId,
          fingerprint,
          ipAddress,
          userAgent,
          userData,
          customData,
        });
      } catch (metaErr) {
        metaResult = {
          status: "failed",
          error: metaErr.response?.data?.error?.message || metaErr.message,
        };
      }

      // 2. Dispatch to GA4 Measurement Protocol
      let ga4Result;
      try {
        ga4Result = await sendToGA4MeasurementProtocol({
          measurementId: ga4MeasurementId,
          apiSecret: ga4ApiSecret,
          eventName: metaEventName,
          pageUrl,
          pageTitle,
          visitorId,
          fingerprint,
          userData,
          customData,
        });
      } catch (gaErr) {
        ga4Result = {
          status: "failed",
          error: gaErr.response?.data?.error?.message || gaErr.message,
        };
      }

      // Console notification showing ad-blocker bypass success
      const leadInfo = userData.phone || userData.email || visitorId || "Anonymous";
      console.log(
        `🛡️ [Server-Side Tracking] Bypassed Ad-Blockers -> [${metaEventName}] | Meta: ${metaResult.status.toUpperCase()} | GA4: ${ga4Result.status.toUpperCase()} | Target: ${pageUrl} | User: ${leadInfo}`
      );

      // 3. Persist audit log in MongoDB
      await ServerTrackingLog.create({
        eventType,
        eventName: metaEventName,
        pageUrl,
        pageTitle,
        visitorId,
        fingerprint,
        ipAddress,
        userAgent,
        userData: {
          name: userData.name || "",
          phone: userData.phone || "",
          email: userData.email || "",
          courseTitle: userData.courseTitle || customData.courseTitle || "",
        },
        metaCapi: {
          status: metaResult.status,
          fbtraceId: metaResult.fbtraceId || "",
          eventsReceived: metaResult.eventsReceived || 0,
          error: metaResult.error || "",
        },
        ga4MeasurementProtocol: {
          status: ga4Result.status,
          error: ga4Result.error || "",
        },
        bypassedAdBlocker: true,
      });
    } catch (err) {
      console.warn("⚠️ Server-Side Tracking background task warning:", err.message);
    }
  });
};
