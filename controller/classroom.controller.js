import asyncHandler from "express-async-handler";
import ClassroomSession from "../model/classroomSession.model.js";
import Batch from "../model/batch.model.js";
import User from "../model/User.js";
import Course from "../model/course.model.js";
import crypto from "crypto";

// Helper function to generate unique invite code
const generateInviteCode = () => {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
};

// @desc    Create a new classroom session
// @route   POST /api/classroom/sessions
// @access  Private (Teacher/Admin)
export const createClassroomSession = asyncHandler(async (req, res) => {
  const { batchId, teacherId, startTime, duration } = req.body;

  // Verify batch exists
  const batch = await Batch.findById(batchId).populate("course");
  if (!batch) {
    return res.status(404).json({
      success: false,
      message: "Batch not found",
    });
  }

  // Verify teacher exists and has teacher role
  const teacher = await User.findOne({ _id: teacherId, role: "teacher" });
  if (!teacher) {
    return res.status(404).json({
      success: false,
      message: "Teacher not found or invalid role",
    });
  }

  // Check if batch's teacher matches the provided teacher
  if (batch.teacher.toString() !== teacherId) {
    return res.status(400).json({
      success: false,
      message: "Teacher is not assigned to this batch",
    });
  }

  // Calculate end time
  const endTime = new Date(new Date(startTime).getTime() + duration * 60000);

  // Generate unique invite code
  let inviteCode;
  let isUnique = false;
  while (!isUnique) {
    inviteCode = generateInviteCode();
    const existing = await ClassroomSession.findOne({ inviteCode });
    if (!existing) {
      isUnique = true;
    }
  }

  // Create classroom session
  const session = await ClassroomSession.create({
    batch: batchId,
    teacher: teacherId,
    inviteCode,
    startTime,
    endTime,
    duration,
    status: "scheduled",
  });

  // Add session to batch's classroomSessions array
  await Batch.findByIdAndUpdate(
    batchId,
    { $addToSet: { classroomSessions: session._id } },
    { new: true },
  );

  // Populate related fields
  const populatedSession = await ClassroomSession.findById(session._id)
    .populate("batch", "name code")
    .populate("teacher", "fullname email")
    .populate("participants.user", "fullname email");

  res.status(201).json({
    success: true,
    message: "Classroom session created successfully",
    data: populatedSession,
  });
});

// @desc    Get classroom sessions for a batch
// @route   GET /api/classroom/sessions/batch/:batchId
// @access  Private
export const getBatchClassroomSessions = asyncHandler(async (req, res) => {
  const { batchId } = req.params;

  const sessions = await ClassroomSession.find({ batch: batchId })
    .populate("batch", "name code")
    .populate("teacher", "fullname email")
    .populate("participants.user", "fullname email")
    .sort("-startTime");

  res.json({
    success: true,
    data: sessions,
  });
});

// @desc    Get a specific classroom session
// @route   GET /api/classroom/sessions/:sessionId
// @access  Private
export const getClassroomSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const session = await ClassroomSession.findById(sessionId)
    .populate("batch", "name code course")
    .populate("teacher", "fullname email")
    .populate("participants.user", "fullname email")
    .populate("chatMessages.sender", "fullname email");

  if (!session) {
    return res.status(404).json({
      success: false,
      message: "Classroom session not found",
    });
  }

  res.json({
    success: true,
    data: session,
  });
});

// @desc    Start a classroom session (teacher or admin)
// @route   POST /api/classroom/sessions/:sessionId/start
// @access  Private (Teacher, Admin)
export const startClassroomSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const session = await ClassroomSession.findById(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      message: "Classroom session not found",
    });
  }

  // Verify user is the teacher or admin/employee
  const isTeacherOrAdmin =
    session.teacher.toString() === req.user._id.toString() ||
    req.user.role === "admin" ||
    req.user.role === "employee" ||
    Boolean(req.user.adminRoleId);

  if (!isTeacherOrAdmin) {
    return res.status(403).json({
      success: false,
      message: "Only the teacher or admin can start this session",
    });
  }

  // Update session status to live
  session.status = "live";
  session.startTime = new Date();
  await session.save();

  const populatedSession = await ClassroomSession.findById(sessionId)
    .populate("batch", "name code")
    .populate("teacher", "fullname email");

  res.json({
    success: true,
    message: "Classroom session started",
    data: populatedSession,
  });
});

// @desc    End a classroom session (teacher or admin)
// @route   POST /api/classroom/sessions/:sessionId/end
// @access  Private (Teacher, Admin)
export const endClassroomSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const session = await ClassroomSession.findById(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      message: "Classroom session not found",
    });
  }

  // Verify user is the teacher or admin/employee
  const canEnd =
    session.teacher.toString() === req.user._id.toString() ||
    req.user.role === "admin" ||
    req.user.role === "employee" ||
    Boolean(req.user.adminRoleId);

  if (!canEnd) {
    return res.status(403).json({
      success: false,
      message: "Only the teacher or admin can end this session",
    });
  }

  // Update session status to ended
  session.status = "ended";
  session.endTime = new Date();

  // Calculate actual duration
  if (session.startTime) {
    const durationMs = session.endTime - session.startTime;
    session.duration = Math.round(durationMs / 60000); // Convert to minutes
  }

  await session.save();

  const populatedSession = await ClassroomSession.findById(sessionId)
    .populate("batch", "name code")
    .populate("teacher", "fullname email");

  res.json({
    success: true,
    message: "Classroom session ended",
    data: populatedSession,
  });
});

// @desc    Join a classroom session
// @route   POST /api/classroom/sessions/:sessionId/join
// @access  Private
export const joinClassroomSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user._id;

  const session = await ClassroomSession.findById(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      message: "Classroom session not found",
    });
  }

  // Check if session is live or scheduled
  if (session.status === "ended" || session.status === "cancelled") {
    return res.status(400).json({
      success: false,
      message: "Cannot join a session that has ended or been cancelled",
    });
  }

  // Check if user is already a participant
  const existingParticipant = session.participants.find(
    (p) => p.user.toString() === userId.toString(),
  );

  if (existingParticipant) {
    // Update join time if they left and are rejoining
    if (existingParticipant.leftAt) {
      existingParticipant.joinedAt = new Date();
      existingParticipant.leftAt = undefined;
    }
  } else {
    // Add new participant
    session.participants.push({
      user: userId,
      joinedAt: new Date(),
    });
  }

  await session.save();

  const populatedSession = await ClassroomSession.findById(sessionId)
    .populate("batch", "name code")
    .populate("teacher", "fullname email")
    .populate("participants.user", "fullname email");

  res.json({
    success: true,
    message: "Joined classroom session successfully",
    data: populatedSession,
  });
});

// @desc    Leave a classroom session
// @route   POST /api/classroom/sessions/:sessionId/leave
// @access  Private
export const leaveClassroomSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user._id;

  const session = await ClassroomSession.findById(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      message: "Classroom session not found",
    });
  }

  // Find participant
  const participant = session.participants.find(
    (p) => p.user.toString() === userId.toString(),
  );

  if (participant) {
    participant.leftAt = new Date();

    // Calculate duration
    if (participant.joinedAt) {
      const durationMs = participant.leftAt - participant.joinedAt;
      participant.duration = Math.round(durationMs / 60000); // Convert to minutes
    }

    await session.save();
  }

  res.json({
    success: true,
    message: "Left classroom session successfully",
  });
});

// @desc    Get active classroom session for a batch
// @route   GET /api/classroom/sessions/batch/:batchId/active
// @access  Private
export const getActiveClassroomSession = asyncHandler(async (req, res) => {
  const { batchId } = req.params;

  const session = await ClassroomSession.findOne({
    batch: batchId,
    status: "live",
  })
    .populate("batch", "name code course")
    .populate("teacher", "fullname email")
    .populate("participants.user", "fullname email");

  if (!session) {
    return res.status(404).json({
      success: false,
      message: "No active classroom session found for this batch",
    });
  }

  res.json({
    success: true,
    data: session,
  });
});

// @desc    Add chat message to session
// @route   POST /api/classroom/sessions/:sessionId/chat
// @access  Private
export const addChatMessage = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { message } = req.body;
  const userId = req.user._id;

  const session = await ClassroomSession.findById(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      message: "Classroom session not found",
    });
  }

  session.chatMessages.push({
    sender: userId,
    message,
    timestamp: new Date(),
  });

  await session.save();

  const populatedMessage = await ClassroomSession.findById(sessionId)
    .populate("chatMessages.sender", "fullname email")
    .then((s) => s.chatMessages[s.chatMessages.length - 1]);

  res.json({
    success: true,
    data: populatedMessage,
  });
});

// @desc    Delete a classroom session (admin only)
// @route   DELETE /api/classroom/sessions/:sessionId
// @access  Private/Admin
export const deleteClassroomSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const session = await ClassroomSession.findById(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      message: "Classroom session not found",
    });
  }

  // Remove session from batch's classroomSessions array
  await Batch.findByIdAndUpdate(
    session.batch,
    { $pull: { classroomSessions: sessionId } },
    { new: true },
  );

  await ClassroomSession.findByIdAndDelete(sessionId);

  res.json({
    success: true,
    message: "Classroom session deleted successfully",
  });
});

// @desc    Join classroom session by invite code
// @route   POST /api/classroom/join/:inviteCode
// @access  Private
export const joinClassroomByInviteCode = asyncHandler(async (req, res) => {
  const { inviteCode } = req.params;
  const userId = req.user._id;

  const session = await ClassroomSession.findOne({ inviteCode })
    .populate("batch", "name code")
    .populate("teacher", "fullname email")
    .populate("participants.user", "fullname email");

  if (!session) {
    return res.status(404).json({
      success: false,
      message: "Invalid invite code or session not found",
    });
  }

  // Check if session is scheduled or live
  if (session.status === "ended" || session.status === "cancelled") {
    return res.status(400).json({
      success: false,
      message: "This session has already ended or was cancelled",
    });
  }

  // Check if user is already a participant
  const existingParticipant = session.participants.find(
    (p) => p.user._id.toString() === userId.toString(),
  );

  if (!existingParticipant) {
    // Add user as participant
    session.participants.push({
      user: userId,
      joinedAt: new Date(),
    });
    await session.save();
  }

  res.json({
    success: true,
    message: "Joined classroom successfully",
    data: session,
  });
});
