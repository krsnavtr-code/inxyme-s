import express from "express";
import { body } from "express-validator";
import {
  createCourse,
  getAllCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
  uploadCourseImage,
  deleteUploadedFile,
  sendBrochureEmail,
  generatePdf,
  deletePdf,
  toggleCoursePublish,
  getCourseTestimonials,
  addCourseTestimonial,
  updateCourseTestimonial,
  deleteCourseTestimonial,
} from "../controller/course.controller.js";
import { isAdmin } from "../middleware/admin.js";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "../public/uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname),
    );
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for PDFs
  fileFilter: function (req, file, cb) {
    const imageFiletypes = /jpeg|jpg|png|gif/;
    const pdfFiletypes = /pdf/;
    const imageMimetype = imageFiletypes.test(file.mimetype);
    const pdfMimetype = pdfFiletypes.test(file.mimetype);
    const extname =
      imageFiletypes.test(path.extname(file.originalname).toLowerCase()) ||
      pdfFiletypes.test(path.extname(file.originalname).toLowerCase());

    if ((imageMimetype || pdfMimetype) && extname) {
      return cb(null, true);
    }
    cb(
      new Error(
        "Only image files (jpeg, jpg, png, gif) and PDF files are allowed",
      ),
    );
  },
});

const router = express.Router();

// Validation middleware
const validateCourse = [
  body("title")
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage("Title must be between 5 and 100 characters"),
  body("description")
    .trim()
    .isLength({ min: 10 })
    .withMessage("Description must be at least 10 characters"),
  body("category").isMongoId().withMessage("Invalid category ID"),
  body("instructor")
    .trim()
    .isLength({ min: 2 })
    .withMessage("Instructor name is required"),
  body("price")
    .isFloat({ min: 0 })
    .withMessage("Price must be a positive number"),
  body("duration").trim().notEmpty().withMessage("Duration is required"),
  body("level")
    .optional()
    .isIn(["Beginner", "Intermediate", "Advanced"])
    .withMessage("Invalid level"),
  body("showOnHome")
    .optional()
    .isBoolean()
    .withMessage("Show on Home must be a boolean value"),
];

// Admin routes
router.post("/", isAdmin, validateCourse, createCourse);
router.put("/:id", isAdmin, validateCourse, updateCourse);
router.delete("/delete-file", isAdmin, deleteUploadedFile);
router.delete("/:id", isAdmin, deleteCourse);
router.post(
  "/upload-image",
  isAdmin,
  upload.single("image"),
  uploadCourseImage,
);
router.post(
  "/:id/upload-image",
  isAdmin,
  upload.single("image"),
  uploadCourseImage,
);
router.post("/:id/generate-pdf", isAdmin, generatePdf);
router.delete("/:id/pdf", isAdmin, deletePdf);
router.patch("/:id/publish", isAdmin, toggleCoursePublish);

// Course Testimonials routes
router.get("/:id/testimonials", getCourseTestimonials);
router.post("/:id/testimonials", isAdmin, addCourseTestimonial);
router.put("/:id/testimonials/:testimonialId", isAdmin, updateCourseTestimonial);
router.delete("/:id/testimonials/:testimonialId", isAdmin, deleteCourseTestimonial);

// Public routes
router.get("/", getAllCourses);
router.get("/:id", getCourseById);
router.post("/send-brochure", sendBrochureEmail);

export default router;
