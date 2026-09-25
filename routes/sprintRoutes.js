import express from 'express';
import { 
  createSprint, 
  getSprintsByCourse, 
  getMySprints,
  getSprint, 
  updateSprint, 
  deleteSprint,
  getAllSprints
} from '../controller/sprintController.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

// Protect all routes after this middleware
router.use(protect);

// Student & Admin route: get sprints for current user's enrolled courses
router.route('/my-sprints')
  .get(getMySprints);

// Admin-only routes
router.route('/')
  .get(admin, getAllSprints)
  .post(admin, createSprint);

router.route('/:id')
  .get(admin, getSprint)
  .patch(admin, updateSprint)
  .delete(admin, deleteSprint);

// Allow both students and admins to access sprints for a course
router.route('/course/:courseId')
  .get(getSprintsByCourse);

export default router;
