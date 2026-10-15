import NewsEvent from "../model/newsEvent.model.js";
import AppError from "../utils/appError.js";
import catchAsync from "../utils/catchAsync.js";

const DEFAULT_EVENTS = [
  {
    type: "masterclass",
    category: "upcoming",
    title: "Enterprise SAP S/4HANA & Cloud ERP: Architecture, Implementation & Career Roadmap",
    description:
      "A structured 90-minute technical masterclass exploring SAP S/4HANA migration pathways, real-time universal ledger configurations, and core career tracks in SAP FICO, MM, and SD.",
    fullContent:
      "Modern enterprises are transitioning their core business operations to SAP S/4HANA. In this intensive live session led by Inxyme's SAP Enterprise Faculty, learners and working professionals will gain clear visibility into:\n\n• S/4HANA architectural advantages over ECC 6.0.\n• Integration points across Finance (FICO) and Supply Chain (MM/SD).\n• In-demand functional vs. technical consultant competencies.\n• Practical roadmap to clearing SAP global certifications and consulting interviews.",
    date: "2026-10-18",
    time: "06:30 PM - 08:00 PM IST",
    location: "Live Interactive Session via Inxyme Live Portal",
    mode: "Live Interactive Webinar",
    organizerName: "Inxyme Enterprise Advisory Panel",
    organizerDivision: "SAP Center of Excellence",
    tag: "SAP ERP",
    featured: true,
    registrationOpen: true,
    status: "published",
    displayOrder: 1,
  },
  {
    type: "placement",
    category: "placement",
    title: "Inxyme Mega Virtual Placement & Career Drive 2026",
    description:
      "Dedicated recruitment initiative connecting certified learners in Full Stack Web, Python, Data Analytics, and SAP domains with 40+ leading corporate hiring partners.",
    fullContent:
      "The Inxyme Corporate Relations Cell organizes this quarterly recruitment conclave to fast-track hiring for certified alumni and current cohort candidates:\n\n• Live interview scheduling with corporate HRs & technical panels.\n• Domain-specific interview rounds for Junior Developers, Data Analysts, and SAP Associate Consultants.\n• Spot conditional offer rollouts and personalized feedback sessions.\n• Comprehensive resume and project portfolio screening.",
    date: "2026-11-05",
    time: "10:00 AM - 05:00 PM IST",
    location: "Virtual Recruitment Portal",
    mode: "Virtual Drive",
    organizerName: "Corporate Relations Cell",
    organizerDivision: "Inxyme Career & Placement Office",
    tag: "Placement Drive",
    featured: true,
    registrationOpen: true,
    status: "published",
    displayOrder: 2,
  },
  {
    type: "press",
    category: "news",
    title: "Inxyme Conferred with Bharat Business Award for Best Certification & Training Academy",
    description:
      "Honored by the Federation of Indian Education & Industry Councils for delivering industry-aligned practical upskilling and career development across tech sectors.",
    fullContent:
      "Inxyme has been officially conferred with the prestigious 'Bharat Business Award for Best Certification and Training Academy'.\n\nThis landmark recognition acknowledges Inxyme's relentless focus on:\n• Hands-on practical curriculum mapped to current corporate requirements.\n• High-accountability placement support delivering over 98% placement track record.\n• Verified digital credentials recognized by leading enterprise hiring partners across India.\n• Industry-grade cloud sandbox infrastructure provided to every registered learner.",
    date: "2025-09-30",
    publisher: "Federation of Indian Education & Industry Councils",
    image: "https://www.inxyme.com/api/upload/file/award-correction-2991.png",
    mode: "Official Notice",
    organizerName: "Office of Communications",
    organizerDivision: "Inxyme Executive Directorate",
    tag: "National Award",
    featured: false,
    registrationOpen: false,
    externalLink: "/awards-recognition",
    status: "published",
    displayOrder: 3,
  },
  {
    type: "masterclass",
    category: "upcoming",
    title: "Engineering Enterprise Generative AI & Retrieval-Augmented Generation (RAG) Systems",
    description:
      "Hands-on architectural masterclass on developing scalable GenAI systems with Vector Databases, LangChain, semantic search, and secure LLM fine-tuning pipelines.",
    fullContent:
      "Enterprises are moving beyond simple API calls to building domain-specific, production-grade GenAI pipelines. In this masterclass, our senior AI mentors will cover:\n\n• Anatomy of an enterprise RAG architecture: ingestion, chunking, and embedding.\n• Vector database benchmarking (Pinecone, Qdrant, Milvus).\n• Preventing hallucinations with guardrails and structured evaluation frameworks.\n• Deploying cost-optimized multi-modal LLM applications to cloud environments.",
    date: "2026-10-25",
    time: "11:00 AM - 12:30 PM IST",
    location: "Interactive Online Lab Room",
    mode: "Live Interactive Webinar",
    organizerName: "AI & Data Science Faculty",
    organizerDivision: "Inxyme Advanced Computing Wing",
    tag: "Generative AI",
    featured: false,
    registrationOpen: true,
    status: "published",
    displayOrder: 4,
  },
  {
    type: "announcement",
    category: "news",
    title: "Inxyme Expands Dedicated 24/7 Cloud Sandbox Infrastructure for Live Capstones",
    description:
      "Every enrolled student now receives instant, browser-based access to enterprise-configured Linux, AWS, Docker, and ERP environments with zero local installation hurdles.",
    fullContent:
      "To ensure zero friction during hands-on coding and enterprise ERP configurations, Inxyme has enhanced its virtual lab infrastructure:\n\n• High-availability sandbox instances with pre-configured developer tooling.\n• One-click access to real-time industrial project repositories and datasets.\n• Automated code evaluation and mentorship check-ins integrated into the student dashboard.\n• Eliminates system requirement barriers for students working on basic laptops.",
    date: "2026-08-20",
    mode: "Official Notice",
    organizerName: "Academic Technology Committee",
    organizerDivision: "Digital Learning Infrastructure",
    tag: "Platform Update",
    featured: false,
    registrationOpen: false,
    status: "published",
    displayOrder: 5,
  },
  {
    type: "archive",
    category: "past",
    title: "Transitioning into High-Growth Tech Roles: Strategic Roadmap for Non-IT Professionals",
    description:
      "A comprehensive recorded session covering practical domain selection, proof-of-work project structuring, and clearing technical interviews without a CS degree.",
    fullContent:
      "Recorded session from our quarterly Career Transition Symposium. Topics covered:\n\n• High-demand sectors welcoming non-tech graduates (Data Analytics, SAP FICO, QA Automation).\n• How to showcase transferable domain experience alongside newly acquired tech skills.\n• Building Github repositories and project portfolios that command recruiter attention.\n• Step-by-step guidance on answering technical case studies in interviews.",
    date: "2026-06-15",
    time: "Recorded Masterclass Available",
    location: "On-Demand Resource Library",
    mode: "On-Demand Recording",
    organizerName: "Career Mentorship Network",
    organizerDivision: "Student Success & Counselling",
    tag: "Career Strategy",
    featured: false,
    registrationOpen: true,
    status: "published",
    displayOrder: 6,
  },
];

// Helper to auto-seed default news/events if empty
export const checkAndAutoSeedNewsEvents = async () => {
  try {
    const count = await NewsEvent.countDocuments();
    if (count === 0) {
      console.log("🌱 Auto-seeding initial News & Events into MongoDB...");
      await NewsEvent.insertMany(DEFAULT_EVENTS);
      console.log("✅ Seeded initial News & Events successfully");
    }
  } catch (err) {
    console.error("Error auto-seeding news/events:", err);
  }
};

// @desc    Get all news and events (with search, category filter, status filter, sorting)
// @route   GET /api/news-events
// @access  Public
export const getAllNewsEvents = catchAsync(async (req, res, next) => {
  const totalCount = await NewsEvent.countDocuments();
  if (totalCount === 0) {
    await checkAndAutoSeedNewsEvents();
  }

  const queryObj = {};

  const isAdmin = req.user && (req.user.role === "admin" || req.user.role === "employee");
  if (req.query.status) {
    queryObj.status = req.query.status;
  } else if (!isAdmin) {
    queryObj.status = "published";
  }

  // Filter by category
  if (req.query.category && req.query.category !== "all") {
    queryObj.category = req.query.category;
  }

  // Filter by type
  if (req.query.type) {
    queryObj.type = req.query.type;
  }

  // Filter by featured
  if (req.query.featured !== undefined) {
    queryObj.featured = req.query.featured === "true" || req.query.featured === true;
  }

  // Search filter
  if (req.query.search && req.query.search.trim()) {
    const searchRegex = new RegExp(req.query.search.trim(), "i");
    queryObj.$or = [
      { title: searchRegex },
      { description: searchRegex },
      { fullContent: searchRegex },
      { tag: searchRegex },
      { organizerName: searchRegex },
      { organizerDivision: searchRegex },
      { publisher: searchRegex },
    ];
  }

  // Pagination
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = req.query.limit ? Math.max(1, parseInt(req.query.limit, 10)) : 100;
  const skip = (page - 1) * limit;

  // Sorting: order by displayOrder ascending, then date / createdAt descending
  let sortOption = { displayOrder: 1, createdAt: -1 };
  if (req.query.sort === "date-desc") {
    sortOption = { date: -1, createdAt: -1 };
  } else if (req.query.sort === "date-asc") {
    sortOption = { date: 1, createdAt: 1 };
  }

  const [items, total] = await Promise.all([
    NewsEvent.find(queryObj).sort(sortOption).skip(skip).limit(limit),
    NewsEvent.countDocuments(queryObj),
  ]);

  res.status(200).json({
    success: true,
    results: items.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    data: {
      items,
    },
  });
});

// @desc    Get single news/event by ID
// @route   GET /api/news-events/:id
// @access  Public / Admin
export const getNewsEventById = catchAsync(async (req, res, next) => {
  const item = await NewsEvent.findById(req.params.id);

  if (!item) {
    return next(new AppError("No news or event found with that ID", 404));
  }

  res.status(200).json({
    success: true,
    data: {
      item,
    },
  });
});

// @desc    Create a new news/event
// @route   POST /api/news-events
// @access  Private (Admin)
export const createNewsEvent = catchAsync(async (req, res, next) => {
  const {
    title,
    type,
    category,
    description,
    fullContent,
    date,
    time,
    location,
    mode,
    organizerName,
    organizerDivision,
    publisher,
    image,
    tag,
    featured,
    registrationOpen,
    externalLink,
    status,
    displayOrder,
  } = req.body;

  const newItem = await NewsEvent.create({
    title,
    type: type || "masterclass",
    category: category || "upcoming",
    description,
    fullContent: fullContent || "",
    date: date || new Date().toISOString().split("T")[0],
    time: time || "",
    location: location || "Online Session",
    mode: mode || "Live Interactive Webinar",
    organizerName: organizerName || "Inxyme Academic Council",
    organizerDivision: organizerDivision || "Executive Directorate",
    publisher: publisher || "",
    image: image || "",
    tag: tag || "Masterclass",
    featured: Boolean(featured),
    registrationOpen: registrationOpen !== undefined ? Boolean(registrationOpen) : true,
    externalLink: externalLink || "",
    status: status || "published",
    displayOrder: displayOrder !== undefined ? Number(displayOrder) : 0,
  });

  res.status(201).json({
    success: true,
    message: "News/Event created successfully",
    data: {
      item: newItem,
    },
  });
});

// @desc    Update news/event
// @route   PUT /api/news-events/:id
// @access  Private (Admin)
export const updateNewsEvent = catchAsync(async (req, res, next) => {
  const item = await NewsEvent.findById(req.params.id);

  if (!item) {
    return next(new AppError("No news or event found with that ID", 404));
  }

  const allowedFields = [
    "title",
    "type",
    "category",
    "description",
    "fullContent",
    "date",
    "time",
    "location",
    "mode",
    "organizerName",
    "organizerDivision",
    "publisher",
    "image",
    "tag",
    "featured",
    "registrationOpen",
    "externalLink",
    "status",
    "displayOrder",
  ];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      item[field] = req.body[field];
    }
  });

  await item.save();

  res.status(200).json({
    success: true,
    message: "News/Event updated successfully",
    data: {
      item,
    },
  });
});

// @desc    Delete news/event
// @route   DELETE /api/news-events/:id
// @access  Private (Admin)
export const deleteNewsEvent = catchAsync(async (req, res, next) => {
  const item = await NewsEvent.findByIdAndDelete(req.params.id);

  if (!item) {
    return next(new AppError("No news or event found with that ID", 404));
  }

  res.status(200).json({
    success: true,
    message: "News/Event deleted successfully",
    data: null,
  });
});

// @desc    Seed default news & events
// @route   POST /api/news-events/seed
// @access  Private (Admin)
export const seedDefaultNewsEvents = catchAsync(async (req, res, next) => {
  const count = await NewsEvent.countDocuments();
  if (count > 0 && req.query.force !== "true") {
    return res.status(200).json({
      success: true,
      message: `Database already has ${count} records. Pass ?force=true to reset and re-seed.`,
    });
  }

  if (req.query.force === "true") {
    await NewsEvent.deleteMany({});
  }

  const seeded = await NewsEvent.insertMany(DEFAULT_EVENTS);

  res.status(201).json({
    success: true,
    message: `Seeded ${seeded.length} news/events records successfully.`,
    data: {
      items: seeded,
    },
  });
});
