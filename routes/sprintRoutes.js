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
import Sprint from '../model/Sprint.js';

const router = express.Router();

// LMS Public route to get course sprints, sessions, and tasks
router.get('/lms/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;
    const sprints = await Sprint.find({ courseId, isActive: true })
      .sort('order startDate')
      .select('-__v')
      .populate({
        path: 'sessions',
        options: { sort: { order: 1 } },
        populate: {
          path: 'tasks',
          select: 'title description type dueDate points status',
        },
      })
      .lean();

    res.status(200).json({
      success: true,
      data: { sprints },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

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
