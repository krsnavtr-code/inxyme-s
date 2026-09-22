import FAQ from '../model/faq.model.js';
import asyncHandler from 'express-async-handler';
import { validationResult } from 'express-validator';

// @desc    Get all active FAQs (public)
// @route   GET /api/faqs
// @access  Public
export const getFAQs = asyncHandler(async (req, res) => {
  const { search, status } = req.query;
  
  // Build query
  const query = { status: 'active' };
  
  // Search functionality
  if (search) {
    query.$text = { $search: search };
  }
  
  // Status filter (for admin)
  if (req.user?.role === 'admin' && status) {
    query.status = status;
  }
  
  // Sorting
  const sort = req.query.sort || 'order';
  const sortOrder = req.query.order === 'desc' ? -1 : 1;
  
  const faqs = await FAQ.find(query)
    .sort({ [sort]: sortOrder, _id: 1 })
    .select('-__v -createdAt -updatedAt');
    
  res.json({
    success: true,
    count: faqs.length,
    data: faqs
  });
});

// @desc    Get all FAQs (admin)
// @route   GET /api/admin/faqs
// @access  Private/Admin
export const getAllFAQs = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 100, status, search } = req.query;
    
    // Build query
    const query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (search) {
      query.$text = { $search: search };
    }
    
    // For admin panel, increase the default limit to show more items
    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort: { order: 1, _id: 1 },
      select: '-__v',
      lean: true
    };
    
    const result = await FAQ.paginate(query, options);
    
    // Format the response to include both pagination info and data
    res.json({
      success: true,
      data: result.docs || [],
      total: result.totalDocs || 0,
      page: result.page || 1,
      pages: result.totalPages || 1,
      limit: result.limit
    });
  } catch (error) {
    console.error('Error in getAllFAQs:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching FAQs',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Get single FAQ
// @route   GET /api/admin/faqs/:id
// @access  Private/Admin
export const getFAQ = asyncHandler(async (req, res) => {
  const faq = await FAQ.findById(req.params.id).select('-__v');
  
  if (!faq) {
    res.status(404);
    throw new Error('FAQ not found');
  }
  
  res.json({
    success: true,
    data: faq
  });
});

// @desc    Create FAQ
// @route   POST /api/admin/faqs
// @access  Private/Admin
export const createFAQ = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(err => err.msg).join(', '));
  }
  
  const { question, answer, status = 'active' } = req.body;
  
  const faq = new FAQ({
    question,
    answer,
    status,
    createdBy: req.user.id
  });
  
  await faq.save();
  
  res.status(201).json({
    success: true,
    data: faq
  });
});

// @desc    Update FAQ
// @route   PUT /api/admin/faqs/:id
// @access  Private/Admin
export const updateFAQ = asyncHandler(async (req, res) => {
  const faq = await FAQ.findById(req.params.id);
  
  if (!faq) {
    res.status(404);
    throw new Error('FAQ not found');
  }
  
  const { question, answer, status } = req.body;
  
  if (question) faq.question = question;
  if (answer) faq.answer = answer;
  if (status) faq.status = status;
  
  await faq.save();
  
  res.json({
    success: true,
    data: faq
  });
});

// @desc    Delete FAQ
// @route   DELETE /api/admin/faqs/:id
// @access  Private/Admin
export const deleteFAQ = asyncHandler(async (req, res) => {
  const faq = await FAQ.findById(req.params.id);
  
  if (!faq) {
    res.status(404);
    throw new Error('FAQ not found');
  }
  
  await FAQ.findByIdAndDelete(req.params.id);
  
  res.json({
    success: true,
    message: 'FAQ removed',
    id: req.params.id
  });
});

// @desc    Update FAQ order
// @route   PUT /api/admin/faqs/update-order
// @access  Private/Admin
export const updateFAQOrder = asyncHandler(async (req, res) => {
  const { orderedIds } = req.body;
  
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    res.status(400);
    throw new Error('Invalid ordered IDs');
  }
  
  const bulkOps = orderedIds.map((id, index) => ({
    updateOne: {
      filter: { _id: id },
      update: { $set: { order: index + 1 } }
    }
  }));
  
  await FAQ.bulkWrite(bulkOps);
  
  const faqs = await FAQ.find({ _id: { $in: orderedIds } });
  
  res.json({
    success: true,
    data: faqs.sort((a, b) => orderedIds.indexOf(a._id.toString()) - orderedIds.indexOf(b._id.toString()))
  });
});
