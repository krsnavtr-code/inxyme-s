import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import DirectPayment from '../model/directPayment.model.js';
import User from '../model/User.js';
import Course from '../model/course.model.js';
import Candidate from '../model/Candidate.js';
import { validationResult } from 'express-validator';
import { sendBrandedEmailWithRecord } from '../utils/brandedEmailSender.js';
import {
  buildInvoiceEmailContent,
  buildPendingPaymentAlertEmailContent,
  computeGstBreakup,
  generatePaymentInvoicePdfBuffer,
  getInvoiceFilename,
} from '../utils/invoicePdfGenerator.js';

/**
 * Generate a unique invoice number like INV-202611-4821
 */
const generateUniqueInvoiceNumber = async (dateInput = new Date()) => {
  const date = dateInput ? new Date(dateInput) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  const prefix = `INV-${year}${month}`;

  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const candidate = `${prefix}-${suffix}`;
    const existing = await DirectPayment.exists({ invoiceNumber: candidate });
    if (!existing) return candidate;
  }

  return `${prefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
};

const ensurePaymentInvoiceNumber = async (payment) => {
  if (!payment || payment.invoiceNumber) {
    return payment;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = await generateUniqueInvoiceNumber(payment.paymentDate || payment.createdAt);
    try {
      const updated = await DirectPayment.findOneAndUpdate(
        {
          _id: payment._id,
          $or: [
            { invoiceNumber: { $exists: false } },
            { invoiceNumber: null },
            { invoiceNumber: '' },
          ],
        },
        { $set: { invoiceNumber: candidate } },
        { new: true }
      );

      if (updated?.invoiceNumber) {
        payment.invoiceNumber = updated.invoiceNumber;
        return payment;
      }

      // Another concurrent request (e.g. parallel preview/PDF fetch) assigned an invoiceNumber first
      const latest = await DirectPayment.findById(payment._id).select('invoiceNumber').lean();
      if (latest?.invoiceNumber) {
        payment.invoiceNumber = latest.invoiceNumber;
        return payment;
      }
    } catch (err) {
      if (err?.code === 11000 && attempt < 2) {
        continue;
      }
      throw err;
    }
  }

  return payment;
};

/**
 * Fetch completed payment history for a student (matched by userId or email)
 * and compute previously paid totals for a specific course.
 */
const fetchStudentCompletedHistory = async ({ userId = null, email = '', courseId = null, course = '' }) => {
  const orStudent = [];
  if (userId) orStudent.push({ userId });
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (normalizedEmail) orStudent.push({ email: normalizedEmail });

  if (orStudent.length === 0) {
    return {
      payments: [],
      coursePayments: [],
      previouslyPaidForCourse: 0,
      totalPaidAllCourses: 0,
    };
  }

  const completedPayments = await DirectPayment.find({
    status: 'completed',
    $or: orStudent,
  })
    .select(
      '_id invoiceNumber courseId course paymentAmount totalCourseFee discountAmount balanceDue paymentMethod paymentDate createdAt installmentLabel status'
    )
    .sort({ paymentDate: -1, createdAt: -1 })
    .lean();

  const targetCourseId = courseId ? String(courseId) : '';
  const targetCourseTitle = String(course || '').trim().toLowerCase();

  const coursePayments =
    targetCourseId || targetCourseTitle
      ? completedPayments.filter((p) => {
        const pCourseId = p.courseId ? String(p.courseId) : '';
        if (targetCourseId && pCourseId && pCourseId === targetCourseId) {
          return true;
        }
        const pTitle = String(p.course || '').trim().toLowerCase();
        return Boolean(targetCourseTitle && pTitle && pTitle === targetCourseTitle);
      })
      : [];

  const totalPaidAllCourses = Number(
    completedPayments.reduce((sum, p) => sum + (Number(p.paymentAmount) || 0), 0).toFixed(2)
  );
  const previouslyPaidForCourse = Number(
    coursePayments.reduce((sum, p) => sum + (Number(p.paymentAmount) || 0), 0).toFixed(2)
  );

  return {
    payments: completedPayments,
    coursePayments,
    previouslyPaidForCourse,
    totalPaidAllCourses,
  };
};

// @desc    Get completed payment history for a student (to compute prior installments & balance due)
// @route   GET /api/admin/payments/student-history
// @access  Private/Admin
export const getStudentPaymentHistory = async (req, res) => {
  try {
    const { userId = '', email = '', courseId = '', course = '' } = req.query;

    let resolvedEmail = String(email || '').trim().toLowerCase();
    if (userId && !resolvedEmail) {
      const user = await User.findById(userId).select('email').lean();
      if (user?.email) resolvedEmail = String(user.email).trim().toLowerCase();
    }

    let resolvedCourseTitle = String(course || '').trim();
    if (courseId && !resolvedCourseTitle) {
      const foundCourse = await Course.findById(courseId).select('title').lean();
      if (foundCourse?.title) resolvedCourseTitle = String(foundCourse.title).trim();
    }

    const history = await fetchStudentCompletedHistory({
      userId: userId || null,
      email: resolvedEmail,
      courseId: courseId || null,
      course: resolvedCourseTitle,
    });

    res.status(200).json({
      success: true,
      ...history,
    });
  } catch (error) {
    console.error('Error fetching student payment history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student payment history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Get all payments with search, filtering, and summary stats
// @route   GET /api/admin/payments
// @access  Private/Admin
export const getAllPayments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sort = '-createdAt',
      search = '',
      status = '',
      paymentMethod = '',
      invoiceSent = '',
      userId = '',
    } = req.query;

    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (paymentMethod && paymentMethod !== 'all') {
      query.paymentMethod = paymentMethod;
    }

    if (invoiceSent === 'true') {
      query.invoiceSent = true;
    } else if (invoiceSent === 'false') {
      query.invoiceSent = { $ne: true };
    }

    if (userId) {
      query.userId = userId;
    }

    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { name: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
        { phone: { $regex: s, $options: 'i' } },
        { course: { $regex: s, $options: 'i' } },
        { invoiceNumber: { $regex: s, $options: 'i' } },
        { transactionId: { $regex: s, $options: 'i' } },
        { paymentId: { $regex: s, $options: 'i' } },
      ];
    }

    const options = {
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
      sort,
      populate: [
        { path: 'userId', select: 'fullname email phone address studentId role' },
        { path: 'courseId', select: 'title price slug' },
      ],
    };

    const [payments, statsAgg] = await Promise.all([
      DirectPayment.paginate(query, options),
      DirectPayment.aggregate([
        {
          $group: {
            _id: null,
            totalRecords: { $sum: 1 },
            completedCount: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
            pendingCount: {
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
            },
            invoicesSentCount: {
              $sum: { $cond: [{ $eq: ['$invoiceSent', true] }, 1, 0] },
            },
            totalCollected: {
              $sum: {
                $cond: [{ $eq: ['$status', 'completed'] }, '$paymentAmount', 0],
              },
            },
          },
        },
      ]),
    ]);

    const stats = statsAgg[0] || {
      totalRecords: 0,
      completedCount: 0,
      pendingCount: 0,
      invoicesSentCount: 0,
      totalCollected: 0,
    };

    res.status(200).json({
      success: true,
      count: payments.totalDocs,
      totalPages: payments.totalPages,
      currentPage: payments.page,
      payments: payments.docs,
      stats,
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payments',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Create a manual payment record for a student selected from the User database
// @route   POST /api/admin/payments
// @access  Private/Admin
export const createAdminPayment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0]?.msg || 'Validation failed',
        errors: errors.array(),
      });
    }

    const {
      userId,
      name,
      email,
      phone,
      address,
      courseId = null,
      course,
      paymentAmount,
      totalCourseFee = null,
      discountAmount,
      previouslyPaidAmount,
      balanceDue = null,
      installmentLabel = 'Full Course Fee',
      paymentMethod = 'upi',
      transactionId = '',
      paymentDate = new Date(),
      status = 'completed',
      gstRate = 18,
      companyGstin = '',
      studentGstin = '',
      notes = '',
    } = req.body;

    let selectedUser = null;
    if (userId) {
      selectedUser = await User.findById(userId).select('fullname email phone address discount');
      if (!selectedUser) {
        return res.status(404).json({
          success: false,
          message: 'Selected student not found in user database',
        });
      }
    }

    let selectedCourse = null;
    if (courseId) {
      selectedCourse = await Course.findById(courseId).select('title price originalPrice isFree');
      if (!selectedCourse) {
        return res.status(404).json({
          success: false,
          message: 'Selected course not found',
        });
      }
    }

    const finalName = (name || selectedUser?.fullname || '').trim();
    const finalEmail = (email || selectedUser?.email || '').toLowerCase().trim();
    const finalPhone = (phone || selectedUser?.phone || 'Not provided').trim();
    const finalAddress = (address || selectedUser?.address || 'Not provided').trim();
    const finalCourseTitle = (course || selectedCourse?.title || '').trim();

    if (!finalName || !finalEmail) {
      return res.status(400).json({
        success: false,
        message: 'Student name and email are required',
      });
    }

    if (!finalCourseTitle) {
      return res.status(400).json({
        success: false,
        message: 'Course name is required',
      });
    }

    const numericPaid = Number(paymentAmount);
    if (Number.isNaN(numericPaid) || numericPaid <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Payment amount must be greater than 0',
      });
    }

    const courseFallbackPrice = selectedCourse
      ? selectedCourse.isFree
        ? 0
        : Number(selectedCourse.price ?? selectedCourse.originalPrice ?? 0)
      : null;

    const numericTotalFee =
      totalCourseFee !== null && totalCourseFee !== '' && !Number.isNaN(Number(totalCourseFee))
        ? Math.max(0, Number(totalCourseFee))
        : courseFallbackPrice;

    const hasExplicitDiscount =
      discountAmount !== undefined &&
      discountAmount !== null &&
      discountAmount !== '' &&
      !Number.isNaN(Number(discountAmount));

    const userDiscountPct = Math.min(100, Math.max(0, Number(selectedUser?.discount || 0)));
    const numericDiscount = hasExplicitDiscount
      ? Math.max(0, Number(discountAmount))
      : numericTotalFee > 0 && userDiscountPct > 0
        ? Number(((numericTotalFee * userDiscountPct) / 100).toFixed(2))
        : 0;

    const hasExplicitPreviousPaid =
      previouslyPaidAmount !== undefined &&
      previouslyPaidAmount !== null &&
      previouslyPaidAmount !== '' &&
      !Number.isNaN(Number(previouslyPaidAmount));

    let numericPreviouslyPaid = 0;
    if (hasExplicitPreviousPaid) {
      numericPreviouslyPaid = Math.max(0, Number(previouslyPaidAmount));
    } else {
      const priorHistory = await fetchStudentCompletedHistory({
        userId: selectedUser?._id || null,
        email: finalEmail,
        courseId: selectedCourse?._id || null,
        course: finalCourseTitle,
      });
      numericPreviouslyPaid = priorHistory.previouslyPaidForCourse;
    }

    const computedBalance =
      balanceDue !== null && balanceDue !== '' && !Number.isNaN(Number(balanceDue))
        ? Math.max(0, Number(balanceDue))
        : numericTotalFee !== null
          ? Number(Math.max(0, numericTotalFee - numericDiscount - numericPreviouslyPaid - numericPaid).toFixed(2))
          : 0;

    const invoiceNumber = await generateUniqueInvoiceNumber(paymentDate);
    const cleanTxnId = String(transactionId || '').trim();

    const payment = new DirectPayment({
      userId: selectedUser?._id || null,
      name: finalName,
      email: finalEmail,
      phone: finalPhone || 'Not provided',
      address: finalAddress || 'Not provided',
      course: finalCourseTitle,
      courseId: selectedCourse?._id || null,
      paymentAmount: numericPaid,
      totalCourseFee: numericTotalFee,
      discountAmount: numericDiscount,
      previouslyPaidAmount: numericPreviouslyPaid,
      balanceDue: computedBalance,
      installmentLabel: String(installmentLabel || 'Full Course Fee').trim(),
      paymentMethod,
      transactionId: cleanTxnId,
      paymentId: cleanTxnId || invoiceNumber,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      status,
      invoiceNumber,
      gstRate: Math.min(
        100,
        Math.max(
          0,
          gstRate === '' ||
            gstRate === null ||
            gstRate === undefined ||
            !Number.isFinite(Number(gstRate))
            ? 18
            : Number(gstRate)
        )
      ),
      // Course fees and manual payments are always GST-inclusive; never charge extra GST on top
      gstInclusive: true,
      companyGstin: String(companyGstin || '').trim().toUpperCase(),
      studentGstin: String(studentGstin || '').trim().toUpperCase(),
      notes: String(notes || '').trim(),
      source: 'admin_manual',
      createdBy: req.user?._id || null,
      createdByName: req.user?.fullname || req.user?.email || 'Admin',
    });

    await payment.save();

    // Update Candidate record if one exists with matching email (consistent with public flow)
    if (status === 'completed' && finalEmail) {
      try {
        await Candidate.findOneAndUpdate(
          { email: finalEmail },
          {
            $set: {
              isPaymentDone: true,
              paymentId: payment.paymentId,
              paymentRecordId: payment._id,
              paymentDetails: {
                amount: numericPaid,
                date: payment.paymentDate,
                status: 'completed',
                orderId: invoiceNumber,
                paymentMethod,
                directPaymentId: payment._id,
              },
            },
          },
          { new: true, upsert: false }
        );
      } catch (candErr) {
        console.warn('Candidate sync skipped:', candErr.message);
      }
    }

    const populatedPayment = await DirectPayment.findById(payment._id)
      .populate('userId', 'fullname email phone address studentId role discount')
      .populate('courseId', 'title price originalPrice isFree slug');

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      payment: populatedPayment,
    });
  } catch (error) {
    console.error('Error creating admin payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to record payment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Get single payment by ID
// @route   GET /api/admin/payments/:id
// @access  Private/Admin
export const getPaymentById = async (req, res) => {
  try {
    let payment = await DirectPayment.findById(req.params.id)
      .populate('userId', 'fullname email phone address studentId role')
      .populate('courseId', 'title price slug')
      .populate('createdBy', 'fullname email');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    await ensurePaymentInvoiceNumber(payment);

    res.status(200).json({
      success: true,
      payment,
      gstBreakup: computeGstBreakup(
        payment.paymentAmount,
        payment.gstRate ?? 18,
        payment.gstInclusive !== false
      ),
    });
  } catch (error) {
    console.error('Error fetching payment:', error);
    if (error.kind === 'ObjectId' || error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Update payment status
// @route   PUT /api/admin/payments/:id/status
// @access  Private/Admin
export const updatePaymentStatus = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { status } = req.body;
    const payment = await DirectPayment.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payment status updated successfully',
      payment,
    });
  } catch (error) {
    console.error('Error updating payment status:', error);
    if (error.kind === 'ObjectId' || error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to update payment status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Generate & stream Payment Invoice PDF (for preview or download)
// @route   GET /api/admin/payments/:id/invoice-pdf
// @access  Private/Admin
export const getPaymentInvoicePdf = async (req, res) => {
  try {
    const payment = await DirectPayment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    await ensurePaymentInvoiceNumber(payment);

    const pdfBuffer = await generatePaymentInvoicePdfBuffer(payment);
    const filename = getInvoiceFilename(payment);
    const disposition = req.query.download === 'true' ? 'attachment' : 'inline';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (error) {
    console.error('Error generating payment invoice PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate invoice PDF',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Get default written mail & HTML preview for sending Payment Invoice email
// @route   GET /api/admin/payments/:id/invoice-preview
// @access  Private/Admin
export const getPaymentInvoicePreview = async (req, res) => {
  try {
    const payment = await DirectPayment.findById(req.params.id)
      .populate('userId', 'fullname email phone address studentId')
      .populate('courseId', 'title price');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    await ensurePaymentInvoiceNumber(payment);

    const preview = buildInvoiceEmailContent(payment);

    res.status(200).json({
      success: true,
      preview,
      payment,
    });
  } catch (error) {
    console.error('Error generating invoice email preview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load invoice preview',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Shared helper to dispatch a branded payment email (optionally with Invoice PDF + inline CID logo)
 * and record the result in EmailRecord.
 */
const dispatchPaymentEmailWithLogo = async ({
  payment,
  targetEmail,
  cc = '',
  buildContent,
  includeInvoicePdf = false,
  templateUsed,
  adminUserId,
}) => {
  const extraAttachments = [];
  const recordAttachments = [];

  if (includeInvoicePdf) {
    const pdfBuffer = await generatePaymentInvoicePdfBuffer(payment);
    const pdfFilename = getInvoiceFilename(payment);

    const invoicesDir = path.join(__dirname, '..', 'public', 'pdfs', 'invoices');
    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, { recursive: true });
    }
    const savedPdfPath = path.join(invoicesDir, pdfFilename);
    fs.writeFileSync(savedPdfPath, pdfBuffer);

    extraAttachments.push({
      filename: pdfFilename,
      content: pdfBuffer,
      contentType: 'application/pdf',
    });
    recordAttachments.push({
      name: pdfFilename,
      path: `/pdfs/invoices/${pdfFilename}`,
      type: 'pdf',
      size: pdfBuffer.length,
    });
  }

  return sendBrandedEmailWithRecord({
    to: targetEmail,
    cc,
    buildContent,
    studentName: payment.name,
    courseName: payment.course,
    templateUsed,
    adminUserId,
    extraAttachments,
    recordAttachments,
  });
};

// @desc    Send Payment Invoice email with attached PDF receipt
// @route   POST /api/admin/payments/:id/send-invoice
// @access  Private/Admin
export const sendPaymentInvoiceEmail = async (req, res) => {
  try {
    const payment = await DirectPayment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    await ensurePaymentInvoiceNumber(payment);

    const { to, cc = '', subject, writtenMessage } = req.body;
    const targetEmail = (to || payment.email || '').trim().toLowerCase();

    if (!targetEmail || !/\S+@\S+\.\S+/.test(targetEmail)) {
      return res.status(400).json({
        success: false,
        message: 'A valid recipient email address is required',
      });
    }

    const emailContent = await dispatchPaymentEmailWithLogo({
      payment,
      targetEmail,
      cc,
      includeInvoicePdf: true,
      templateUsed: 'payment_invoice',
      adminUserId: req.user._id,
      buildContent: (hasLogo) =>
        buildInvoiceEmailContent(payment, {
          to: targetEmail,
          subject,
          writtenMessage,
          useCidLogo: hasLogo,
        }),
    });

    payment.invoiceSent = true;
    payment.invoiceSentAt = new Date();
    payment.invoiceSentCount = (payment.invoiceSentCount || 0) + 1;
    payment.invoiceLastSentTo = targetEmail;
    payment.invoiceEmailSubject = emailContent.subject;
    payment.invoiceEmailMessage = emailContent.writtenMessage;
    await payment.save();

    const populatedPayment = await DirectPayment.findById(payment._id)
      .populate('userId', 'fullname email phone address studentId role discount')
      .populate('courseId', 'title price originalPrice isFree slug');

    res.status(200).json({
      success: true,
      message: `Payment invoice email sent successfully to ${targetEmail}`,
      payment: populatedPayment,
    });
  } catch (error) {
    console.error('Error sending payment invoice email:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send payment invoice email',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Get default written mail & HTML preview for Pending Payment Alert email
// @route   GET /api/admin/payments/:id/pending-alert-preview
// @access  Private/Admin
export const getPendingPaymentAlertPreview = async (req, res) => {
  try {
    const payment = await DirectPayment.findById(req.params.id)
      .populate('userId', 'fullname email phone address studentId discount')
      .populate('courseId', 'title price');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    await ensurePaymentInvoiceNumber(payment);

    const { pendingAmount, dueDate, paymentLink, attachInvoicePdf } = req.query;
    const preview = buildPendingPaymentAlertEmailContent(payment, {
      pendingAmount,
      dueDate,
      paymentLink,
      attachInvoicePdf: attachInvoicePdf === 'true',
    });

    res.status(200).json({
      success: true,
      preview,
      payment,
    });
  } catch (error) {
    console.error('Error generating pending alert preview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load pending payment alert preview',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Send Pending Payment Alert reminder email to student
// @route   POST /api/admin/payments/:id/send-pending-alert
// @access  Private/Admin
export const sendPendingPaymentAlertEmail = async (req, res) => {
  try {
    const payment = await DirectPayment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    await ensurePaymentInvoiceNumber(payment);

    const {
      to,
      cc = '',
      subject,
      writtenMessage,
      pendingAmount,
      dueDate = '',
      paymentLink = '',
      attachInvoicePdf = false,
    } = req.body;

    const targetEmail = (to || payment.email || '').trim().toLowerCase();
    if (!targetEmail || !/\S+@\S+\.\S+/.test(targetEmail)) {
      return res.status(400).json({
        success: false,
        message: 'A valid recipient email address is required',
      });
    }

    if (paymentLink && !/^https?:\/\/\S+$/i.test(String(paymentLink).trim())) {
      return res.status(400).json({
        success: false,
        message: 'Payment link must be a valid http:// or https:// URL',
      });
    }

    const emailContent = await dispatchPaymentEmailWithLogo({
      payment,
      targetEmail,
      cc,
      includeInvoicePdf: Boolean(attachInvoicePdf),
      templateUsed: 'pending_payment_alert',
      adminUserId: req.user._id,
      buildContent: (hasLogo) =>
        buildPendingPaymentAlertEmailContent(payment, {
          to: targetEmail,
          subject,
          writtenMessage,
          pendingAmount,
          dueDate,
          paymentLink,
          attachInvoicePdf: Boolean(attachInvoicePdf),
          useCidLogo: hasLogo,
        }),
    });

    payment.pendingAlertSent = true;
    payment.pendingAlertSentAt = new Date();
    payment.pendingAlertSentCount = (payment.pendingAlertSentCount || 0) + 1;
    payment.pendingAlertLastSentTo = targetEmail;
    payment.pendingAlertEmailSubject = emailContent.subject;
    payment.pendingAlertEmailMessage = emailContent.writtenMessage;
    payment.pendingAlertLastDueDate = dueDate ? new Date(dueDate) : null;
    await payment.save();

    const populatedPayment = await DirectPayment.findById(payment._id)
      .populate('userId', 'fullname email phone address studentId role discount')
      .populate('courseId', 'title price originalPrice isFree slug');

    res.status(200).json({
      success: true,
      message: `Pending payment alert sent successfully to ${targetEmail}`,
      payment: populatedPayment,
    });
  } catch (error) {
    console.error('Error sending pending payment alert email:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send pending payment alert email',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
