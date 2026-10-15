import SuccessStory from "../model/successStory.model.js";
import AppError from "../utils/appError.js";
import catchAsync from "../utils/catchAsync.js";

const DEFAULT_STORIES = [
  {
    name: "Krishna Avtar",
    role: "MLOps & AI Engineer",
    company: "Cognitive Solutions",
    course: "LLMOps & Machine Learning Operations",
    category: "Career Switch",
    hike: "140% Hike",
    image: "https://www.inxyme.com/api/upload/file/Krishna-4629.png",
    content:
      "Before joining Inxyme, I had very little knowledge of Data Science and Machine Learning pipelines, and was unsure about transitioning into AI. After joining Inxyme, I gained deep practical mastery in containerized ML deployments, Docker, and real-world LLM pipelines. The step-by-step mentoring and placement assistance helped me land my dream role as an MLOps Engineer.",
    rating: 5,
    featured: true,
    batchYear: 2026,
    cardIdNumber: "INX-2026-0428",
    status: "published",
    displayOrder: 1,
  },
  {
    name: "Manika Gahloat",
    role: "SAP MM Consultant",
    company: "Accenture Partner Network",
    course: "SAP MM Materials Management",
    category: "SAP Enterprise",
    hike: "95% Hike",
    image: "https://www.inxyme.com/api/upload/file/wo-4953.png",
    content:
      "I enrolled in the SAP MM training program after a friend's recommendation. What I loved most was the live server access, real-time enterprise scenarios, and procurement lifecycle workflows. Whenever I had doubts, the certified trainer was available to guide me. It gave me tremendous confidence during client interviews.",
    rating: 5,
    featured: false,
    batchYear: 2025,
    cardIdNumber: "INX-2025-0715",
    status: "published",
    displayOrder: 2,
  },
  {
    name: "Ankit Kumar",
    role: "Generative AI Developer",
    company: "NextGen Technologies",
    course: "GenAI & Database Management Mastery",
    category: "College Graduates",
    hike: "Campus Placed",
    image: "https://www.inxyme.com/api/upload/file/Adarsh-3832.png",
    content:
      "As a final year student, I needed real project experience to stand out. The Database Management & GenAI course at Inxyme covered both core architectural principles and hands-on vector database projects. The portfolio of assignments I built directly helped me clear technical rounds and receive multiple offers before graduation.",
    rating: 5,
    featured: false,
    batchYear: 2026,
    cardIdNumber: "INX-2026-0294",
    status: "published",
    displayOrder: 3,
  },
  {
    name: "Vinay Kumar",
    role: "SAP PP Functional Consultant",
    company: "Tata Technologies Ecosystem",
    course: "SAP PP Production Planning",
    category: "SAP Enterprise",
    hike: "110% Hike",
    image: "https://www.inxyme.com/api/upload/file/dar-0262.png",
    content:
      "The SAP PP course exceeded my highest expectations. Coming from a non-SAP manufacturing background, I was initially nervous, but the mentor broke down BOM, routing, and MRP execution into intuitive concepts with live sandbox practice. The career guidance was world-class.",
    rating: 5,
    featured: false,
    batchYear: 2025,
    cardIdNumber: "INX-2025-0639",
    status: "published",
    displayOrder: 4,
  },
  {
    name: "Devendra Trivedi",
    role: "Machine Learning Engineer",
    company: "DataInsights AI",
    course: "Data Science, Analytics & Python",
    category: "Career Switch",
    hike: "125% Hike",
    image: "https://www.inxyme.com/api/upload/file/df-3710.png",
    content:
      "I was working in a non-technical support role and desperately wanted to transition into Data Science. The instructors at Inxyme explained statistical modelling and predictive algorithms from the ground up. Building my first end-to-end predictive project gave me the technical edge to switch my career path successfully.",
    rating: 5,
    featured: false,
    batchYear: 2026,
    cardIdNumber: "INX-2026-0812",
    status: "published",
    displayOrder: 5,
  },
  {
    name: "Adarsh Srivastava",
    role: "Database & Backend Engineer",
    company: "Fintech Core Corp",
    course: "MySQL & Database Architecture",
    category: "Upskilling",
    hike: "85% Hike",
    image: "https://www.inxyme.com/api/upload/file/1777960745027-1855.png",
    content:
      "I already had basic SQL understanding, but the MySQL Database Architecture course took me to an advanced level. Query optimization, index tuning, and stored procedures were taught with industrial clarity. Now I handle heavy transaction databases in production with zero hesitation.",
    rating: 5,
    featured: false,
    batchYear: 2025,
    cardIdNumber: "INX-2025-0371",
    status: "published",
    displayOrder: 6,
  },
  {
    name: "Rahul Mehta",
    role: "Full Stack Engineer",
    company: "TechNova Labs",
    course: "Full Stack MERN Architecture",
    category: "Upskilling",
    hike: "105% Hike",
    image: "https://www.inxyme.com/api/upload/file/1777960745003-1010.png",
    content:
      "The MERN Stack course helped me transition from simple frontend UI to architecting robust microservices and real-time WebSocket applications. The code reviews by senior mentors simulated a real software engineering sprint environment.",
    rating: 5,
    featured: false,
    batchYear: 2026,
    cardIdNumber: "INX-2026-0549",
    status: "published",
    displayOrder: 7,
  },
];

// Helper to auto-seed initial data if collection is completely empty
export const checkAndAutoSeed = async () => {
  try {
    const count = await SuccessStory.countDocuments();
    if (count === 0) {
      console.log("🌱 Auto-seeding initial Success Stories into MongoDB...");
      await SuccessStory.insertMany(DEFAULT_STORIES);
      console.log("✅ Seeded initial Success Stories successfully");
    }
  } catch (err) {
    console.error("Error auto-seeding success stories:", err);
  }
};

// @desc    Get all success stories (with search, category filter, status filter, sorting)
// @route   GET /api/success-stories
// @access  Public
export const getAllSuccessStories = catchAsync(async (req, res, next) => {
  // If collection is empty, seed initial data on first fetch
  const totalCount = await SuccessStory.countDocuments();
  if (totalCount === 0) {
    await checkAndAutoSeed();
  }

  const queryObj = {};

  // Status check: if not admin or status not explicitly requested, default to published
  const isAdmin = req.user && (req.user.role === "admin" || req.user.role === "employee");
  if (req.query.status) {
    queryObj.status = req.query.status;
  } else if (!isAdmin) {
    queryObj.status = "published";
  }

  // Filter by category
  if (req.query.category && req.query.category !== "All Stories") {
    queryObj.category = req.query.category;
  }

  // Filter by featured
  if (req.query.featured !== undefined) {
    queryObj.featured = req.query.featured === "true" || req.query.featured === true;
  }

  // Search filter
  if (req.query.search && req.query.search.trim()) {
    const searchRegex = new RegExp(req.query.search.trim(), "i");
    queryObj.$or = [
      { name: searchRegex },
      { role: searchRegex },
      { company: searchRegex },
      { course: searchRegex },
      { content: searchRegex },
      { cardIdNumber: searchRegex },
    ];
  }

  // Pagination
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = req.query.limit ? Math.max(1, parseInt(req.query.limit, 10)) : 100;
  const skip = (page - 1) * limit;

  // Sorting: order by displayOrder ascending, then createdAt descending
  let sortOption = { displayOrder: 1, createdAt: -1 };
  if (req.query.sort) {
    if (req.query.sort === "newest") {
      sortOption = { createdAt: -1 };
    } else if (req.query.sort === "rating") {
      sortOption = { rating: -1, createdAt: -1 };
    }
  }

  const [stories, total] = await Promise.all([
    SuccessStory.find(queryObj).sort(sortOption).skip(skip).limit(limit),
    SuccessStory.countDocuments(queryObj),
  ]);

  res.status(200).json({
    success: true,
    results: stories.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    data: {
      stories,
    },
  });
});

// @desc    Get single success story by ID
// @route   GET /api/success-stories/:id
// @access  Public / Admin
export const getSuccessStoryById = catchAsync(async (req, res, next) => {
  const story = await SuccessStory.findById(req.params.id);

  if (!story) {
    return next(new AppError("No success story found with that ID", 404));
  }

  res.status(200).json({
    success: true,
    data: {
      story,
    },
  });
});

// @desc    Create a new success story
// @route   POST /api/success-stories
// @access  Private (Admin)
export const createSuccessStory = catchAsync(async (req, res, next) => {
  const {
    name,
    role,
    company,
    course,
    category,
    image,
    hike,
    content,
    rating,
    featured,
    batchYear,
    cardIdNumber,
    status,
    displayOrder,
  } = req.body;

  // If featured is true, optionally unmark existing featured if required
  if (featured === true) {
    // Keep featured or multiple featured as desired
  }

  const newStory = await SuccessStory.create({
    name,
    role,
    company: company || "",
    course,
    category: category || "Career Switch",
    image: image || "",
    hike: hike || "",
    content,
    rating: rating !== undefined ? Number(rating) : 5,
    featured: Boolean(featured),
    batchYear: batchYear ? Number(batchYear) : 2026,
    cardIdNumber: cardIdNumber || "",
    status: status || "published",
    displayOrder: displayOrder !== undefined ? Number(displayOrder) : 0,
  });

  res.status(201).json({
    success: true,
    message: "Success story created successfully",
    data: {
      story: newStory,
    },
  });
});

// @desc    Update an existing success story
// @route   PUT /api/success-stories/:id
// @access  Private (Admin)
export const updateSuccessStory = catchAsync(async (req, res, next) => {
  const story = await SuccessStory.findById(req.params.id);

  if (!story) {
    return next(new AppError("No success story found with that ID", 404));
  }

  const allowedFields = [
    "name",
    "role",
    "company",
    "course",
    "category",
    "image",
    "hike",
    "content",
    "rating",
    "featured",
    "batchYear",
    "cardIdNumber",
    "status",
    "displayOrder",
  ];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      story[field] = req.body[field];
    }
  });

  await story.save();

  res.status(200).json({
    success: true,
    message: "Success story updated successfully",
    data: {
      story,
    },
  });
});

// @desc    Delete a success story
// @route   DELETE /api/success-stories/:id
// @access  Private (Admin)
export const deleteSuccessStory = catchAsync(async (req, res, next) => {
  const story = await SuccessStory.findByIdAndDelete(req.params.id);

  if (!story) {
    return next(new AppError("No success story found with that ID", 404));
  }

  res.status(200).json({
    success: true,
    message: "Success story deleted successfully",
    data: null,
  });
});

// @desc    Seed or reset default success stories
// @route   POST /api/success-stories/seed
// @access  Private (Admin)
export const seedDefaultSuccessStories = catchAsync(async (req, res, next) => {
  const existingCount = await SuccessStory.countDocuments();
  if (existingCount > 0 && !req.query.force) {
    return res.status(200).json({
      success: true,
      message: `Database already has ${existingCount} stories. Pass ?force=true to wipe and re-seed.`,
    });
  }

  if (req.query.force === "true") {
    await SuccessStory.deleteMany({});
  }

  const seeded = await SuccessStory.insertMany(DEFAULT_STORIES);

  res.status(201).json({
    success: true,
    message: `Seeded ${seeded.length} success stories successfully.`,
    data: {
      stories: seeded,
    },
  });
});
