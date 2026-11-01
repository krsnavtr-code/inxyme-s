import express from "express";
import { body } from "express-validator";
import {
  createBatch,
  getAllBatches,
  getBatchById,
  updateBatch,
  deleteBatch,
  getBatchesByCourse,
  getBatchesByTeacher,
  getBatchesByStudent,
  updateBatchEnrollment,
  getCourseEnrolledUsers,
  assignStudentsToBatch,
} from "../controller/batch.controller.js";
import { isAdmin } from "../middleware/admin.js";

const router = express.Router();

// Validation middleware
const validateBatch = [
  body("name")
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage("Batch name must be between 3 and 100 characters"),
  body("code")
    .trim()
    .isLength({ min: 2, max: 20 })
    .withMessage("Batch code must be between 2 and 20 characters"),
  body("course").isMongoId().withMessage("Invalid course ID"),
  body("teacher").isMongoId().withMessage("Invalid teacher ID"),
  body("startDate").isISO8601().withMessage("Invalid start date"),
  body("endDate").isISO8601().withMessage("Invalid end date"),
  body("maxCapacity")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Max capacity must be at least 1"),
];

// Admin routes
router.post("/", validateBatch, createBatch);
router.put("/:id", validateBatch, updateBatch);
router.delete("/:id", deleteBatch);
router.patch("/:id/enrollment", updateBatchEnrollment);
router.post("/:id/assign-students", assignStudentsToBatch);

// Public routes
router.get("/", getAllBatches);
router.get("/course/:courseId/enrolled-users", getCourseEnrolledUsers);
router.get("/:id", getBatchById);
router.get("/course/:courseId", getBatchesByCourse);
router.get("/teacher/:teacherId", getBatchesByTeacher);
router.get("/student/:studentId", getBatchesByStudent);

export default router;
