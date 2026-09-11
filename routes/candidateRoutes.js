import express from "express";
import {
  createCandidate,
  getCandidates,
  updateCandidateStatus,
  sendOTP,
  verifyOTP,
  checkEmail,
  checkPhone,
  checkCompanyPaymentStatus,
} from "../controller/candidateController.js";
import { protect, admin } from "../middleware/authMiddleware.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

// Ensure candidate profile upload directory exists
const uploadDir = path.join(process.cwd(), "public", "candidate_profile");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `candidate-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpe?g|png|gif/;
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase(),
    );
    const mimetype = filetypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error("Only images are allowed (jpg, jpeg, png, gif)"));
    }
  },
});

// Public routes
router.get("/check-email", checkEmail);
router.get("/check-phone", checkPhone);
router.get("/check-company-payment", checkCompanyPaymentStatus);
router.post("/", upload.single("profilePhoto"), createCandidate);

// // Test route to view ID card
// router.get('/test-id-card', (req, res) => {
//     // Mock candidate data for testing
//     const testCandidate = {
//         name: 'John Doe',
//         email: 'john.doe@example.com',
//         phone: '+1234567890',
//         college: 'Example University',
//         course: 'Computer Science',
//         graduationYear: '2024'
//     };

//     // Mock event details
//     const eventDetails = {
//         eventName: 'Career Hiring Camp 2025',
//         eventDate: 'November 15, 2025',
//         venue: 'Grand Conference Center',
//         city: 'Mumbai',
//         qrCodeUrl: 'https://inxyme.com/verify/123456',
//         logoUrl: 'https://inxyme.com/logo.png'
//     };

//     // Add _id to test candidate as it's required by the generateIdCard function
//     testCandidate._id = 'test123';

//     // Import the generateIdCard function directly
//     import('../utils/idCardGenerator.js').then(({ default: generateIdCard }) => {
//         generateIdCard(testCandidate, eventDetails)
//             .then(({ buffer, filename }) => {
//                 // Set headers to display PDF in browser
//                 res.setHeader('Content-Type', 'application/pdf');
//                 res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
//                 res.send(buffer);
//             })
//             .catch(error => {
//                 console.error('Error generating ID card:', error);
//                 res.status(500).json({
//                     success: false,
//                     message: 'Error generating ID card',
//                     error: error.message
//                 });
//             });
//     });
// });

// OTP routes
router.post("/send-otp", sendOTP);
router.post("/verify-otp", verifyOTP);

// Protected admin routes
router.get("/", protect, admin, getCandidates);
router.put("/:id/status", protect, admin, updateCandidateStatus);

export default router;
