import express from 'express';
import { body } from 'express-validator';
import { 
  createDirectPayment, 
  getPaymentDetails,
  createRazorpayOrder,
  verifyPayment 
} from '../controllers/paymentController.js';
import {
  getPublicPaymentLink,
  createPaymentLinkOrder,
  verifyPaymentLinkPayment,
} from '../controllers/paymentLinkController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Validation rules for payment
const paymentValidationRules = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email'),
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^[0-9\-\+\s]*$/).withMessage('Please enter a valid phone number'),
  body('course').trim().notEmpty().withMessage('Course name is required'),
  body('address').trim().notEmpty().withMessage('Address is required'),
  body('paymentAmount')
    .isNumeric().withMessage('Payment amount must be a number')
    .isFloat({ min: 0 }).withMessage('Payment amount cannot be negative')
];

// Public routes (can be protected if needed)
router.post('/direct', paymentValidationRules, createDirectPayment);
router.post('/create-order', createRazorpayOrder);
router.post('/verify', verifyPayment);

// Public payment link routes
router.get('/link/:linkId', getPublicPaymentLink);
router.post('/link/:linkId/create-order', createPaymentLinkOrder);
router.post('/link/:linkId/verify', verifyPaymentLinkPayment);

// Protected routes
router.use(protect);
router.get('/:id', getPaymentDetails);

// Admin routes
// router.use(authorize('admin'));
// Add admin routes here if needed

export default router;
