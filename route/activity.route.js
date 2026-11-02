import express from "express";
import {
  getAllActivities,
  getActivityById,
  createActivity,
  updateActivity,
  deleteActivity,
  getActivitySubmissions,
  gradeSubmission,
  getStudentActivities,
  submitStudentActivity,
} from "../controller/activity.controller.js";

const router = express.Router();

// Student specific routes (placed before /:id parameterized routes)
router.get("/student/my-activities", getStudentActivities);
router.post("/:id/submit", submitStudentActivity);

// Admin / General routes
router.get("/", getAllActivities);
router.post("/", createActivity);
router.get("/:id", getActivityById);
router.put("/:id", updateActivity);
router.delete("/:id", deleteActivity);

// Submissions & Grading
router.get("/:id/submissions", getActivitySubmissions);
router.post("/:id/grade-submission", gradeSubmission);

export default router;

