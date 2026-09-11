import { getRedirectBySource } from "../controller/redirectController.js";

// Generate all possible candidate URLs for robust, domain/protocol-agnostic matching
const getRedirectCandidates = (path, host, protocol) => {
  const candidates = [path];

  // Normalise clean path
  const cleanPath = path.split("?")[0];
  if (cleanPath !== path && !candidates.includes(cleanPath)) {
    candidates.push(cleanPath);
  }

  // Add current host candidates (both http and https to handle proxy protocol mismatches)
  if (host) {
    candidates.push(`http://${host}${path}`);
    candidates.push(`https://${host}${path}`);
    if (cleanPath !== path) {
      candidates.push(`http://${host}${cleanPath}`);
      candidates.push(`https://${host}${cleanPath}`);
    }

    // Add www variants if host doesn't have it
    if (!host.startsWith("www.")) {
      candidates.push(`http://www.${host}${path}`);
      candidates.push(`https://www.${host}${path}`);
      if (cleanPath !== path) {
        candidates.push(`http://www.${host}${cleanPath}`);
        candidates.push(`https://www.${host}${cleanPath}`);
      }
    } else {
      // Add non-www variants if host has it
      const nonWwwHost = host.substring(4);
      candidates.push(`http://${nonWwwHost}${path}`);
      candidates.push(`https://${nonWwwHost}${path}`);
      if (cleanPath !== path) {
        candidates.push(`http://${nonWwwHost}${cleanPath}`);
        candidates.push(`https://${nonWwwHost}${cleanPath}`);
      }
    }
  }

  // Add production domain candidates (very important for dev/staging and absolute redirects in DB)
  const prodHosts = ["www.inxyme.com", "inxyme.com"];
  prodHosts.forEach((prodHost) => {
    candidates.push(`http://${prodHost}${path}`);
    candidates.push(`https://${prodHost}${path}`);
    if (cleanPath !== path) {
      candidates.push(`http://${prodHost}${cleanPath}`);
      candidates.push(`https://${prodHost}${cleanPath}`);
    }
  });

  // De-duplicate
  return [...new Set(candidates)];
};

const handleRedirects = async (req, res, next) => {
  try {
    const path = req.path; // Get the path without query string

    // 1. PERFORMANCE OPTIMIZATION: Fast path for API requests and static assets
    // Skip checking database for API routes
    if (path.startsWith("/api")) {
      return next();
    }

    // Skip checking database for custom landing pages
    if (path === "/data-science-ai-programme") {
      return next();
    }

    // Skip checking database for common static directories
    if (
      path.startsWith("/uploads") ||
      path.startsWith("/pdfs") ||
      path.startsWith("/candidate_profile") ||
      path.startsWith("/uploaded_brochure")
    ) {
      return next();
    }

    // Skip checking database for static files (extensions)
    const staticExtensionRegex =
      /\.(js|css|png|jpe?g|gif|svg|ico|webp|json|xml|txt|pdf|woff2?|ttf|eot|map)$/i;
    if (staticExtensionRegex.test(path)) {
      return next();
    }

    const host = req.headers.host || "";
    const protocol = req.protocol || "http";

    // 2. PERFORMANCE OPTIMIZATION: Query all potential source URLs in ONE database call (Domain & Protocol-agnostic)
    const candidates = getRedirectCandidates(path, host, protocol);

    // Query all possible candidate URLs in a single database round-trip
    const redirect = await getRedirectBySource(candidates);

    if (redirect) {
      // Perform the redirect
      return res.redirect(redirect.statusCode, redirect.targetUrl);
    }

    // No redirect found, continue to next middleware
    next();
  } catch (error) {
    // If there's an error, just continue to avoid breaking the app
    console.error("Redirect middleware error:", error);
    next();
  }
};

export default handleRedirects;
