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

// @route   GET api/careers/student/my-referrals
// @desc    Get job referrals and career opportunities for student
// @access  Public / Student
router.get('/student/my-referrals', async (req, res) => {
  try {
    const userId = req.query.userId || req.user?.id;
    const email = req.query.email?.toLowerCase();

    let student = null;
    if (userId) {
      const User = (await import('../model/User.js')).default;
      student = await User.findById(userId);
    } else if (email) {
      const User = (await import('../model/User.js')).default;
      student = await User.findOne({ email });
    }

    const studentIdStr = student ? String(student._id) : String(userId || '');

    // 1) Find jobs where student is explicitly referred / assigned
    const assignedCareers = await Career.find({
      $or: [
        { assignedStudents: studentIdStr },
        { 'studentReferrals.student': studentIdStr }
      ]
    })
      .populate('courseId', 'title description')
      .populate('assignedBatches', 'name code schedule')
      .populate('assignedStudents', 'fullname name email phone')
      .populate('studentReferrals.student', 'fullname name email')
      .populate('studentReferrals.batch', 'name code')
      .populate('postedBy', 'fullname name')
      .sort({ updatedAt: -1 })
      .lean();

    // Map each assigned career to include the student's specific referral info
    const referredJobs = assignedCareers.map((c) => {
      const specificReferral = c.studentReferrals?.find(
        (sr) => String(sr.student?._id || sr.student) === studentIdStr
      );
      return {
        ...c,
        referralStatus: specificReferral?.status || 'Referred',
        referredAt: specificReferral?.referredAt || c.updatedAt,
        referralNotes: specificReferral?.notes || 'Directly recommended by Inxyme Academic & Placement Cell',
        interviewDate: specificReferral?.interviewDate || null,
        batchName: specificReferral?.batch?.name || c.assignedBatches?.[0]?.name || null,
      };
    });

    // 2) Find all open opportunities (either matching student's enrolled courses or general open)
    const userCourseIds = student?.enrolledCourses || [];
    const openQuery = {
      status: 'Open',
      _id: { $nin: assignedCareers.map((c) => c._id) }
    };
    if (userCourseIds.length > 0) {
      openQuery.courseId = { $in: userCourseIds };
    }

    const otherOpenJobs = await Career.find(openQuery)
      .populate('courseId', 'title description')
      .populate('postedBy', 'fullname name')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({
      success: true,
      referredJobs,
      otherOpenJobs,
      stats: {
        totalReferred: referredJobs.length,
        shortlistedCount: referredJobs.filter((j) => j.referralStatus === 'Shortlisted').length,
        interviewCount: referredJobs.filter((j) => j.referralStatus === 'Interview Scheduled').length,
        selectedCount: referredJobs.filter((j) => j.referralStatus === 'Offer Received').length,
      }
    });
  } catch (err) {
    console.error('Error fetching student referrals:', err);
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  }
});

// @route   GET api/careers
// @desc    Get all job postings
// @access  Public
router.get('/', async (req, res) => {
  try {
    const careers = await Career.find()
      .populate('courseId', 'title description')
      .populate('assignedBatches', 'name code')
      .populate('assignedStudents', 'fullname name email phone')
      .populate('studentReferrals.student', 'fullname name email phone')
      .populate('studentReferrals.batch', 'name code')
      .populate('postedBy', 'fullname name');
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
// @desc    Assign / Refer students from a batch to job
// @access  Private (Admin)
router.put('/assign/:id', protect, async (req, res) => {
  try {
    if (!isAuthorizedAdmin(req.user)) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    const rawStudentIds = req.body.studentIds || req.body.studentId;
    const studentIds = Array.isArray(rawStudentIds) ? rawStudentIds : rawStudentIds ? [rawStudentIds] : [];
    const batchId = req.body.batchId || null;
    const status = req.body.status || 'Referred';
    const notes = req.body.notes || 'Recommended via Inxyme Placement Drive';

    let career = await Career.findById(req.params.id);

    if (!career) {
      return res.status(404).json({ msg: 'Job not found' });
    }

    // Initialize arrays if undefined
    career.assignedStudents = career.assignedStudents || [];
    career.assignedBatches = career.assignedBatches || [];
    career.studentReferrals = career.studentReferrals || [];

    // Add batch to assignedBatches if not present
    if (batchId && !career.assignedBatches.map(b => String(b)).includes(String(batchId))) {
      career.assignedBatches.push(batchId);
    }

    // Process each student
    studentIds.forEach((sid) => {
      const sIdStr = String(sid);
      if (!career.assignedStudents.map(s => String(s)).includes(sIdStr)) {
        career.assignedStudents.push(sid);
      }

      // Find or create in studentReferrals
      const existingRefIdx = career.studentReferrals.findIndex(
        (sr) => String(sr.student?._id || sr.student) === sIdStr
      );

      if (existingRefIdx >= 0) {
        career.studentReferrals[existingRefIdx].status = status;
        career.studentReferrals[existingRefIdx].notes = notes;
        if (batchId) career.studentReferrals[existingRefIdx].batch = batchId;
      } else {
        career.studentReferrals.push({
          student: sid,
          batch: batchId || undefined,
          status,
          notes,
          referredAt: new Date()
        });
      }
    });

    await career.save();

    const updatedCareer = await Career.findById(career._id)
      .populate('courseId', 'title description')
      .populate('assignedBatches', 'name code')
      .populate('assignedStudents', 'fullname name email phone')
      .populate('studentReferrals.student', 'fullname name email phone')
      .populate('studentReferrals.batch', 'name code');

    res.json(updatedCareer);
  } catch (err) {
    console.error('Error assigning students to job:', err);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/careers/:id/apply
// @desc    Student applies or confirms referral for a job
// @access  Public / Student
router.post('/:id/apply', async (req, res) => {
  try {
    const studentId = req.body.userId || req.user?.id;
    const { resumeUrl, notes } = req.body;

    if (!studentId) {
      return res.status(400).json({ success: false, message: 'Student ID required' });
    }

    const career = await Career.findById(req.params.id);
    if (!career) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    career.assignedStudents = career.assignedStudents || [];
    career.studentReferrals = career.studentReferrals || [];

    const sIdStr = String(studentId);
    if (!career.assignedStudents.map(s => String(s)).includes(sIdStr)) {
      career.assignedStudents.push(studentId);
    }

    const existingRefIdx = career.studentReferrals.findIndex(
      (sr) => String(sr.student?._id || sr.student) === sIdStr
    );

    if (existingRefIdx >= 0) {
      career.studentReferrals[existingRefIdx].status = 'Applied';
      career.studentReferrals[existingRefIdx].notes = notes || career.studentReferrals[existingRefIdx].notes;
    } else {
      career.studentReferrals.push({
        student: studentId,
        status: 'Applied',
        notes: notes || 'Direct student application submitted',
        referredAt: new Date()
      });
    }

    await career.save();

    res.json({
      success: true,
      message: 'Application recorded successfully! Inxyme placement cell will review your profile.'
    });
  } catch (err) {
    console.error('Error applying to job:', err);
    res.status(500).json({ success: false, message: 'Server error applying to job' });
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
