import mongoose from "mongoose";
import dotenv from "dotenv";
import Redirect from "../model/redirect.model.js";

dotenv.config();

const normalizeRedirects = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MongoDBURI);
    console.log("Connected to MongoDB");

    // Find all redirects
    const redirects = await Redirect.find({});
    console.log(`Found ${redirects.length} redirects to check`);

    let updatedCount = 0;

    for (const redirect of redirects) {
      let needsUpdate = false;
      const updates = {};

      // Normalize sourceUrl - remove domain if present
      if (redirect.sourceUrl.includes("http")) {
        const oldSourceUrl = redirect.sourceUrl;
        const newSourceUrl = redirect.sourceUrl.replace(
          /^https?:\/\/[^\/]+/,
          "",
        );
        if (newSourceUrl !== oldSourceUrl) {
          updates.sourceUrl = newSourceUrl;
          needsUpdate = true;
          console.log(`Source URL: ${oldSourceUrl} -> ${newSourceUrl}`);
        }
      }

      // Normalize targetUrl - ensure it has proper format
      if (redirect.targetUrl.includes("http")) {
        // Keep full URLs as they are (external redirects)
        const url = new URL(redirect.targetUrl);
        if (
          url.hostname === "www.inxyme.com" ||
          url.hostname === "inxyme.com"
        ) {
          // Convert internal URLs to relative paths
          const oldTargetUrl = redirect.targetUrl;
          const newTargetUrl = url.pathname + url.search;
          if (newTargetUrl !== oldTargetUrl) {
            updates.targetUrl = newTargetUrl;
            needsUpdate = true;
            console.log(`Target URL: ${oldTargetUrl} -> ${newTargetUrl}`);
          }
        }
      }

      if (needsUpdate) {
        await Redirect.findByIdAndUpdate(redirect._id, updates);
        updatedCount++;
        console.log(`Updated redirect: ${redirect._id}`);
      }
    }

    console.log(`\nNormalization complete. Updated ${updatedCount} redirects.`);
    process.exit(0);
  } catch (error) {
    console.error("Error normalizing redirects:", error);
    process.exit(1);
  }
};

normalizeRedirects();
