import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dns from "dns";
import generateSitemap from "../utils/sitemapGenerator.js";

// Get directory name in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Set DNS servers (same as main server)
if (process.env.NODE_ENV !== "production") {
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
}

const main = async () => {
  try {
    console.log("🚀 Starting sitemap generation...");

    // Database connection
    const URI = process.env.MongoDBURI;
    let sitemap;

    if (URI) {
      try {
        console.log("📡 Connecting to database...");
        await mongoose.connect(URI, {
          serverSelectionTimeoutMS: 30000,
        });

        console.log("✅ Successfully connected to MongoDB");

        // Generate sitemap with database data
        const baseUrl = process.env.BASE_URL || "https://inxyme.com";
        console.log(`🗺️  Generating sitemap for: ${baseUrl}`);

        sitemap = await generateSitemap(baseUrl);

        // Close database connection
        await mongoose.connection.close();
        console.log("🔌 Database connection closed");
      } catch (dbError) {
        console.warn(
          "⚠️  Database connection failed, using fallback mode:",
          dbError.message,
        );

        // Generate basic sitemap without database data
        const baseUrl = process.env.BASE_URL || "https://inxyme.com";
        sitemap = await generateSitemap(baseUrl, true); // true = fallback mode

        if (mongoose.connection.readyState === 1) {
          await mongoose.connection.close();
        }
      }
    } else {
      console.warn("⚠️  MongoDBURI not found, using fallback mode");

      // Generate basic sitemap without database data
      const baseUrl = process.env.BASE_URL || "https://inxyme.com";
      sitemap = await generateSitemap(baseUrl, true); // true = fallback mode
    }

    // Save to nextclient/public and client/public directories if they exist
    const targetPaths = [
      path.join(__dirname, "../../nextclient/public/sitemap.xml"),
      path.join(__dirname, "../../client/public/sitemap.xml"),
    ];

    for (const targetPath of targetPaths) {
      const outputDir = path.dirname(targetPath);
      const appDir = path.dirname(outputDir);
      if (fs.existsSync(appDir)) {
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        fs.writeFileSync(targetPath, sitemap, "utf8");
        console.log(`📍 Saved to: ${targetPath}`);
      }
    }

    console.log(`✅ Sitemap generated successfully!`);

    // Show stats
    const urlCount = (sitemap.match(/<url>/g) || []).length;
    console.log(`📊 Total URLs in sitemap: ${urlCount}`);

    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log("🔌 Database connection closed");
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error generating sitemap:", error.message);

    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }

    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("❌ UNHANDLED REJECTION:", err);
  process.exit(1);
});

// Run the script
main();
