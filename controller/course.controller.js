import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Course from "../model/course.model.js";
import Contact from "../model/Contact.js";
import Category from "../model/category.model.js";
import { validationResult } from "express-validator";
import { generateCoursePdf } from "../utils/pdfGenerator.js";
import { updateSitemapAsync } from "../utils/sitemapUpdater.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to clean array fields
const cleanArrayField = (field, defaultVal = []) => {
  if (!field) return defaultVal;
  if (Array.isArray(field)) {
    const cleaned = field.filter(
      (item) => item && item.toString().trim() !== "",
    );
    return cleaned.length > 0 ? cleaned : defaultVal;
  }
  if (typeof field === "string") {
    const items = field
      .split("\n")
      .map((item) => item.trim())
      .filter((item) => item !== "");
    return items.length > 0 ? items : defaultVal;
  }
  return defaultVal;
};

// Helper function to clean and format course data
const prepareCourseData = (data) => {
  // Clean array fields
  const arrayFields = [
    "benefits",
    "skills",
    "mentors",
    "curriculum",
    "faqs",
    "whatYouWillLearn",
    "requirements",
    "whoIsThisFor",
    "tags",
    "prerequisites",
  ];

  // Create a clean copy of the data
  const cleanData = { ...data };

  // Process array fields
  arrayFields.forEach((field) => {
    if (data[field] === undefined || data[field] === null) {
      // Set default empty array if field is not provided or null
      cleanData[field] = [];
      return;
    }

    if (field === "benefits") {
      cleanData[field] = cleanArrayField(data[field], [
        "No benefits specified",
      ]);
    } else if (
      field === "skills" ||
      field === "prerequisites" ||
      field === "whatYouWillLearn" ||
      field === "requirements" ||
      field === "whoIsThisFor" ||
      field === "tags"
    ) {
      // Handle string arrays
      if (Array.isArray(data[field])) {
        cleanData[field] = data[field]
          .filter((item) => item !== null && item !== undefined)
          .map((item) => item.toString().trim())
          .filter((item) => item !== "");
      } else if (typeof data[field] === "string") {
        cleanData[field] = data[field]
          .split("\n")
          .map((item) => item.trim())
          .filter((item) => item !== "");
      } else {
        cleanData[field] = [];
      }
    } else if (Array.isArray(data[field])) {
      cleanData[field] = data[field].filter(
        (item) =>
          item !== null && item !== undefined && item.toString().trim() !== "",
      );
    } else {
      cleanData[field] = [];
    }
  });

  // Handle totalHours specifically
  cleanData.totalHours = Math.max(0, Number(data.totalHours) || 0);

  // Process curriculum
  if (Array.isArray(data.curriculum)) {
    cleanData.curriculum = data.curriculum
      .filter((week) => week && (week.title || week.week))
      .map((week, index) => ({
        week: Number(week.week) || index + 1,
        title: week.title?.toString().trim() || `Week ${index + 1}`,
        description: week.description?.toString().trim() || "",
        duration: week.duration?.toString().trim() || "0 min",
        topics: cleanArrayField(week.topics, []),
      }));
  } else {
    cleanData.curriculum = [
      {
        week: 1,
        title: "Introduction",
        description: "",
        duration: "0 min",
        topics: ["Course introduction"],
      },
    ];
  }

  // Process other fields with defaults
  const price = Math.max(0, Number(data.price) || 0);
  const isFree = data.isFree !== undefined ? Boolean(data.isFree) : price === 0;

  const result = {
    title: data.title?.toString().trim() || "Untitled Course",
    shortDescription: data.shortDescription?.toString().trim() || "",
    description: data.description?.toString().trim() || "",
    category: data.category?.toString().trim() || null,
    instructor: data.instructor?.toString().trim() || "Unknown Instructor",
    price: isFree ? 0 : price,
    originalPrice: isFree
      ? 0
      : Math.max(0, Number(data.originalPrice) || price),
    isFree: isFree,
    totalHours: cleanData.totalHours, // Already processed above
    image: data.image?.toString().trim() || "",
    thumbnail:
      data.thumbnail?.toString().trim() || data.image?.toString().trim() || "",
    previewVideo: data.previewVideo?.toString().trim() || "",
    duration: data.duration?.toString().trim() || "0 min",
    level: ["Beginner", "Intermediate", "Advanced"].includes(data.level)
      ? data.level
      : "Beginner",
    language: data.language?.toString().trim() || "English",
    metaTitle:
      data.metaTitle?.toString().trim() || data.title?.toString().trim() || "",
    metaDescription:
      data.metaDescription?.toString().trim() ||
      data.shortDescription?.toString().trim() ||
      "",
    metaKeywords: data.metaKeywords?.toString().trim() || "",
    slug: data.slug?.toString().trim() || "",
    certificateIncluded: data.certificateIncluded !== false, // default to true
    isFeatured: Boolean(data.isFeatured),
    isPublished: Boolean(data.isPublished),
    status: ["draft", "published", "archived"].includes(data.status)
      ? data.status
      : "draft",
    // Add all array fields
    benefits: cleanData.benefits || [],
    skills: cleanData.skills || [],
    mentors: cleanData.mentors || [],
    curriculum: cleanData.curriculum || [],
    faqs: cleanData.faqs || [],
    whatYouWillLearn: cleanData.whatYouWillLearn || [],
    requirements: cleanData.requirements || [],
    whoIsThisFor: cleanData.whoIsThisFor || [],
    tags: cleanData.tags || [],
    prerequisites: cleanData.prerequisites || [],
  };

  return result;
};

// Create a new course
export const createCourse = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error("Validation errors:", errors.array());
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    // Prepare and clean the course data
    const courseData = prepareCourseData(req.body);

    // Create course with all fields
    const course = new Course({
      ...courseData,
      totalStudents: 0,
      averageRating: 0,
      totalReviews: 0,
    });

    try {
      // Save the course
      const savedCourse = await course.save();

      // Populate the category field before sending the response
      const populatedCourse = await savedCourse.populate(
        "category",
        "name _id",
      );

      // Auto-update sitemap when course is created
      updateSitemapAsync();

      return res.status(201).json({
        success: true,
        message: "Course created successfully",
        data: populatedCourse.toObject(),
      });
    } catch (error) {
      console.error("Error saving course:", error);

      // Handle duplicate key error
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        return res.status(400).json({
          success: false,
          message: `A course with this ${field} already exists`,
        });
      }

      // Handle validation errors
      if (error.name === "ValidationError") {
        const messages = Object.values(error.errors).map((val) => val.message);
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: messages,
        });
      }

      throw error; // Re-throw to be caught by the outer catch
    }
  } catch (error) {
    console.error("Error in createCourse:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get all courses with optional filters
export const getAllCourses = async (req, res) => {
  try {
    const {
      category,
      status,
      fields,
      all,
      search,
      showOnHome,
      limit,
      sort,
      isPublished,
      price,
    } = req.query;

    const query = {};

    const isAdmin =
      req.user &&
      (req.user.role === "admin" ||
        req.user.role === "employee" ||
        Boolean(req.user.adminRoleId));

    // Handle category filtering and restrict non-admin to active categories only
    if (all !== "true" && !isAdmin) {
      const activeCategories = await Category.find({ isActive: true })
        .select("_id")
        .lean();
      const activeCategoryIds = activeCategories.map((c) => c._id);

      if (category) {
        if (
          activeCategoryIds.some((id) => id.toString() === category.toString())
        ) {
          query.category = category;
        } else {
          query.category = null;
        }
      } else {
        query.category = { $in: activeCategoryIds };
      }
    } else if (category) {
      query.category = category;
    }

    // Add price filter if provided
    if (price !== undefined) {
      query.price = Number(price);
    }

    // Handle search query
    if (search && search.trim()) {
      const searchRegex = new RegExp(search, "i");
      query.$or = [
        { title: { $regex: searchRegex } },
        { description: { $regex: searchRegex } },
        { instructor: { $regex: searchRegex } },
        { "category.name": { $regex: searchRegex } },
      ];
    }

    // Handle published and draft status filtering
    if (status === "published") {
      query.isPublished = true;
      query.status = { $ne: "draft" };
    } else if (status === "draft") {
      query.$or = [{ isPublished: false }, { status: "draft" }];
    } else if (isPublished === "true") {
      query.isPublished = true;
      query.status = { $ne: "draft" };
    } else if (isPublished === "false") {
      query.$or = [{ isPublished: false }, { status: "draft" }];
    } else if (all !== "true" && !isAdmin) {
      // For non-admin users, only show published courses by default
      query.isPublished = true;
      query.status = { $ne: "draft" };
    }

    // Handle showOnHome filter
    if (showOnHome === "true") {
      query.showOnHome = true;
    } else if (showOnHome === "false") {
      query.showOnHome = false;
    }

    // Build the selection fields
    let selection = fields ? fields.split(",").join(" ") : "";

    // Build the sort object
    let sortObj = { createdAt: -1 }; // Default sort
    if (sort) {
      sortObj = {};
      const sortFields = sort.split(",");
      sortFields.forEach((field) => {
        const sortOrder = field.startsWith("-") ? -1 : 1;
        const fieldName = field.replace(/^-/, "");
        sortObj[fieldName] = sortOrder;
      });
    }

    // Execute the query with filters and selection
    let coursesQuery = Course.find(query)
      .populate("category", "name")
      .sort(sortObj);

    // Apply field selection if specified
    if (selection) {
      coursesQuery = coursesQuery.select(selection);
    }

    // Apply limit if specified
    if (limit && !isNaN(parseInt(limit))) {
      coursesQuery = coursesQuery.limit(parseInt(limit));
    }

    const courses = await coursesQuery.exec();
    res.json(courses);
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get single course by ID or slug
export const getCourseById = async (req, res) => {
  try {
    const { id } = req.params;
    const { fields } = req.query;

    // Build the query condition
    const condition = /^[0-9a-fA-F]{24}$/.test(id)
      ? { $or: [{ _id: id }, { slug: id }] }
      : { slug: id };

    // Start building the query
    let query = Course.findOne(condition);

    // Select fields if specified, otherwise include all fields
    if (fields) {
      const fieldsArray = fields.split(",").map((field) => field.trim());
      // Always include _id field
      if (!fieldsArray.includes("_id")) {
        fieldsArray.push("_id");
      }
      query = query.select(fieldsArray.join(" "));
    }

    // Always include these fields if not already included
    const requiredFields = [
      "title",
      "description",
      "shortDescription",
      "category",
      "instructor",
      "price",
      "originalPrice",
      "thumbnail",
      "duration",
      "level",
      "benefits",
      "whatYouWillLearn",
      "requirements",
      "whoIsThisFor",
      "curriculum",
      "isFeatured",
      "isPublished",
      "slug",
      "tags",
      "faqs",
      "certificateIncluded",
      "metaTitle",
      "metaDescription",
      "metaKeywords",
      "previewVideo",
      "image",
      "brochureUrl",
      "brochureGeneratedAt",
    ];

    // Add required fields to the select if they're not already included
    if (fields) {
      const includedFields = fields.split(",").map((f) => f.trim());
      const missingFields = requiredFields.filter(
        (f) => !includedFields.includes(f) && f !== "_id",
      );
      if (missingFields.length > 0) {
        query = query.select(missingFields.join(" "));
      }
    }

    // Populate necessary fields
    query = query.populate("category", "name _id");

    const course = await query.lean().exec();

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Ensure all arrays exist and have at least one empty string if empty
    const ensureArray = (arr) =>
      Array.isArray(arr) && arr.length > 0 ? arr : [""];

    const processedCourse = {
      ...course,
      benefits: ensureArray(course.benefits),
      whatYouWillLearn: ensureArray(course.whatYouWillLearn),
      requirements: ensureArray(course.requirements),
      whoIsThisFor: ensureArray(course.whoIsThisFor),
      tags: course.tags || [],
      faqs: course.faqs || [],
      curriculum: course.curriculum?.length
        ? course.curriculum
        : [
            {
              week: 1,
              title: "Introduction",
              description: "",
              duration: "0 min",
              topics: [""],
            },
          ],
    };

    res.json({
      success: true,
      data: processedCourse,
    });
  } catch (error) {
    console.error("Error fetching course:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Update a course
export const updateCourse = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error("Validation errors:", errors.array());
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const courseId = req.params.id;

    // Helper function to clean array fields
    const cleanArrayField = (field) => {
      if (!field) return [];
      if (Array.isArray(field)) {
        return field.filter((item) => item && item.toString().trim() !== "");
      }
      if (typeof field === "string") {
        return field
          .split("\n")
          .map((item) => item.trim())
          .filter((item) => item !== "");
      }
      return [];
    };

    // Extract and clean all fields
    const {
      title,
      shortDescription = "",
      description = "",
      category,
      instructor,
      price = 0,
      originalPrice = 0,
      isFree = false,
      totalHours = 0,
      duration = "",
      level = "Beginner",
      benefits,
      skills,
      curriculum,
      faqs = [],
      language = "English",
      whatYouWillLearn,
      prerequisites,
      requirements,
      whoIsThisFor,
      certificateIncluded = true,
      isFeatured = false,
      isPublished = false,
      showOnHome = false,
      status = "draft",
      image = "",
      thumbnail = "",
      previewVideo = "",
      brochureUrl = "",
      metaTitle = "",
      metaDescription = "",
      metaKeywords = "",
      slug = "",
      tags = [],
    } = req.body;

    // Prepare update data with proper cleaning
    const updateData = {
      title: title?.toString()?.trim() || "Untitled Course",
      shortDescription: shortDescription?.toString()?.trim() || "",
      description: description?.toString()?.trim() || "",
      category: category?.toString()?.trim() || null,
      instructor: instructor?.toString()?.trim() || null,
      price: isFree ? 0 : Math.max(0, Number(price) || 0),
      originalPrice: isFree ? 0 : Math.max(0, Number(originalPrice) || 0),
      isFree: Boolean(isFree),
      totalHours: Math.max(0, Number(totalHours) || 0),
      duration: duration?.toString()?.trim() || "0 min",
      level: ["Beginner", "Intermediate", "Advanced"].includes(level)
        ? level
        : "Beginner",
      benefits: cleanArrayField(benefits),
      skills: cleanArrayField(skills),
      requirements: cleanArrayField(requirements),
      whoIsThisFor: cleanArrayField(whoIsThisFor),
      whatYouWillLearn: cleanArrayField(whatYouWillLearn),
      prerequisites: cleanArrayField(prerequisites),
      certificateIncluded: certificateIncluded !== false, // default to true
      isFeatured: Boolean(isFeatured),
      isPublished: Boolean(isPublished),
      showOnHome: Boolean(showOnHome),
      status: ["draft", "published", "archived"].includes(status)
        ? status
        : "draft",
      image: image?.toString()?.trim() || "",
      thumbnail: thumbnail?.toString()?.trim() || "",
      previewVideo: previewVideo?.toString()?.trim() || "",
      brochureUrl: brochureUrl?.toString()?.trim() || "",
      metaTitle: metaTitle?.toString()?.trim() || "",
      metaDescription: metaDescription?.toString()?.trim() || "",
      metaKeywords: metaKeywords?.toString()?.trim() || "",
      slug: slug?.toString()?.trim() || "",
      tags: Array.isArray(tags)
        ? tags.map((tag) => tag?.toString()?.trim()).filter(Boolean)
        : [],
      faqs: Array.isArray(faqs)
        ? faqs
            .filter(
              (faq) =>
                faq && typeof faq === "object" && faq.question && faq.answer,
            )
            .map((faq) => ({
              question: faq.question.toString().trim(),
              answer: faq.answer.toString().trim(),
            }))
        : [],
      curriculum: Array.isArray(curriculum)
        ? curriculum.map((week, index) => ({
            week: Math.max(1, Number(week.week) || index + 1),
            title: week.title?.toString()?.trim() || `Week ${index + 1}`,
            description: week.description?.toString()?.trim() || "",
            duration: week.duration?.toString()?.trim() || "0 min",
            topics: Array.isArray(week.topics)
              ? week.topics
                  .map((topic) => topic?.toString()?.trim())
                  .filter(Boolean)
              : [],
          }))
        : [],
    };

    // Find and update the course
    const course = await Course.findById(courseId);
    if (!course) {
      console.error(`Course not found: ${courseId}`);
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Update each field individually to trigger any pre-save hooks
    Object.keys(updateData).forEach((key) => {
      course[key] = updateData[key];
    });

    // Save the updated course
    const updatedCourse = await course.save();

    // Populate the category for the response
    await updatedCourse.populate("category", "name _id");

    // Auto-update sitemap when course is updated
    updateSitemapAsync();

    res.json({
      success: true,
      message: "Course updated successfully",
      data: updatedCourse.toObject(),
    });
  } catch (error) {
    console.error("Error updating course:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Upload course image
export const uploadCourseImage = async (req, res) => {
  try {
    if (!req.file) {
      console.error("No file in request");
      return res.status(400).json({
        success: false,
        message: "No file was uploaded",
      });
    }

    // Construct the URL to the uploaded file
    const fileUrl = `/uploads/${req.file.filename}`;
    const fullUrl = `${req.protocol}://${req.get("host")}${fileUrl}`;

    res.status(200).json({
      success: true,
      message: "Image uploaded successfully",
      location: fileUrl,
      fullUrl: fullUrl,
    });
  } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).json({
      success: false,
      message: "Error uploading image",
      error: error.message,
    });
  }
};

// Delete uploaded file
export const deleteUploadedFile = async (req, res) => {
  try {
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: "File path is required",
      });
    }

    // Extract filename from the path
    const filename = filePath.split("/").pop();
    const fullPath = path.join(__dirname, "../public/uploads", filename);

    // Check if file exists
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      // console.log("File deleted successfully:", fullPath);
    }

    res.status(200).json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting file",
      error: error.message,
    });
  }
};

// Send brochure email
export const sendBrochureEmail = async (req, res) => {
  try {
    const { name, email, phone, courseId, courseTitle } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and phone are required",
      });
    }

    // Get course details to fetch brochure URL
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    if (!course.brochureUrl) {
      // Save user details to Contact model for follow-up
      await Contact.create({
        name,
        email,
        phone,
        courseId,
        courseTitle,
        subject: "Brochure Request",
        message: `User requested brochure for ${courseTitle} but brochure is not available.`,
        status: "new",
      });

      return res.status(200).json({
        success: true,
        message: "You will receive brochure mail shortly",
        brochureAvailable: false,
      });
    }

    // Import email utility
    const { sendEmail } = await import("../utils/email.js");

    // Get the full path to the brochure file
    const filename = course.brochureUrl.split("/").pop();
    const brochurePath = path.join(__dirname, "../public/uploads", filename);

    // Check if file exists
    if (!fs.existsSync(brochurePath)) {
      // Save user details to Contact model for follow-up since file doesn't exist
      await Contact.create({
        name,
        email,
        phone,
        courseId,
        courseTitle,
        subject: "Brochure Request",
        message: `User requested brochure for ${courseTitle} but brochure file not found.`,
        status: "new",
      });

      return res.status(200).json({
        success: true,
        message: "You will receive brochure mail shortly",
        brochureAvailable: false,
      });
    }

    // Email content
    const subject = `Brochure for ${courseTitle}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Course Brochure</h2>
        <p>Dear ${name},</p>
        <p>Thank you for your interest in <strong>${courseTitle}</strong>.</p>
        <p>Please find the course brochure attached to this email.</p>
        <p>If you have any questions, feel free to contact us.</p>
        <p>Best regards,<br>Inxyme Team</p>
      </div>
    `;

    // Send email with attachment
    await sendEmail({
      to: email,
      subject: subject,
      html: html,
      attachments: [
        {
          filename: `${courseTitle.replace(/\s+/g, "_")}_brochure.pdf`,
          path: brochurePath,
        },
      ],
    });

    res.status(200).json({
      success: true,
      message: "Brochure sent successfully",
      brochureAvailable: true,
    });
  } catch (error) {
    console.error("Error sending brochure email:", error);
    res.status(500).json({
      success: false,
      message: "Error sending brochure",
      error: error.message,
    });
  }
};

// Toggle course publish status
export const toggleCoursePublish = async (req, res) => {
  try {
    const { id } = req.params;
    const { isPublished } = req.body;

    const course = await Course.findById(id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Update the publish status
    course.isPublished = isPublished;
    await course.save();

    // Auto-update sitemap when course is published/unpublished
    updateSitemapAsync();

    res.json({
      success: true,
      message: `Course ${isPublished ? "published" : "unpublished"} successfully`,
      data: {
        _id: course._id,
        isPublished: course.isPublished,
      },
    });
  } catch (error) {
    console.error("Error toggling course publish status:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Delete a course
export const deleteCourse = async (req, res) => {
  try {
    const course = await Course.findByIdAndDelete(req.params.id);

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Auto-update sitemap when course is deleted
    updateSitemapAsync();

    res.json({ message: "Course deleted successfully" });
  } catch (error) {
    console.error("Error deleting course:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Generate PDF for a course
export const generatePdf = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Generate the PDF
    const pdfInfo = await generateCoursePdf(course);

    // Update the course with the brochure URL
    course.brochureUrl = pdfInfo.fileUrl;
    course.brochureGeneratedAt = new Date();
    await course.save();

    res.status(200).json({
      success: true,
      message: "PDF generated successfully",
      fileUrl: pdfInfo.fileUrl,
      filename: pdfInfo.filename,
      brochureUrl: pdfInfo.fileUrl,
    });
  } catch (error) {
    console.error("Error in generatePdf:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to generate PDF",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Delete PDF for a course
export const deletePdf = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Get the PDF path from the URL in the request body
    if (!req.body.fileUrl) {
      return res.status(400).json({
        success: false,
        message: "PDF URL is required",
      });
    }

    // Extract the filename from the URL and create the full path
    const filename = path.basename(req.body.fileUrl);
    const filePath = path.join(__dirname, "..", "public", "pdfs", filename);

    // Check if file exists and delete it
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return res.status(200).json({
        success: true,
        message: "PDF deleted successfully",
      });
    }

    return res.status(404).json({
      success: false,
      message: "PDF file not found",
    });
  } catch (error) {
    console.error("Error in deletePdf:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete PDF",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
