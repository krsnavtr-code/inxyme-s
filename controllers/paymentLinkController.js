import PaymentLink from '../model/paymentLink.model.js';
import DirectPayment from '../model/directPayment.model.js';
import Candidate from '../model/Candidate.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// Razorpay instance
let razorpay;
const getRazorpayInstance = () => {
  if (!razorpay) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error('Razorpay credentials missing in environment.');
      return null;
    }
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpay;
};

// Generate clean unique link ID
const generateUniqueLinkId = async () => {
  let unique = false;
  let linkId = '';
  while (!unique) {
    const randomHex = crypto.randomBytes(5).toString('hex');
    linkId = `pl_${randomHex}`;
    const existing = await PaymentLink.findOne({ linkId });
    if (!existing) {
      unique = true;
    }
  }
  return linkId;
};

// Get Client URL
const getClientBaseUrl = () => {
  return process.env.CLIENT_URL || process.env.FRONTEND_URL || 'https://www.inxyme.com';
};

// ==========================================
// ADMIN CONTROLLERS
// ==========================================

// @desc    Create a new payment link
// @route   POST /api/admin/payment-links
// @access  Private/Admin
export const createPaymentLink = async (req, res) => {
  try {
    const {
      title,
      amount,
      description = '',
      studentName = '',
      studentEmail = '',
      studentPhone = '',
      course = '',
      courseId = null,
      expiresInDays = null,
      expiresAt: customExpiresAt = null,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Payment title/purpose is required',
      });
    }

    const numericAmount = Number(amount);
    if (!numericAmount || isNaN(numericAmount) || numericAmount < 1) {
      return res.status(400).json({
        success: false,
        message: 'A valid payment amount of at least ₹1 is required',
      });
    }

    // Determine expiration date
    let expiresAt = null;
    if (customExpiresAt) {
      expiresAt = new Date(customExpiresAt);
    } else if (expiresInDays && Number(expiresInDays) > 0) {
      expiresAt = new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000);
    }

    const linkId = await generateUniqueLinkId();

    const paymentLink = new PaymentLink({
      linkId,
      title: title.trim(),
      amount: Math.round(numericAmount),
      description: description.trim(),
      studentName: studentName.trim(),
      studentEmail: studentEmail.trim().toLowerCase(),
      studentPhone: studentPhone.trim(),
      course: course.trim(),
      courseId: courseId || null,
      expiresAt,
      createdBy: req.user?._id || null,
      createdByName: req.user?.fullname || req.user?.name || 'Admin',
      status: 'active',
    });

    await paymentLink.save();

    const clientUrl = getClientBaseUrl();
    const paymentUrl = `${clientUrl}/pay/${linkId}`;

    res.status(201).json({
      success: true,
      message: 'Payment link created successfully',
      paymentLink,
      paymentUrl,
    });
  } catch (error) {
    console.error('Error creating payment link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment link',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Get all payment links with filtering & stats
// @route   GET /api/admin/payment-links
// @access  Private/Admin
export const getAllPaymentLinks = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      sort = '-createdAt',
    } = req.query;

    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { linkId: { $regex: s, $options: 'i' } },
        { title: { $regex: s, $options: 'i' } },
        { studentName: { $regex: s, $options: 'i' } },
        { studentEmail: { $regex: s, $options: 'i' } },
        { studentPhone: { $regex: s, $options: 'i' } },
        { course: { $regex: s, $options: 'i' } },
      ];
    }

    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort,
    };

    const result = await PaymentLink.paginate(query, options);

    // Compute stats
    const [totalStats] = await PaymentLink.aggregate([
      {
        $group: {
          _id: null,
          totalLinks: { $sum: 1 },
          paidLinks: {
            $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] },
          },
          activeLinks: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
          },
          totalAmountCollected: {
            $sum: {
              $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0],
            },
          },
        },
      },
    ]);

    const stats = totalStats || {
      totalLinks: 0,
      paidLinks: 0,
      activeLinks: 0,
      totalAmountCollected: 0,
    };

    const clientUrl = getClientBaseUrl();
    const paymentLinksWithUrl = result.docs.map((doc) => {
      const obj = doc.toObject();
      obj.paymentUrl = `${clientUrl}/pay/${obj.linkId}`;
      return obj;
    });

    res.status(200).json({
      success: true,
      count: result.totalDocs,
      totalPages: result.totalPages,
      currentPage: result.page,
      paymentLinks: paymentLinksWithUrl,
      stats,
    });
  } catch (error) {
    console.error('Error fetching payment links:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment links',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Get single payment link by ID
// @route   GET /api/admin/payment-links/:id
// @access  Private/Admin
export const getPaymentLinkById = async (req, res) => {
  try {
    const paymentLink = await PaymentLink.findById(req.params.id)
      .populate('createdBy', 'name fullname email')
      .populate('directPaymentId');

    if (!paymentLink) {
      return res.status(404).json({
        success: false,
        message: 'Payment link not found',
      });
    }

    const clientUrl = getClientBaseUrl();
    const result = paymentLink.toObject();
    result.paymentUrl = `${clientUrl}/pay/${result.linkId}`;

    res.status(200).json({
      success: true,
      paymentLink: result,
    });
  } catch (error) {
    console.error('Error fetching payment link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment link',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Update payment link (only if not yet paid)
// @route   PUT /api/admin/payment-links/:id
// @access  Private/Admin
export const updatePaymentLink = async (req, res) => {
  try {
    const paymentLink = await PaymentLink.findById(req.params.id);

    if (!paymentLink) {
      return res.status(404).json({
        success: false,
        message: 'Payment link not found',
      });
    }

    if (paymentLink.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify a payment link that has already been paid',
      });
    }

    const {
      title,
      amount,
      description,
      studentName,
      studentEmail,
      studentPhone,
      course,
      expiresAt,
    } = req.body;

    if (title) paymentLink.title = title.trim();
    if (amount) paymentLink.amount = Math.round(Number(amount));
    if (description !== undefined) paymentLink.description = description.trim();
    if (studentName !== undefined) paymentLink.studentName = studentName.trim();
    if (studentEmail !== undefined) paymentLink.studentEmail = studentEmail.trim().toLowerCase();
    if (studentPhone !== undefined) paymentLink.studentPhone = studentPhone.trim();
    if (course !== undefined) paymentLink.course = course.trim();
    if (expiresAt !== undefined) paymentLink.expiresAt = expiresAt ? new Date(expiresAt) : null;

    await paymentLink.save();

    res.status(200).json({
      success: true,
      message: 'Payment link updated successfully',
      paymentLink,
    });
  } catch (error) {
    console.error('Error updating payment link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment link',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Cancel/Deactivate a payment link
// @route   PATCH /api/admin/payment-links/:id/cancel
// @access  Private/Admin
export const cancelPaymentLink = async (req, res) => {
  try {
    const paymentLink = await PaymentLink.findById(req.params.id);

    if (!paymentLink) {
      return res.status(404).json({
        success: false,
        message: 'Payment link not found',
      });
    }

    if (paymentLink.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel a payment link that has already been paid',
      });
    }

    paymentLink.status = 'cancelled';
    await paymentLink.save();

    res.status(200).json({
      success: true,
      message: 'Payment link cancelled successfully',
      paymentLink,
    });
  } catch (error) {
    console.error('Error cancelling payment link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel payment link',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Delete a payment link
// @route   DELETE /api/admin/payment-links/:id
// @access  Private/Admin
export const deletePaymentLink = async (req, res) => {
  try {
    const paymentLink = await PaymentLink.findById(req.params.id);

    if (!paymentLink) {
      return res.status(404).json({
        success: false,
        message: 'Payment link not found',
      });
    }

    if (paymentLink.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a paid payment link for audit and record purposes',
      });
    }

    await PaymentLink.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Payment link deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting payment link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete payment link',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// ==========================================
// PUBLIC STUDENT FACING CONTROLLERS
// ==========================================

// @desc    Get public payment link details for student
// @route   GET /api/payments/link/:linkId
// @access  Public
export const getPublicPaymentLink = async (req, res) => {
  try {
    const { linkId } = req.params;

    const paymentLink = await PaymentLink.findOne({ linkId });

    if (!paymentLink) {
      return res.status(404).json({
        success: false,
        message: 'Payment link not found or has been removed',
      });
    }

    // Auto check if expired
    if (
      paymentLink.status === 'active' &&
      paymentLink.expiresAt &&
      new Date(paymentLink.expiresAt) < new Date()
    ) {
      paymentLink.status = 'expired';
      await paymentLink.save();
    }

    // Return sanitized data
    const publicData = {
      linkId: paymentLink.linkId,
      title: paymentLink.title,
      amount: paymentLink.amount,
      description: paymentLink.description,
      studentName: paymentLink.studentName,
      studentEmail: paymentLink.studentEmail,
      studentPhone: paymentLink.studentPhone,
      course: paymentLink.course,
      status: paymentLink.status,
      expiresAt: paymentLink.expiresAt,
      paidAt: paymentLink.paidAt,
      paymentDetails:
        paymentLink.status === 'paid'
          ? {
              paymentId: paymentLink.paymentDetails?.paymentId,
              paidAmount: paymentLink.paymentDetails?.paidAmount,
              payerName: paymentLink.paymentDetails?.payerName,
              payerEmail: paymentLink.paymentDetails?.payerEmail,
            }
          : null,
    };

    res.status(200).json({
      success: true,
      paymentLink: publicData,
    });
  } catch (error) {
    console.error('Error fetching public payment link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load payment link details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Create Razorpay Order for a specific Payment Link
// @route   POST /api/payments/link/:linkId/create-order
// @access  Public
export const createPaymentLinkOrder = async (req, res) => {
  try {
    const { linkId } = req.params;

    const paymentLink = await PaymentLink.findOne({ linkId });

    if (!paymentLink) {
      return res.status(404).json({
        success: false,
        message: 'Payment link not found',
      });
    }

    if (paymentLink.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'This payment link has already been settled',
      });
    }

    if (paymentLink.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'This payment link is no longer valid or has been cancelled',
      });
    }

    if (paymentLink.expiresAt && new Date(paymentLink.expiresAt) < new Date()) {
      paymentLink.status = 'expired';
      await paymentLink.save();
      return res.status(400).json({
        success: false,
        message: 'This payment link has expired',
      });
    }

    const rzp = getRazorpayInstance();
    if (!rzp) {
      return res.status(500).json({
        success: false,
        message: 'Payment gateway configuration error. Please contact support.',
      });
    }

    const options = {
      amount: Math.round(paymentLink.amount * 100), // amount in paise
      currency: 'INR',
      receipt: `pl_${paymentLink.linkId.substring(0, 10)}_${Date.now()}`,
      notes: {
        paymentLinkId: paymentLink._id.toString(),
        linkId: paymentLink.linkId,
        purpose: paymentLink.title,
      },
    };

    const order = await rzp.orders.create(options);

    res.status(201).json({
      success: true,
      order,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Error creating order for payment link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate payment gateway order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Verify Razorpay payment for a Payment Link
// @route   POST /api/payments/link/:linkId/verify
// @access  Public
export const verifyPaymentLinkPayment = async (req, res) => {
  try {
    const { linkId } = req.params;
    const {
      orderId,
      paymentId,
      signature,
      name,
      email,
      phone,
      address = 'Not provided',
    } = req.body;

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing orderId, paymentId, or signature',
      });
    }

    const paymentLink = await PaymentLink.findOne({ linkId });

    if (!paymentLink) {
      return res.status(404).json({
        success: false,
        message: 'Payment link not found',
      });
    }

    // Verify HMAC-SHA256 signature
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${orderId}|${paymentId}`);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== signature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature. Verification failed.',
      });
    }

    // If already marked paid
    if (paymentLink.status === 'paid') {
      return res.status(200).json({
        success: true,
        message: 'Payment was already processed successfully',
        paymentLink,
      });
    }

    const payerName = name || paymentLink.studentName || 'Student';
    const payerEmail = (email || paymentLink.studentEmail || '').toLowerCase().trim();
    const payerPhone = phone || paymentLink.studentPhone || '';

    // Create DirectPayment document for bookkeeping
    const directPayment = new DirectPayment({
      name: payerName,
      email: payerEmail || 'guest@inxyme.com',
      phone: payerPhone || 'Not provided',
      course: paymentLink.course || paymentLink.title,
      address,
      paymentAmount: paymentLink.amount,
      paymentId,
      orderId,
      status: 'completed',
      paymentMethod: 'razorpay',
      paymentDate: new Date(),
    });

    await directPayment.save();

    // Update payment link
    paymentLink.status = 'paid';
    paymentLink.paidAt = new Date();
    paymentLink.directPaymentId = directPayment._id;
    paymentLink.paymentDetails = {
      paymentId,
      orderId,
      signature,
      paidAmount: paymentLink.amount,
      payerName,
      payerEmail,
      payerPhone,
      payerAddress: address,
    };

    await paymentLink.save();

    // Update candidate if email exists
    if (payerEmail) {
      try {
        await Candidate.findOneAndUpdate(
          { email: payerEmail },
          {
            $set: {
              isPaymentDone: true,
              paymentId: paymentId,
              paymentRecordId: directPayment._id,
              paymentDetails: {
                amount: paymentLink.amount,
                date: new Date(),
                status: 'completed',
                orderId: orderId,
                paymentMethod: 'razorpay',
                directPaymentId: directPayment._id,
              },
            },
          },
          { new: true, upsert: false }
        );
      } catch (err) {
        console.error('Error updating candidate record for payment link:', err);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      receipt: {
        paymentId,
        orderId,
        amount: paymentLink.amount,
        title: paymentLink.title,
        course: paymentLink.course,
        paidAt: paymentLink.paidAt,
        payerName,
        payerEmail,
      },
    });
  } catch (error) {
    console.error('Error verifying payment link payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
