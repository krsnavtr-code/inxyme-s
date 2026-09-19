import dns from "dns";
import mongoose from "mongoose";
import generateSitemap from "./sitemapGenerator.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set DNS servers for database connection
if (process.env.NODE_ENV !== "production") {
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
}

/**
 * Updates the sitemap file automatically
 * This function connects to database, generates sitemap, and saves it
 */
export const updateSitemap = async () => {
  try {
    console.log("🔄 Auto-updating sitemap...");

    // Check if database is connected
    if (mongoose.connection.readyState !== 1) {
      console.warn("⚠️  Database not connected, skipping sitemap update");
      return false;
    }

    // Generate sitemap using existing connection
    const baseUrl = process.env.BASE_URL || "https://www.inxyme.com";
    const sitemap = await generateSitemap(baseUrl);

    // Save to nextclient/public and client/public directories if they exist
    const targetPaths = [
      path.join(__dirname, "../../nextclient/public/sitemap.xml"),
      path.join(__dirname, "../../client/public/sitemap.xml"),
    ];

    for (const outputPath of targetPaths) {
      const outputDir = path.dirname(outputPath);
      const appDir = path.dirname(outputDir);
      if (fs.existsSync(appDir)) {
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        fs.writeFileSync(outputPath, sitemap, "utf8");
      }
    }

    // Show stats
    const urlCount = (sitemap.match(/<url>/g) || []).length;
    console.log(
      `✅ Sitemap auto-updated successfully! Total URLs: ${urlCount}`,
    );

    return true;
  } catch (error) {
    console.error("❌ Error auto-updating sitemap:", error.message);

    return false;
  }
};

/**
 * Async sitemap update (non-blocking)
 * Use this when you don't want to wait for sitemap update to complete
 */
export const updateSitemapAsync = () => {
  // Run asynchronously with delay to avoid connection conflicts
  setTimeout(() => {
    updateSitemap();
  }, 1000); // 1 second delay
};
