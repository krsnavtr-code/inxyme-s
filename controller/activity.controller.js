import Activity from "../model/Activity.js";
import User from "../model/User.js";
import Batch from "../model/batch.model.js";
import Enrollment from "../model/enrollment.model.js";

// @desc    Get all activities (Admin)
// @route   GET /api/activities
// @access  Private/Admin
export const getAllActivities = async (req, res) => {
  try {
    const { courseId, status } = req.query;
    const filter = {};

    if (courseId) {
      filter.course = courseId;
    }
    if (status) {
      filter.status = status;
    }

    const activities = await Activity.find(filter)
      .populate("course", "title description image thumbnail")
      .populate("batch", "name code")
      .populate("createdBy", "fullname name email")
      .sort({ createdAt: -1 })
      .lean();

    const formatted = activities.map((act) => ({
      ...act,
      totalQuestions: act.questions?.length || 0,
      totalSubmissions: act.submissions?.length || 0,
    }));

    res.json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (error) {
    console.error("Error fetching activities:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching activities",
      error: error.message,
    });
  }
};

// @desc    Get single activity by ID
// @route   GET /api/activities/:id
// @access  Public / Authenticated
export const getActivityById = async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id)
      .populate("course", "title description")
      .populate("batch", "name code")
      .populate("submissions.student", "fullname name email phone avatar")
      .populate("createdBy", "fullname name email");

    if (!activity) {
      return res.status(404).json({
        success: false,
        message: "Activity not found",
      });
    }

    res.json({
      success: true,
      data: activity,
    });
  } catch (error) {
    console.error("Error fetching activity:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Create a new course activity with 1-3 questions
// @route   POST /api/activities
// @access  Private/Admin
export const createActivity = async (req, res) => {
  try {
    const { title, description, course, batch, deadline, status, questions } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Activity title is required",
      });
    }

    if (!course) {
      return res.status(400).json({
        success: false,
        message: "Target course is required",
      });
    }

    if (!Array.isArray(questions) || questions.length < 1 || questions.length > 3) {
      return res.status(400).json({
        success: false,
        message: "An activity must contain between 1 and 3 questions",
      });
    }

    // Validate that each question has text
    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].questionText || !questions[i].questionText.trim()) {
        return res.status(400).json({
          success: false,
          message: `Question ${i + 1} cannot have empty text`,
        });
      }
    }

    const newActivity = new Activity({
      title: title.trim(),
      description: description ? description.trim() : "",
      course,
      batch: batch || undefined,
      deadline: deadline || undefined,
      status: status || "Published",
      questions: questions.map((q) => ({
        questionText: q.questionText.trim(),
        maxMarks: q.maxMarks || 10,
        hint: q.hint || "",
      })),
      createdBy: req.user?.id || req.body.createdBy,
    });

    const saved = await newActivity.save();

    const populated = await Activity.findById(saved._id)
      .populate("course", "title description")
      .populate("batch", "name code")
      .populate("createdBy", "fullname name email");

    res.status(201).json({
      success: true,
      message: "Activity created successfully",
      data: populated,
    });
  } catch (error) {
    console.error("Error creating activity:", error);
    res.status(500).json({
      success: false,
      message: "Server error creating activity",
      error: error.message,
    });
  }
};

// @desc    Update an activity
// @route   PUT /api/activities/:id
// @access  Private/Admin
export const updateActivity = async (req, res) => {
  try {
    const { title, description, course, batch, deadline, status, questions } = req.body;

    const activity = await Activity.findById(req.params.id);
    if (!activity) {
      return res.status(404).json({
        success: false,
        message: "Activity not found",
      });
    }

    if (questions) {
      if (!Array.isArray(questions) || questions.length < 1 || questions.length > 3) {
        return res.status(400).json({
          success: false,
          message: "An activity must contain between 1 and 3 questions",
        });
      }

      for (let i = 0; i < questions.length; i++) {
        if (!questions[i].questionText || !questions[i].questionText.trim()) {
          return res.status(400).json({
            success: false,
            message: `Question ${i + 1} cannot have empty text`,
          });
        }
      }
      activity.questions = questions.map((q) => ({
        questionText: q.questionText.trim(),
        maxMarks: q.maxMarks || 10,
        hint: q.hint || "",
      }));
    }

    if (title) activity.title = title.trim();
    if (description !== undefined) activity.description = description.trim();
    if (course) activity.course = course;
    if (batch !== undefined) activity.batch = batch || undefined;
    if (deadline !== undefined) activity.deadline = deadline || undefined;
    if (status) activity.status = status;

    await activity.save();

    const updated = await Activity.findById(activity._id)
      .populate("course", "title description")
      .populate("batch", "name code")
      .populate("createdBy", "fullname name email");

    res.json({
      success: true,
      message: "Activity updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Error updating activity:", error);
    res.status(500).json({
      success: false,
      message: "Server error updating activity",
      error: error.message,
    });
  }
};

// @desc    Delete an activity
// @route   DELETE /api/activities/:id
// @access  Private/Admin
export const deleteActivity = async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) {
      return res.status(404).json({
        success: false,
        message: "Activity not found",
      });
    }

    await activity.deleteOne();

    res.json({
      success: true,
      message: "Activity removed successfully",
    });
  } catch (error) {
    console.error("Error deleting activity:", error);
    res.status(500).json({
      success: false,
      message: "Server error deleting activity",
      error: error.message,
    });
  }
};

// @desc    Get submissions for an activity (Admin)
// @route   GET /api/activities/:id/submissions
// @access  Private/Admin
export const getActivitySubmissions = async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id)
      .populate("course", "title")
      .populate("submissions.student", "fullname name email phone avatar");

    if (!activity) {
      return res.status(404).json({
        success: false,
        message: "Activity not found",
      });
    }

    res.json({
      success: true,
      activityTitle: activity.title,
      course: activity.course,
      questions: activity.questions,
      submissions: activity.submissions || [],
    });
  } catch (error) {
    console.error("Error fetching activity submissions:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching submissions",
      error: error.message,
    });
  }
};

// @desc    Grade or give feedback on a submission
// @route   POST /api/activities/:id/grade-submission
// @access  Private/Admin
export const gradeSubmission = async (req, res) => {
  try {
    const { submissionId, marksObtained, feedback, status = "Graded" } = req.body;

    const activity = await Activity.findById(req.params.id);
    if (!activity) {
      return res.status(404).json({
        success: false,
        message: "Activity not found",
      });
    }

    const sub = activity.submissions.id(submissionId);
    if (!sub) {
      return res.status(404).json({
        success: false,
        message: "Submission not found",
      });
    }

    if (marksObtained !== undefined) sub.marksObtained = marksObtained;
    if (feedback !== undefined) sub.feedback = feedback;
    sub.status = status;

    await activity.save();

    res.json({
      success: true,
      message: "Submission evaluated successfully",
      data: sub,
    });
  } catch (error) {
    console.error("Error grading submission:", error);
    res.status(500).json({
      success: false,
      message: "Server error evaluating submission",
      error: error.message,
    });
  }
};

// @desc    Get activities for enrolled student
// @route   GET /api/activities/student/my-activities
// @access  Public / Student
export const getStudentActivities = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId;
    const email = req.query.email?.toLowerCase();

    let student = null;
    if (userId) {
      student = await User.findById(userId);
    } else if (email) {
      student = await User.findOne({ email });
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student account not found",
      });
    }

    const studentIdStr = String(student._id);

    // 1. Gather all course IDs student is enrolled in
    const enrolledCourseIds = new Set(
      (student.enrolledCourses || []).map((c) => String(c?._id || c))
    );

    // 2. Also check batches where student is a member
    const studentBatches = await Batch.find({
      students: student._id,
    })
      .select("course _id name code")
      .lean();

    studentBatches.forEach((b) => {
      if (b.course) enrolledCourseIds.add(String(b.course?._id || b.course));
    });

    // 3. Also check active enrollments
    const enrollments = await Enrollment.find({
      user: student._id,
      status: { $ne: "cancelled" },
    })
      .select("course")
      .lean();

    enrollments.forEach((e) => {
      if (e.course) enrolledCourseIds.add(String(e.course?._id || e.course));
    });

    const courseIdArray = Array.from(enrolledCourseIds);

    // 4. Query published activities for these courses
    let activityQuery = { status: "Published" };
    if (courseIdArray.length > 0) {
      activityQuery.course = { $in: courseIdArray };
    }

    const activities = await Activity.find(activityQuery)
      .populate("course", "title description image thumbnail")
      .populate("batch", "name code")
      .sort({ createdAt: -1 })
      .lean();

    // Map each activity and attach student's personal submission
    const formatted = activities.map((act) => {
      const mySubmission = (act.submissions || []).find(
        (s) => String(s.student?._id || s.student) === studentIdStr
      );

      return {
        _id: act._id,
        title: act.title,
        description: act.description,
        course: act.course,
        batch: act.batch,
        activityType: act.activityType || "Quiz",
        questions: act.questions,
        deadline: act.deadline,
        status: act.status,
        createdAt: act.createdAt,
        hasSubmitted: Boolean(mySubmission),
        submission: mySubmission
          ? {
              _id: mySubmission._id,
              answers: mySubmission.answers,
              submittedAt: mySubmission.submittedAt,
              status: mySubmission.status,
              marksObtained: mySubmission.marksObtained,
              feedback: mySubmission.feedback,
            }
          : null,
      };
    });

    const totalCount = formatted.length;
    const completedCount = formatted.filter((a) => a.hasSubmitted).length;
    const pendingCount = totalCount - completedCount;

    res.json({
      success: true,
      activities: formatted,
      stats: {
        total: totalCount,
        completed: completedCount,
        pending: pendingCount,
      },
    });
  } catch (error) {
    console.error("Error fetching student activities:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching activities for student",
      error: error.message,
    });
  }
};

// @desc    Student submits an activity quiz with text answers
// @route   POST /api/activities/:id/submit
// @access  Public / Student
export const submitStudentActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.body.userId;
    const email = req.body.email?.toLowerCase();
    const { answers } = req.body;

    let student = null;
    if (userId) {
      student = await User.findById(userId);
    } else if (email) {
      student = await User.findOne({ email });
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student account not found",
      });
    }

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide answers to the questions",
      });
    }

    const activity = await Activity.findById(id);
    if (!activity) {
      return res.status(404).json({
        success: false,
        message: "Activity not found",
      });
    }

    const studentIdStr = String(student._id);

    // Format submitted answers
    const formattedAnswers = answers.map((ans, idx) => ({
      questionIndex: ans.questionIndex !== undefined ? ans.questionIndex : idx,
      questionText: ans.questionText || activity.questions?.[idx]?.questionText || `Question ${idx + 1}`,
      studentAnswer: (ans.studentAnswer || ans.answer || "").trim(),
    }));

    // Check if student has already submitted
    const existingIndex = (activity.submissions || []).findIndex(
      (s) => String(s.student?._id || s.student) === studentIdStr
    );

    if (existingIndex >= 0) {
      // Update existing submission
      activity.submissions[existingIndex].answers = formattedAnswers;
      activity.submissions[existingIndex].submittedAt = new Date();
      activity.submissions[existingIndex].status = "Submitted";
    } else {
      // Create new submission
      activity.submissions.push({
        student: student._id,
        answers: formattedAnswers,
        submittedAt: new Date(),
        status: "Submitted",
      });
    }

    await activity.save();

    res.json({
      success: true,
      message: "Quiz activity submitted successfully!",
      answersCount: formattedAnswers.length,
    });
  } catch (error) {
    console.error("Error submitting activity quiz:", error);
    res.status(500).json({
      success: false,
      message: "Server error submitting activity",
      error: error.message,
    });
  }
};

