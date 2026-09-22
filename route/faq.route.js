import express from 'express';
import { body } from 'express-validator';
import * as faqController from '../controller/faq.controller.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Create admin middleware
const admin = (req, res, next) => {
  return authorize('admin')(req, res, next);
};

// FAQ validation rules
const faqValidationRules = [
  body('question').trim().notEmpty().withMessage('Question is required'),
  body('answer').trim().notEmpty().withMessage('Answer is required'),
  body('status').optional().isIn(['active', 'inactive']).withMessage('Invalid status')
];

// Public route
router.get('/', faqController.getFAQs);

// Admin routes (when mounted with full path)
router.put('/admin/faqs/update-order', protect, admin, faqController.updateFAQOrder);
router.get('/admin/faqs', protect, admin, faqController.getAllFAQs);
router.get('/admin/faqs/:id', protect, admin, faqController.getFAQ);
router.post('/admin/faqs', protect, admin, faqValidationRules, faqController.createFAQ);
router.put('/admin/faqs/:id', protect, admin, faqValidationRules, faqController.updateFAQ);
router.delete('/admin/faqs/:id', protect, admin, faqController.deleteFAQ);

// Dedicated admin router for mounting at /api/admin/faqs
export const adminFaqRouter = express.Router();
adminFaqRouter.use(protect, admin);
adminFaqRouter.put('/update-order', faqController.updateFAQOrder);
adminFaqRouter.get('/', faqController.getAllFAQs);
adminFaqRouter.get('/:id', faqController.getFAQ);
adminFaqRouter.post('/', faqValidationRules, faqController.createFAQ);
adminFaqRouter.put('/:id', faqValidationRules, faqController.updateFAQ);
adminFaqRouter.delete('/:id', faqController.deleteFAQ);

export default router;
