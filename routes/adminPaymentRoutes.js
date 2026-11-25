import express from 'express';
import { check, body } from 'express-validator';
import { protect, admin } from '../middleware/authMiddleware.js';
import {
  getAllPayments,
  createAdminPayment,
  getPaymentById,
  updatePaymentStatus,
  getPaymentInvoicePdf,
  getPaymentInvoicePreview,
  sendPaymentInvoiceEmail,
} from '../controllers/adminPaymentController.js';

const router = express.Router();

// @route   GET /api/admin/payments
// @desc    Get all payments (Admin only)
// @access  Private/Admin
router.get('/', protect, admin, getAllPayments);

// @route   POST /api/admin/payments
// @desc    Record a new payment for a student from user database (Admin only)
// @access  Private/Admin
router.post(
  '/',
  protect,
  admin,
  [
    body('paymentAmount')
      .isNumeric()
      .withMessage('Payment amount must be a number')
      .isFloat({ gt: 0 })
      .withMessage('Payment amount must be greater than 0'),
    body('paymentMethod')
      .optional()
      .isIn(['razorpay', 'upi', 'bank_transfer', 'cash', 'card', 'cheque', 'other'])
      .withMessage('Invalid payment method'),
    body('status')
      .optional()
      .isIn(['pending', 'completed', 'failed', 'refunded', 'cancelled'])
      .withMessage('Invalid payment status'),
  ],
  createAdminPayment
);

// @route   GET /api/admin/payments/:id/invoice-pdf
// @desc    Generate and stream Payment Invoice PDF (Admin only)
// @access  Private/Admin
router.get('/:id/invoice-pdf', protect, admin, getPaymentInvoicePdf);

// @route   GET /api/admin/payments/:id/invoice-preview
// @desc    Get written email preview & invoice details (Admin only)
// @access  Private/Admin
router.get('/:id/invoice-preview', protect, admin, getPaymentInvoicePreview);

// @route   POST /api/admin/payments/:id/send-invoice
// @desc    Send Payment Invoice email with attached PDF receipt (Admin only)
// @access  Private/Admin
router.post('/:id/send-invoice', protect, admin, sendPaymentInvoiceEmail);

// @route   GET /api/admin/payments/:id
// @desc    Get payment by ID (Admin only)
// @access  Private/Admin
router.get('/:id', protect, admin, getPaymentById);

// @route   PUT /api/admin/payments/:id/status
// @desc    Update payment status (Admin only)
// @access  Private/Admin
router.put(
  '/:id/status',
  protect,
  admin,
  [
    check('status', 'Status is required')
      .notEmpty()
      .isIn(['pending', 'completed', 'failed', 'refunded', 'cancelled'])
      .withMessage('Invalid status'),
  ],
  updatePaymentStatus
);

export default router;
