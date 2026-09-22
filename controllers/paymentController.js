import DirectPayment from '../model/directPayment.model.js';
import { validationResult } from 'express-validator';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';
import Candidate from '../model/Candidate.js';

// Load environment variables
dotenv.config();

// Initialize Razorpay instance
let razorpay;

const initializeRazorpay = () => {
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      const errorMsg = 'Razorpay credentials are missing. Please check your environment configuration.';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    return true;
  } catch (error) {
    console.error('Failed to initialize Razorpay:', error.message);
    return false;
  }
};

// Initialize on startup
const isRazorpayInitialized = initializeRazorpay();

// @desc    Create a new direct payment
// @route   POST /api/payments/direct
// @access  Public (can be protected if needed)
export const createDirectPayment = async (req, res) => {
  try {
    // Validate request body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const {
      name,
      email,
      phone,
      course,
      address,
      paymentAmount,
      userId = null
    } = req.body;

    // Create new payment record
    const payment = new DirectPayment({
      name,
      email,
      phone,
      course,
      address,
      paymentAmount: Number(paymentAmount),
      userId: userId || null
    });

    await payment.save();

    res.status(201).json({
      success: true,
      message: 'Payment details saved successfully',
      data: {
        paymentId: payment._id,
        name: payment.name,
        email: payment.email,
        amount: payment.paymentAmount,
        status: payment.status
      }
    });

  } catch (error) {
    console.error('Error saving payment details:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing payment details',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Create a Razorpay order
// @route   POST /api/payments/create-order
// @access  Public (or protected as needed)
export const createRazorpayOrder = async (req, res) => {
  try {
    // Try to reinitialize Razorpay if not already initialized
    if (!razorpay || !isRazorpayInitialized) {
      const initialized = initializeRazorpay();
      if (!initialized) {
        console.error('Razorpay initialization failed. Check your environment variables.');
        return res.status(500).json({
          success: false,
          message: 'Payment gateway is not properly configured. Please contact support.'
        });
      }
    }
    const { amount, currency = 'INR', receipt, notes } = req.body;

    if (!amount) {
      return res.status(400).json({
        success: false,
        message: 'Amount is required'
      });
    }

    const options = {
      amount: Math.round(amount), // amount in smallest currency unit (paise for INR)
      currency,
      receipt: receipt || `rcpt_${Date.now()}`,
      payment_capture: 1 // Auto-capture payment
    };

    if (notes) {
      options.notes = notes;
    }

    const order = await razorpay.orders.create(options);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Verify Razorpay payment
// @route   POST /api/payments/verify
// @access  Public (or protected as needed)
export const verifyPayment = async (req, res) => {
  try {
    // Try to reinitialize Razorpay if not already initialized
    if (!razorpay || !isRazorpayInitialized) {
      const initialized = initializeRazorpay();
      if (!initialized) {
        console.error('Razorpay initialization failed during payment verification. Check your environment variables.');
        return res.status(500).json({
          success: false,
          message: 'Payment gateway is not properly configured. Please contact support.'
        });
      }
    }


    const { orderId, paymentId, signature, isCompanyRegistration = false, ...paymentData } = req.body;

    // Validate required fields
    if (!orderId || !paymentId || !signature) {
      console.error('Missing required parameters:', { orderId: !!orderId, paymentId: !!paymentId, signature: !!signature });
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: orderId, paymentId, and signature are required'
      });
    }

    // Validate payment data
    const requiredFields = ['name', 'email', 'phone', 'paymentAmount'];
    if (!isCompanyRegistration) {
      requiredFields.push('course'); // Course is only required for non-company payments
    }

    const missingFields = requiredFields.filter(field => !paymentData[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        missingFields
      });
    }

    // Create the expected signature
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${orderId}|${paymentId}`);
    const generatedSignature = hmac.digest('hex');

    // Compare the signatures
    if (generatedSignature !== signature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature. Payment verification failed.'
      });
    }

    // Check if payment already exists to prevent duplicates
    const existingPayment = await DirectPayment.findOne({ paymentId });
    if (existingPayment) {
      return res.status(200).json({
        success: true,
        message: 'Payment was already processed',
        paymentId: existingPayment._id
      });
    }

    // Save payment details to database
    const payment = new DirectPayment({
      name: paymentData.name,
      email: paymentData.email.toLowerCase().trim(),
      phone: String(paymentData.phone).trim(),
      course: isCompanyRegistration ? 'JobFair Registration' : paymentData.course,
      address: paymentData.address || 'Not provided',
      paymentAmount: Number(paymentData.paymentAmount),
      paymentId,
      orderId,
      status: 'completed',
      paymentMethod: 'razorpay',
      userId: paymentData.userId || null,
      paymentDate: new Date(),
      isCompanyRegistration: isCompanyRegistration || false
    });

    await payment.save();

    // Always try to update the candidate if we have an email, but handle differently based on user type
    if (paymentData.email) {
      const email = paymentData.email.toLowerCase().trim();
      const userType = paymentData.userType || 'student'; // Default to student if not specified

      try {
        const updateData = {
          isPaymentDone: true,
          paymentId: paymentId,
          paymentRecordId: payment._id, // Save the DirectPayment _id
          paymentDetails: {
            amount: Number(paymentData.paymentAmount),
            date: new Date(),
            status: 'completed',
            orderId: orderId,
            paymentMethod: 'razorpay',
            directPaymentId: payment._id // Also include in paymentDetails for backward compatibility
          }
        };
        
        // First, find the candidate to see what we're working with
        const existingCandidate = await Candidate.findOne({ email: email });

        // Update based on the actual userType in the database
        const result = await Candidate.findOneAndUpdate(
          { email: email },
          {
            $set: {
              ...updateData,
              // Only update userType if it's not already set
              ...(existingCandidate && existingCandidate.userType === 'company' ? {} : { userType: userType })
            }
          },
          { new: true, runValidators: true, upsert: false }
        );

        if (!result) {
          console.error(`No company candidate found with email: ${email}`);
          // Try to find any candidate with the email for debugging
          const candidate = await Candidate.findOne({ email: email });
          if (candidate) {
            console.error('Found candidate with different userType:', {
              email: candidate.email,
              userType: candidate.userType,
              _id: candidate._id
            });
          } else {
            console.error('No candidate found with email at all:', email);
          }
        } else {
          
        }
      } catch (error) {
        console.error('Error updating candidate payment status:', error);
        // Don't fail the request, just log the error
      }
    }

    res.status(200).json({
      success: true,
      message: 'Payment verified and recorded successfully',
      paymentId: payment._id,
      isCompanyRegistration: isCompanyRegistration
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get payment details by ID
// @route   GET /api/payments/:id
// @access  Private (Admin or the user who made the payment)
export const getPaymentDetails = async (req, res) => {
  try {
    const payment = await DirectPayment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Check if the user is authorized to view this payment
    // (Only admin/employee or the user who made the payment)
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'employee' || Boolean(req.user.adminRoleId));
    if (payment.userId && payment.userId.toString() !== req.user.id && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this payment'
      });
    }

    res.status(200).json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('Error fetching payment details:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
