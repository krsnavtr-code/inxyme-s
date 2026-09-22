import express from 'express';
const router = express.Router();
import { protect } from '../middleware/auth.js';
import Application from '../model/Application.js';
import Career from '../model/Career.js';

// @route   POST /api/applications
// @desc    Apply for a job
// @access  Private (Student)
router.post('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ msg: 'Only students can apply for jobs' });
    }

    const { jobId, coverLetter } = req.body;

    // Check if job exists and is open
    const job = await Career.findOne({ 
      _id: jobId,
      status: 'Open',
      applicationDeadline: { $gt: new Date() }
    });

    if (!job) {
      return res.status(400).json({ msg: 'Job not available for application' });
    }

    // Check if already applied
    const existingApplication = await Application.findOne({
      jobId,
      studentId: req.user.id
    });

    if (existingApplication) {
      return res.status(400).json({ msg: 'Already applied to this job' });
    }

    // Create new application
    const application = new Application({
      jobId,
      studentId: req.user.id,
      coverLetter,
      status: 'applied'
    });

    await application.save();

    // Populate job details in the response
    const populatedApp = await Application.findById(application._id)
      .populate('jobId', 'title company location jobType')
      .populate('studentId', 'name email');

    res.json(populatedApp);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/applications/me
// @desc    Get current user's applications
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const applications = await Application.find({ studentId: req.user.id })
      .populate('jobId', 'title company location jobType description requirements')
      .sort('-appliedAt');

    res.json(applications);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/applications/job/:jobId
// @desc    Get all applications for a specific job
// @access  Private (Admin)
const isAuthorizedAdmin = (user) =>
  user && (user.role === 'admin' || user.role === 'employee' || Boolean(user.adminRoleId));

router.get('/job/:jobId', protect, async (req, res) => {
  try {
    if (!isAuthorizedAdmin(req.user)) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    const applications = await Application.find({ jobId: req.params.jobId })
      .populate('studentId', 'name email phone')
      .sort('-appliedAt');

    res.json(applications);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/applications/:id/status
// @desc    Update application status
// @access  Private (Admin)
router.put('/:id/status', protect, async (req, res) => {
  try {
    if (!isAuthorizedAdmin(req.user)) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    const { status, notes } = req.body;

    const application = await Application.findById(req.params.id);
    
    if (!application) {
      return res.status(404).json({ msg: 'Application not found' });
    }

    application.status = status || application.status;
    if (notes) {
      application.notes = notes;
    }
    application.updatedAt = Date.now();

    await application.save();

    res.json(application);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/applications/:id
// @desc    Delete an application
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const application = await Application.findById(req.params.id);

    if (!application) {
      return res.status(404).json({ msg: 'Application not found' });
    }

    // Check if user is authorized
    if (!isAuthorizedAdmin(req.user) && application.studentId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    await application.remove();

    res.json({ msg: 'Application removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Application not found' });
    }
    res.status(500).send('Server Error');
  }
});

export default router;
