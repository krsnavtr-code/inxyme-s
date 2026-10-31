import Batch from "../model/batch.model.js";
import Course from "../model/course.model.js";
import User from "../model/User.js";
import Enrollment from "../model/enrollment.model.js";
import { validationResult } from "express-validator";

// Create a new batch
export const createBatch = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const {
      name,
      code,
      course,
      teacher,
      startDate,
      endDate,
      schedule,
      maxCapacity,
      location,
      meetingLink,
      whatsappGroupLink,
      description,
      students,
    } = req.body;

    // Verify course exists
    const courseExists = await Course.findById(course);
    if (!courseExists) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Verify teacher exists and has teacher or admin role
    const teacherExists = await User.findOne({
      _id: teacher,
      role: { $in: ["teacher", "admin", "employee", "instructor"] },
    });
    if (!teacherExists) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found or invalid role",
      });
    }

    // Check if batch code already exists
    const existingBatch = await Batch.findOne({ code: code.trim().toUpperCase() });
    if (existingBatch) {
      return res.status(400).json({
        success: false,
        message: "Batch code already exists",
      });
    }

    const initialStudents = Array.isArray(students) ? students : [];

    // Create batch
    const batch = new Batch({
      name,
      code: code.trim().toUpperCase(),
      course,
      teacher,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      schedule,
      maxCapacity: maxCapacity || 30,
      students: initialStudents,
      currentEnrollment: initialStudents.length,
      location,
      meetingLink,
      whatsappGroupLink,
      description,
    });

    const savedBatch = await batch.save();

    // Update course's batches array
    await Course.findByIdAndUpdate(
      course,
      { $addToSet: { batches: savedBatch._id } },
      { new: true }
    );

    // Update teacher's assignedBatches array
    await User.findByIdAndUpdate(
      teacher,
      { $addToSet: { assignedBatches: savedBatch._id } },
      { new: true }
    );

    // Update enrolled students' enrolledBatches array & Enrollment records
    if (initialStudents.length > 0) {
      await User.updateMany(
        { _id: { $in: initialStudents } },
        { $addToSet: { enrolledBatches: savedBatch._id } }
      ).catch((err) => console.warn("Error updating user enrolledBatches:", err));

      await Enrollment.updateMany(
        { user: { $in: initialStudents }, course },
        { $set: { batch: savedBatch._id } }
      ).catch((err) => console.warn("Error updating enrollment batch:", err));
    }

    // Populate related fields
    const populatedBatch = await Batch.findById(savedBatch._id)
      .populate("course", "title _id")
      .populate("teacher", "fullname email _id")
      .populate("students", "fullname email role phone avatar");

    res.status(201).json({
      success: true,
      message: "Batch created successfully",
      data: populatedBatch,
    });
  } catch (error) {
    console.error("Error creating batch:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get all batches with optional filters
export const getAllBatches = async (req, res) => {
  try {
    const { course, teacher, status, search, limit, sort } = req.query;

    const query = {};

    if (course) {
      query.course = course;
    }

    if (teacher) {
      query.teacher = teacher;
    }

    if (status) {
      query.status = status;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search, "i");
      query.$or = [
        { name: { $regex: searchRegex } },
        { code: { $regex: searchRegex } },
      ];
    }

    let sortObj = { createdAt: -1 };
    if (sort) {
      sortObj = {};
      const sortFields = sort.split(",");
      sortFields.forEach((field) => {
        const sortOrder = field.startsWith("-") ? -1 : 1;
        const fieldName = field.replace(/^-/, "");
        sortObj[fieldName] = sortOrder;
      });
    }

    let batchesQuery = Batch.find(query)
      .populate("course", "title slug _id thumbnail image description category level duration")
      .populate("teacher", "fullname email role department _id avatar")
      .populate("students", "fullname email role phone avatar isActive")
      .sort(sortObj);

    if (limit && !isNaN(parseInt(limit))) {
      batchesQuery = batchesQuery.limit(parseInt(limit));
    }

    const batches = await batchesQuery.exec();

    res.json({
      success: true,
      data: batches,
    });
  } catch (error) {
    console.error("Error fetching batches:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Get single batch by ID
export const getBatchById = async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.id)
      .populate("course", "title description _id")
      .populate("teacher", "fullname email department _id")
      .populate("students", "fullname email role phone avatar isActive createdAt");

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    res.json({
      success: true,
      data: batch,
    });
  } catch (error) {
    console.error("Error fetching batch:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Update a batch
export const updateBatch = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const batchId = req.params.id;
    const {
      name,
      code,
      course,
      teacher,
      startDate,
      endDate,
      schedule,
      maxCapacity,
      location,
      meetingLink,
      whatsappGroupLink,
      description,
      status,
      isActive,
      students,
    } = req.body;

    const batch = await Batch.findById(batchId);
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    const oldCourseId = batch.course.toString();
    if (course && course !== oldCourseId) {
      const courseExists = await Course.findById(course);
      if (!courseExists) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }
      await Course.findByIdAndUpdate(
        oldCourseId,
        { $pull: { batches: batch._id } },
        { new: true }
      );
    }

    const oldTeacherId = batch.teacher.toString();
    if (teacher && teacher !== oldTeacherId) {
      const teacherExists = await User.findOne({
        _id: teacher,
        role: { $in: ["teacher", "admin", "employee", "instructor"] },
      });
      if (!teacherExists) {
        return res.status(404).json({
          success: false,
          message: "Teacher not found or invalid role",
        });
      }
      await User.findByIdAndUpdate(
        oldTeacherId,
        { $pull: { assignedBatches: batch._id } },
        { new: true }
      );
    }

    if (code && code.trim().toUpperCase() !== batch.code) {
      const existingBatch = await Batch.findOne({ code: code.trim().toUpperCase() });
      if (existingBatch) {
        return res.status(400).json({
          success: false,
          message: "Batch code already exists",
        });
      }
    }

    if (name) batch.name = name;
    if (code) batch.code = code.trim().toUpperCase();
    if (course) batch.course = course;
    if (teacher) batch.teacher = teacher;
    if (startDate) batch.startDate = new Date(startDate);
    if (endDate) batch.endDate = new Date(endDate);
    if (schedule !== undefined) batch.schedule = schedule;
    if (maxCapacity !== undefined) batch.maxCapacity = maxCapacity;
    if (location !== undefined) batch.location = location;
    if (meetingLink !== undefined) batch.meetingLink = meetingLink;
    if (whatsappGroupLink !== undefined) batch.whatsappGroupLink = whatsappGroupLink;
    if (description !== undefined) batch.description = description;
    if (status) batch.status = status;
    if (isActive !== undefined) batch.isActive = isActive;

    // Handle students assignment if provided
    if (students !== undefined && Array.isArray(students)) {
      const oldStudentIds = (batch.students || []).map((s) => s.toString());
      const newStudentIds = students.map((s) => s.toString());

      const removed = oldStudentIds.filter((sId) => !newStudentIds.includes(sId));
      const added = newStudentIds.filter((sId) => !oldStudentIds.includes(sId));

      if (removed.length > 0) {
        await User.updateMany(
          { _id: { $in: removed } },
          { $pull: { enrolledBatches: batch._id } }
        ).catch(() => {});

        await Enrollment.updateMany(
          { user: { $in: removed }, course: batch.course },
          { $unset: { batch: "" } }
        ).catch(() => {});
      }

      if (added.length > 0) {
        await User.updateMany(
          { _id: { $in: added } },
          { $addToSet: { enrolledBatches: batch._id } }
        ).catch(() => {});

        await Enrollment.updateMany(
          { user: { $in: added }, course: batch.course },
          { $set: { batch: batch._id } }
        ).catch(() => {});
      }

      batch.students = students;
      batch.currentEnrollment = students.length;
    }

    const updatedBatch = await batch.save();

    if (course && course !== oldCourseId) {
      await Course.findByIdAndUpdate(
        course,
        { $addToSet: { batches: updatedBatch._id } },
        { new: true }
      );
    }

    if (teacher && teacher !== oldTeacherId) {
      await User.findByIdAndUpdate(
        teacher,
        { $addToSet: { assignedBatches: updatedBatch._id } },
        { new: true }
      );
    }

    const populatedBatch = await Batch.findById(updatedBatch._id)
      .populate("course", "title _id")
      .populate("teacher", "fullname email _id")
      .populate("students", "fullname email role phone avatar");

    res.json({
      success: true,
      message: "Batch updated successfully",
      data: populatedBatch,
    });
  } catch (error) {
    console.error("Error updating batch:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Delete a batch
export const deleteBatch = async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.id);

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    // Remove from course's batches array
    await Course.findByIdAndUpdate(
      batch.course,
      { $pull: { batches: batch._id } },
      { new: true }
    );

    // Remove from teacher's assignedBatches array
    await User.findByIdAndUpdate(
      batch.teacher,
      { $pull: { assignedBatches: batch._id } },
      { new: true }
    );

    // Remove from students' enrolledBatches array
    if (batch.students && batch.students.length > 0) {
      await User.updateMany(
        { _id: { $in: batch.students } },
        { $pull: { enrolledBatches: batch._id } }
      ).catch(() => {});

      await Enrollment.updateMany(
        { batch: batch._id },
        { $unset: { batch: "" } }
      ).catch(() => {});
    }

    await Batch.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Batch deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting batch:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Get batches by course
export const getBatchesByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { status } = req.query;

    const query = { course: courseId };
    if (status) {
      query.status = status;
    }

    const batches = await Batch.find(query)
      .populate("teacher", "fullname email department _id")
      .populate("students", "fullname email role phone avatar")
      .sort({ startDate: 1 });

    res.json({
      success: true,
      data: batches,
    });
  } catch (error) {
    console.error("Error fetching batches by course:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Get batches by teacher
export const getBatchesByTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { status } = req.query;

    const query = { teacher: teacherId };
    if (status) {
      query.status = status;
    }

    const batches = await Batch.find(query)
      .populate("course", "title slug _id thumbnail image description category level duration")
      .populate("teacher", "fullname email role department _id avatar")
      .populate("students", "fullname email role phone avatar isActive")
      .sort({ startDate: 1 });

    res.json({
      success: true,
      data: batches,
    });
  } catch (error) {
    console.error("Error fetching batches by teacher:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Update batch enrollment count
export const updateBatchEnrollment = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    const batch = await Batch.findById(id);
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    if (action === "increment") {
      if (batch.currentEnrollment >= batch.maxCapacity) {
        return res.status(400).json({
          success: false,
          message: "Batch is at maximum capacity",
        });
      }
      batch.currentEnrollment += 1;
    } else if (action === "decrement") {
      if (batch.currentEnrollment > 0) {
        batch.currentEnrollment -= 1;
      }
    }

    await batch.save();

    res.json({
      success: true,
      message: "Enrollment updated successfully",
      data: batch,
    });
  } catch (error) {
    console.error("Error updating batch enrollment:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get all users (teachers and students) enrolled in a specific course for batch assignment
// @route   GET /api/batches/course/:courseId/enrolled-users
// @access  Admin/Teacher
export const getCourseEnrolledUsers = async (req, res) => {
  try {
    const { courseId } = req.params;

    // 1. Find all active enrollments for this course
    const enrollments = await Enrollment.find({
      course: courseId,
      status: { $ne: "cancelled" },
    })
      .populate("user", "fullname email role phone isActive isApproved avatar enrolledBatches")
      .populate("batch", "name code")
      .lean();

    // 2. Also find any direct users with course in enrolledCourses
    const directUsers = await User.find({
      enrolledCourses: courseId,
    })
      .select("fullname email role phone isActive isApproved avatar enrolledBatches")
      .populate("enrolledBatches", "name code course")
      .lean();

    // 3. Find existing batches for this course to see who is already assigned
    const courseBatches = await Batch.find({ course: courseId }).select("_id name code students teacher").lean();
    const studentBatchMap = new Map();
    courseBatches.forEach((b) => {
      (b.students || []).forEach((sId) => {
        studentBatchMap.set(sId.toString(), {
          _id: b._id,
          name: b.name,
          code: b.code,
        });
      });
    });

    const userMap = new Map();

    enrollments.forEach((e) => {
      if (e.user && e.user._id) {
        const uId = e.user._id.toString();
        const assignedBatch = studentBatchMap.get(uId) || (e.batch ? { _id: e.batch._id, name: e.batch.name, code: e.batch.code } : null);
        userMap.set(uId, {
          ...e.user,
          assignedBatch,
          enrollmentStatus: e.status || "active",
        });
      }
    });

    directUsers.forEach((u) => {
      const uId = u._id.toString();
      if (!userMap.has(uId)) {
        const assignedBatch = studentBatchMap.get(uId) || null;
        userMap.set(uId, {
          ...u,
          assignedBatch,
          enrollmentStatus: "active",
        });
      }
    });

    // 4. Fetch all active faculty members (teachers and admins)
    const allFaculty = await User.find({
      role: { $in: ["teacher", "admin"] },
      isActive: true,
    })
      .select("fullname email role phone department avatar assignedBatches")
      .populate("assignedBatches", "name code course")
      .lean();

    const facultyWithEnrollmentInfo = allFaculty.map((t) => {
      const isEnrolledInCourse = userMap.has(t._id.toString());
      return {
        ...t,
        isEnrolledInCourse,
      };
    });

    const allUsersArray = Array.from(userMap.values());
    const enrolledStudents = allUsersArray.filter((u) => u.role === "student");
    const enrolledTeachers = allUsersArray.filter((u) => u.role === "teacher" || u.role === "admin");

    res.json({
      success: true,
      courseId,
      totalEnrolledUsers: allUsersArray.length,
      enrolledStudents,
      enrolledTeachers,
      allFaculty: facultyWithEnrollmentInfo,
    });
  } catch (error) {
    console.error("Error fetching course enrolled users:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Assign or replace students in a batch
// @route   POST /api/batches/:id/assign-students
// @access  Admin
export const assignStudentsToBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const { studentIds } = req.body;

    if (!Array.isArray(studentIds)) {
      return res.status(400).json({
        success: false,
        message: "studentIds must be an array of user IDs",
      });
    }

    const batch = await Batch.findById(id);
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    const oldStudentIds = (batch.students || []).map((s) => s.toString());
    const newStudentIds = studentIds.map((s) => s.toString());

    const removed = oldStudentIds.filter((sId) => !newStudentIds.includes(sId));
    const added = newStudentIds.filter((sId) => !oldStudentIds.includes(sId));

    if (removed.length > 0) {
      await User.updateMany(
        { _id: { $in: removed } },
        { $pull: { enrolledBatches: batch._id } }
      ).catch(() => {});

      await Enrollment.updateMany(
        { user: { $in: removed }, course: batch.course },
        { $unset: { batch: "" } }
      ).catch(() => {});
    }

    if (added.length > 0) {
      await User.updateMany(
        { _id: { $in: added } },
        { $addToSet: { enrolledBatches: batch._id } }
      ).catch(() => {});

      await Enrollment.updateMany(
        { user: { $in: added }, course: batch.course },
        { $set: { batch: batch._id } }
      ).catch(() => {});
    }

    batch.students = studentIds;
    batch.currentEnrollment = studentIds.length;
    await batch.save();

    const populatedBatch = await Batch.findById(batch._id)
      .populate("course", "title _id")
      .populate("teacher", "fullname email _id")
      .populate("students", "fullname email role phone avatar");

    res.json({
      success: true,
      message: "Batch students updated successfully",
      data: populatedBatch,
    });
  } catch (error) {
    console.error("Error assigning students to batch:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
