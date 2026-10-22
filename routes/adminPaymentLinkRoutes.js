import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import {
  createPaymentLink,
  getAllPaymentLinks,
  getPaymentLinkById,
  updatePaymentLink,
  cancelPaymentLink,
  deletePaymentLink,
} from '../controllers/paymentLinkController.js';

const router = express.Router();

// All routes require admin authentication
router.use(protect, admin);

router.route('/')
  .post(createPaymentLink)
  .get(getAllPaymentLinks);

router.route('/:id')
  .get(getPaymentLinkById)
  .put(updatePaymentLink)
  .delete(deletePaymentLink);

router.patch('/:id/cancel', cancelPaymentLink);

export default router;
