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
import EmailRecord from '../model/EmailRecord.js';
import { validationResult } from 'express-validator';
import { sendEmail } from '../utils/email.js';
import {
  buildInvoiceEmailContent,
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
  if (!payment.invoiceNumber) {
    payment.invoiceNumber = await generateUniqueInvoiceNumber(payment.paymentDate || payment.createdAt);
    await payment.save();
  }
  return payment;
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
      discountAmount = 0,
      balanceDue = null,
      installmentLabel = 'Full Course Fee',
      paymentMethod = 'upi',
      transactionId = '',
      paymentDate = new Date(),
      status = 'completed',
      gstRate = 18,
      gstInclusive = true,
      companyGstin = '',
      studentGstin = '',
      notes = '',
    } = req.body;

    let selectedUser = null;
    if (userId) {
      selectedUser = await User.findById(userId).select('fullname email phone address');
      if (!selectedUser) {
        return res.status(404).json({
          success: false,
          message: 'Selected student not found in user database',
        });
      }
    }

    let selectedCourse = null;
    if (courseId) {
      selectedCourse = await Course.findById(courseId).select('title price');
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

    const numericTotalFee =
      totalCourseFee !== null && totalCourseFee !== '' && !Number.isNaN(Number(totalCourseFee))
        ? Math.max(0, Number(totalCourseFee))
        : selectedCourse?.price !== undefined
        ? Number(selectedCourse.price)
        : null;

    const numericDiscount = Math.max(0, Number(discountAmount) || 0);
    const computedBalance =
      balanceDue !== null && balanceDue !== '' && !Number.isNaN(Number(balanceDue))
        ? Math.max(0, Number(balanceDue))
        : numericTotalFee !== null
        ? Math.max(0, numericTotalFee - numericDiscount - numericPaid)
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
      balanceDue: computedBalance,
      installmentLabel: String(installmentLabel || 'Full Course Fee').trim(),
      paymentMethod,
      transactionId: cleanTxnId,
      paymentId: cleanTxnId || invoiceNumber,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      status,
      invoiceNumber,
      gstRate: Number(gstRate ?? 18),
      gstInclusive: gstInclusive !== false && gstInclusive !== 'false',
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
      .populate('userId', 'fullname email phone address studentId role')
      .populate('courseId', 'title price slug');

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

    const emailContent = buildInvoiceEmailContent(payment, {
      to: targetEmail,
      subject,
      writtenMessage,
    });

    const pdfBuffer = await generatePaymentInvoicePdfBuffer(payment);
    const pdfFilename = getInvoiceFilename(payment);

    // Save a copy of the invoice PDF under public/pdfs/invoices for EmailRecord link access
    const invoicesDir = path.join(__dirname, '..', 'public', 'pdfs', 'invoices');
    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, { recursive: true });
    }
    const savedPdfPath = path.join(invoicesDir, pdfFilename);
    fs.writeFileSync(savedPdfPath, pdfBuffer);

    let emailStatus = 'sent';
    let emailError = null;

    try {
      await sendEmail({
        to: targetEmail,
        cc: cc ? String(cc).trim() : '',
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
        attachments: [
          {
            filename: pdfFilename,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });
    } catch (sendErr) {
      emailStatus = 'failed';
      emailError = sendErr.message;
      throw sendErr;
    } finally {
      try {
        await EmailRecord.create({
          to: targetEmail,
          subject: emailContent.subject,
          message: emailContent.html,
          studentName: payment.name,
          courseName: payment.course,
          templateUsed: 'payment_invoice',
          attachments: [
            {
              name: pdfFilename,
              path: `/pdfs/invoices/${pdfFilename}`,
              type: 'pdf',
              size: pdfBuffer.length,
            },
          ],
          status: emailStatus,
          error: emailError,
          sentBy: req.user._id,
          sentAt: new Date(),
        });
      } catch (recordErr) {
        console.warn('Could not save EmailRecord for invoice mail:', recordErr.message);
      }
    }

    payment.invoiceSent = true;
    payment.invoiceSentAt = new Date();
    payment.invoiceSentCount = (payment.invoiceSentCount || 0) + 1;
    payment.invoiceLastSentTo = targetEmail;
    payment.invoiceEmailSubject = emailContent.subject;
    payment.invoiceEmailMessage = emailContent.writtenMessage;
    await payment.save();

    const populatedPayment = await DirectPayment.findById(payment._id)
      .populate('userId', 'fullname email phone address studentId role')
      .populate('courseId', 'title price slug');

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
