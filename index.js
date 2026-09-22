import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import fs from "fs";
import Category from "./model/category.model.js";
import { fileURLToPath } from "url";

// Import routes
import bookRoute from "./route/book.route.js";
import authRoute from "./route/auth.route.js";
import userRoutes from "./routes/userRoutes.js";
import profileRoute from "./route/profile.route.js";
import cartRoute from "./route/cart.route.js";
import categoryRoute from "./route/category.route.js";
import courseRoute from "./route/course.route.js";
import contactRoute from "./route/contactRoutes.js";
import enrollmentRoute from "./routes/enrollmentRoutes.js";
import faqRoute, { adminFaqRouter } from "./route/faq.route.js";
import uploadRoute from "./route/uploadRoute.js";
import authRoutes from "./route/authRoutes.js";
import adminRoutes from "./route/adminRoutes.js";
import lmsRoutes from "./route/lms.route.js";
import blogRoutes from "./route/blog.route.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import adminPaymentRoutes from "./routes/adminPaymentRoutes.js";
import pdfRoutes from "./routes/pdfRoutes.js";
import pdfRouter from "./route/pdf.route.js";
import sprintRoutes from "./routes/sprintRoutes.js";
import chatRoutes from "./route/chat.route.js";
import sessionRoutes from "./routes/sessionRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import discussionRoutes from "./routes/discussionRoutes.js";
import careerRoutes from "./routes/careerRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";
import externalContactRoutes from "./routes/externalContactRoutes.js";
import secretContactRoutes from "./routes/secretContactRoutes.js";
import candidateRoutes from "./routes/candidateRoutes.js";
import adminEmailRoutes from "./routes/adminEmailRoutes.js";
import emailRecordRoutes from "./routes/emailRecordRoutes.js";
import emailRoutes from "./route/emailRoutes.js";
import redirectRoutes from "./route/redirectRoutes.js";
import studentDocumentRoutes from "./route/studentDocumentRoutes.js";
import proposalDocumentRoutes from "./routes/proposalDocumentRoutes.js";
import testQARoutes from "./routes/testQARoutes.js";
import adminRoleRoutes from "./routes/adminRoleRoutes.js";
import sitemapRoute from "./route/sitemap.route.js";
import batchRoute from "./route/batch.route.js";
import classroomRoutes from "./routes/classroomRoutes.js";
import loginRecordRoutes from "./routes/loginRecordRoutes.js";
import mediaMentionRoutes from "./routes/mediaMentionRoutes.js";
import awardRoutes from "./routes/awardRoutes.js";
import leadRoute from "./route/lead.route.js";

import dns from "dns";
import { createServer } from "http";
import { initializeSocketServer } from "./socket/socketServer.js";
import handleRedirects from "./middleware/redirectMiddleware.js";
import { setSocketIO } from "./middleware/socketMiddleware.js";

// Only set DNS in development/local environment
if (process.env.NODE_ENV !== "production") {
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
}

// Initialize express app
const app = express();

// Trust reverse proxy headers (to correctly detect HTTPS protocol in production)
app.set("trust proxy", true);

// Get directory name in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Configure express to handle larger payloads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Increase the HTTP request timeout to 5 minutes (300000ms)
app.timeout = 300000;

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // In development or if no origin, allow all
    if (process.env.NODE_ENV !== "production" || !origin) {
      return callback(null, true);
    }

    // Check if the origin is in the allowed list
    const allowedOrigins = [
      "https://theeklavya.com",
      "https://www.theeklavya.com",
      "https://inxyme.com",
      "https://www.inxyme.com",
      "https://admin.inxyme.com",
      "https://connect.inxyme.com",
    ];

    // Allow exact matches or any subdomain of inxyme.com
    if (
      allowedOrigins.includes(origin) ||
      (origin && origin.endsWith(".inxyme.com"))
    ) {
      // console.log("CORS allowed request from origin:", origin); // Optional: Keep for debugging
      return callback(null, true);
    }

    console.warn("CORS blocked request from origin:", origin);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-auth-token",
    "x-user-agent",
    "x-client-ip",
    "Cache-Control",
    "Pragma",
    "Expires",
    "Accept",
    "Access-Control-Allow-Origin",
  ],
  exposedHeaders: [
    "Content-Length",
    "Content-Type",
    "Content-Disposition",
    "x-auth-token",
    "x-user-agent",
    "x-client-ip",
  ],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// Middleware for URL redirection from firstvite.com to inxyme.com and inxyme.com to www.inxyme.com
app.use((req, res, next) => {
  // Never redirect API routes or CORS preflight requests
  if (req.method === "OPTIONS" || req.path.startsWith("/api")) {
    return next();
  }

  const host = req.headers.host;

  // Check if the request is coming from firstvite.com (including subdomains)
  if (
    host &&
    (host.includes("firstvite.com") || host.startsWith("firstvite.com"))
  ) {
    // Always redirect to HTTPS www.inxyme.com
    const newUrl = `https://www.inxyme.com${req.originalUrl}`;

    // Perform permanent redirect (301)
    return res.redirect(301, newUrl);
  }

  // Redirect from inxyme.com to www.inxyme.com for consistency
  if (
    host &&
    (host === "inxyme.com" ||
      (host.startsWith("inxyme.com") && !host.startsWith("www.")))
  ) {
    // Always redirect to HTTPS www.inxyme.com
    const newUrl = `https://www.inxyme.com${req.originalUrl}`;

    // Perform permanent redirect (301)
    return res.redirect(301, newUrl);
  }

  next();
});

// Middleware for handling custom URL redirects from database
app.use(handleRedirects);

// Handle preflight requests - must be before other middleware
app.options("*", cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory
const publicDir = path.join(__dirname, "public");
const uploadsDir = path.join(__dirname, "public", "uploads");
const studentDocumentsDir = path.join(
  __dirname,
  "uploads",
  "student-documents",
);
const pdfsDir = path.join(publicDir, "pdfs");

// Serve static files from the client dist directory (for production)
const clientDistDir = path.join(__dirname, "..", "client", "dist");

// Ensure PDFs directory exists
if (!fs.existsSync(pdfsDir)) {
  fs.mkdirSync(pdfsDir, { recursive: true });
}

// Ensure student documents directory exists
if (!fs.existsSync(studentDocumentsDir)) {
  fs.mkdirSync(studentDocumentsDir, { recursive: true });
}

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// List all files in the public directory
const listPublicFiles = (dir) => {
  try {
    const files = fs.readdirSync(dir);
    return files;
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
    return [];
  }
};

listPublicFiles(publicDir);
listPublicFiles(uploadsDir);

// Ensure PDFs directory exists
if (!fs.existsSync(pdfsDir)) {
  fs.mkdirSync(pdfsDir, { recursive: true });
}

// Serve static files from the public directory
app.use(
  express.static(publicDir, {
    setHeaders: (res, path) => {
      res.setHeader("Cache-Control", "public, max-age=31536000");
    },
  }),
);

// Serve uploaded brochures from the public/uploaded_brochure directory
const uploadedBrochuresDir = path.join(publicDir, "uploaded_brochure");
app.use(
  "/uploaded_brochure",
  express.static(uploadedBrochuresDir, {
    setHeaders: (res, path) => {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline");
    },
  }),
);

// Serve PDF files from the public/pdfs directory
app.use(
  "/pdfs",
  express.static(pdfsDir, {
    setHeaders: (res, path) => {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'inline; filename="' + path.basename(path) + '"',
      );
    },
  }),
);

// Serve static files from the public directory
app.use(express.static(publicDir));

// Serve static files from the client dist directory (for production)
app.use(
  express.static(clientDistDir, {
    setHeaders: (res, path) => {
      // Set correct MIME types for JavaScript modules
      if (path.endsWith(".js")) {
        res.setHeader("Content-Type", "application/javascript");
      }
      res.setHeader("Cache-Control", "public, max-age=31536000");
    },
  }),
);

// Serve candidate profile images
const candidateProfileDir = path.join(publicDir, "candidate_profile");
app.use(
  "/candidate_profile",
  express.static(candidateProfileDir, {
    setHeaders: (res, path) => {
      // Set appropriate cache headers for images
      res.setHeader("Cache-Control", "public, max-age=31536000");
    },
  }),
);

// Serve uploads with specific headers
app.use(
  "/uploads",
  (req, res, next) => {
    next();
  },
  express.static(uploadsDir, {
    setHeaders: (res, filePath) => {
      const ext = path.extname(filePath).toLowerCase().substring(1);
      const mimeTypes = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        pdf: "application/pdf",
      };

      if (mimeTypes[ext]) {
        res.set("Content-Type", mimeTypes[ext]);
        res.set("Cache-Control", "public, max-age=31536000");
      }
    },
  }),
);

// Test route to check file serving
app.get("/test-upload/:filename", (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(uploadsDir, filename);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({
      success: false,
      message: "File not found",
      path: filePath,
      files: fs.readdirSync(uploadsDir),
    });
  }
});

// Database connection
const PORT = process.env.PORT || 4002;
const URI = process.env.MongoDBURI;

const connectDB = async () => {
  try {
    await mongoose.connect(URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    });

    console.log("✅ Successfully connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    if (error.name === "MongoServerError") {
      console.error("MongoDB Server Error:", error.message);
    } else if (error.name === "MongooseServerSelectionError") {
      console.error("Could not connect to MongoDB. Is it running?");
    }
    process.exit(1);
  }
};

// Connect to the database
connectDB();

// Log database connection status
mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

// Routes - Specific routes first
// console.log('Mounting upload route at /api/upload');
app.use("/api/upload", uploadRoute); // File upload routes
app.use("/api", pdfRoutes); // PDF generation routes

// Mount PDF routes at /api/pdfs
// console.log('Mounting PDF routes at /api/pdfs');
app.use("/api/pdfs", pdfRouter);

// Debug route to test if the server is running
app.get("/api/ping", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || "development",
    paths: {
      currentWorkingDir: process.cwd(),
      publicDir: publicDir,
      uploadsDir: uploadsDir,
    },
  });
});

// Test public categories endpoint
app.get("/api/test-categories", async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).limit(10);
    res.json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (err) {
    console.error("Test categories error:", err);
    res.status(500).json({
      success: false,
      message: "Error fetching test categories",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

// Mount routes in specific order
// Public routes first
app.use("/api/books", bookRoute);
app.use("/api/categories", categoryRoute);
app.use("/api/courses", courseRoute);
app.use("/api/batches", batchRoute);
app.use("/api/classroom", classroomRoutes);
app.use("/api/contacts", contactRoute);
app.use("/api/faqs", faqRoute);
app.use("/api/blog", blogRoutes);
app.use("/api/media-mentions", mediaMentionRoutes);
app.use("/api/awards", awardRoutes);
app.use("/api/leads", leadRoute);

// Auth routes
app.use("/api/auth", authRoutes);

// Protected routes (require authentication)
app.use("/api/users", userRoutes);
app.use("/api/profile", profileRoute);
app.use("/api/contact", contactRoute);
app.use("/api/enrollments", enrollmentRoute);
app.use("/api/candidates", candidateRoutes);
app.use("/api/upload", uploadRoute);
app.use("/api/admin", adminRoutes);
app.use("/api/lms", lmsRoutes);
app.use("/api/sprints", sprintRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/admin/payments", adminPaymentRoutes);
app.use("/api/admin/faqs", adminFaqRouter);
app.use("/api/v1/sprints", sprintRoutes);
app.use("/api/v1/tasks", taskRoutes);
app.use("/api/discussions", discussionRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/careers", careerRoutes);
app.use("/api/applications", applicationRoutes);

// Admin email routes
app.use("/api/v1/admin/emails", adminEmailRoutes);

// Login record routes
app.use("/api/admin", loginRecordRoutes);

// Email record routes
app.use("/api/emails", emailRecordRoutes);

// Custom email sender routes
app.use("/api/email", emailRoutes);

// Redirect management routes
app.use("/api/redirects", redirectRoutes);

// Student document routes
app.use("/api/student-documents", studentDocumentRoutes);

// Proposal document routes
app.use("/api/v1/admin", proposalDocumentRoutes);
app.use("/api/admin/test-qa", testQARoutes);
app.use("/api/test-questions", testQARoutes);
app.use("/api/admin/roles", adminRoleRoutes);

// External API Routes
app.use("/api/outcontact", externalContactRoutes);
app.use("/api/contact-data", secretContactRoutes);
app.use("/api/contacts-data", secretContactRoutes);
app.use("/api/contacts/export", secretContactRoutes);

// PDF routes
// console.log('Mounting PDF routes at /api/pdfs');
app.use("/api/pdfs", pdfRouter);

// Log all routes for debugging
const printRoutes = (routes, parentPath = "") => {
  routes.forEach((route) => {
    if (route.route) {
      const methods = Object.keys(route.route.methods).join(",").toUpperCase();
      console.log(`${methods.padEnd(6)} ${parentPath}${route.route.path}`);
    } else if (route.name === "router") {
      // This is a router instance
      const routerPath =
        route.regexp
          ?.toString()
          .replace(/^\/\^|\$\//g, "")
          .replace("\\/?", "") || "";
      if (route.handle?.stack) {
        printRoutes(route.handle.stack, `${parentPath}${routerPath}/`);
      }
    }
  });
};

// console.log('\nRegistered Routes:');
// printRoutes(app._router.stack);

// Sitemap route
app.use("/", sitemapRoute);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date() });
});

// Debug route to check routing
app.get("/debug-route", (req, res) => {
  res.json({
    path: req.path,
    headers: req.headers,
    env: process.env.NODE_ENV,
    publicDir: publicDir,
    fileExists: fs.existsSync(
      path.join(publicDir, "data-science-landing-page.html"),
    ),
    clientDistDir: clientDistDir,
    clientIndexExists: fs.existsSync(path.join(clientDistDir, "index.html")),
  });
});

// Custom HTML page route (must be before React catch-all to take precedence)
app.get("/data-science-ai-programme", (req, res) => {
  console.log("Serving custom HTML page for /data-science-ai-programme");
  res.sendFile(path.join(publicDir, "data-science-landing-page.html"));
});

// Custom HTML thank you page route
app.get("/data-science-ai-programme/thank-you", (req, res) => {
  console.log(
    "Serving custom HTML thank you page for /data-science-ai-programme/thank-you",
  );
  res.sendFile(path.join(publicDir, "data-science-thank-you.html"));
});

// Serve React app for all non-API routes (must be before error handling)
app.get("*", (req, res, next) => {
  // Skip API routes, static file routes, and custom HTML page routes
  if (
    req.path.startsWith("/api") ||
    req.path.startsWith("/uploads") ||
    req.path.startsWith("/pdfs") ||
    req.path.startsWith("/candidate_profile") ||
    req.path === "/data-science-ai-programme" ||
    req.path === "/data-science-ai-programme/thank-you"
  ) {
    return next();
  }

  // Serve the index.html from the client dist directory
  const indexPath = path.join(clientDistDir, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    next();
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  const isDev = process.env.NODE_ENV === "development";

  // Default values
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  // Handle common Mongoose/Mongo errors
  if (err.code === 11000) {
    // Duplicate key error
    statusCode = 409;
    const fields = Object.keys(err.keyValue || {});
    if (fields.includes("email")) {
      message = "Email already registered. Go to Login page";
    } else {
      message = "Duplicate value entered";
    }
  }

  if (err.name === "ValidationError") {
    statusCode = 400;
  }

  res.status(statusCode).json({
    status: String(statusCode).startsWith("4") ? "fail" : "error",
    message,
    ...(isDev ? { stack: err.stack } : {}),
  });
});

// Start the server
const httpServer = createServer(app);
const io = initializeSocketServer(httpServer);

// Set socket.io instance for use in controllers
setSocketIO(io);

const server = httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Socket.IO server initialized`);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION! Shutting down...");
  console.error(err);
  server.close(() => {
    process.exit(1);
  });
});

export default app;
