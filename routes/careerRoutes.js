import express from 'express';
const router = express.Router();
import { protect, authorize } from '../middleware/auth.js';
import Career from '../model/Career.js';

const isAuthorizedAdmin = (user) =>
  user && (user.role === 'admin' || user.role === 'employee' || Boolean(user.adminRoleId));

// @route   POST api/careers
// @desc    Create a new job posting
// @access  Private (Admin)
router.post('/', protect, authorize('admin'), async (req, res) => {
  try {
    if (!isAuthorizedAdmin(req.user)) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    const newCareer = new Career({
      ...req.body,
      postedBy: req.user.id
    });

    const career = await newCareer.save();
    res.json(career);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/careers
// @desc    Get all job postings
// @access  Public
router.get('/', async (req, res) => {
  try {
    const careers = await Career.find()
      .populate('courseId', 'title')
      .populate('assignedStudents', 'name email')
      .populate('postedBy', 'name');
    res.json(careers);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/careers/course/:courseId
// @desc    Get jobs by course
// @access  Public
router.get('/course/:courseId', async (req, res) => {
  try {
    const careers = await Career.find({ 
      courseId: req.params.courseId,
      status: 'Open'
    })
    .populate('courseId', 'title')
    .populate('postedBy', 'name');
    
    res.json(careers);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/careers/:id
// @desc    Get job by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const career = await Career.findById(req.params.id)
      .populate('courseId', 'title')
      .populate('assignedStudents', 'name email')
      .populate('postedBy', 'name');
    
    if (!career) {
      return res.status(404).json({ msg: 'Job not found' });
    }
    
    res.json(career);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Job not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/careers/:id
// @desc    Update a job posting
// @access  Private (Admin)
router.put('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    if (!isAuthorizedAdmin(req.user)) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    let career = await Career.findById(req.params.id);

    if (!career) {
      return res.status(404).json({ msg: 'Job not found' });
    }

    career = await Career.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );

    res.json(career);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/careers/assign/:id
// @desc    Assign student to job
// @access  Private (Admin)
router.put('/assign/:id', protect, async (req, res) => {
  try {
    if (!isAuthorizedAdmin(req.user)) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    const { studentId } = req.body;
    
    let career = await Career.findById(req.params.id);

    if (!career) {
      return res.status(404).json({ msg: 'Job not found' });
    }

    // Check if student is already assigned
    if (career.assignedStudents.includes(studentId)) {
      return res.status(400).json({ msg: 'Student already assigned to this job' });
    }

    career.assignedStudents.push(studentId);
    await career.save();

    res.json(career);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/careers/:id
// @desc    Delete a job posting
// @access  Private (Admin)
router.delete('/:id', protect, async (req, res) => {
  try {
    if (!isAuthorizedAdmin(req.user)) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    const career = await Career.findById(req.params.id);

    if (!career) {
      return res.status(404).json({ msg: 'Job not found' });
    }

    await career.remove();

    res.json({ msg: 'Job removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Job not found' });
    }
    res.status(500).send('Server Error');
  }
});

export default router;
