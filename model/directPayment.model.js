import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

const directPaymentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      match: [/\S+@\S+\.\S+/, 'Please enter a valid email'],
    },
    phone: {
      type: String,
      trim: true,
      default: 'Not provided',
    },
    course: {
      type: String,
      required: [true, 'Course name is required'],
      trim: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      default: null,
    },
    address: {
      type: String,
      trim: true,
      default: 'Not provided',
    },
    paymentAmount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0, 'Payment amount cannot be negative'],
    },
    totalCourseFee: {
      type: Number,
      min: [0, 'Total course fee cannot be negative'],
      default: null,
    },
    discountAmount: {
      type: Number,
      min: [0, 'Discount amount cannot be negative'],
      default: 0,
    },
    previouslyPaidAmount: {
      type: Number,
      min: [0, 'Previously paid amount cannot be negative'],
      default: 0,
    },
    balanceDue: {
      type: Number,
      min: [0, 'Balance due cannot be negative'],
      default: 0,
    },
    installmentLabel: {
      type: String,
      trim: true,
      default: 'Full Course Fee',
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled'],
      default: 'pending',
    },
    paymentMethod: {
      type: String,
      enum: ['razorpay', 'upi', 'bank_transfer', 'cash', 'card', 'cheque', 'other'],
      default: 'razorpay',
    },
    paymentId: {
      type: String,
      trim: true,
      default: '',
    },
    orderId: {
      type: String,
      trim: true,
      default: '',
    },
    transactionId: {
      type: String,
      trim: true,
      default: '',
    },
    invoiceNumber: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    gstRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 18,
    },
    gstInclusive: {
      type: Boolean,
      default: true,
    },
    companyGstin: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    studentGstin: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    source: {
      type: String,
      enum: ['direct_form', 'payment_link', 'admin_manual'],
      default: 'direct_form',
    },
    isCompanyRegistration: {
      type: Boolean,
      default: false,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdByName: {
      type: String,
      trim: true,
      default: '',
    },
    invoiceSent: {
      type: Boolean,
      default: false,
    },
    invoiceSentAt: {
      type: Date,
      default: null,
    },
    invoiceSentCount: {
      type: Number,
      default: 0,
    },
    invoiceLastSentTo: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    invoiceEmailSubject: {
      type: String,
      trim: true,
      default: '',
    },
    invoiceEmailMessage: {
      type: String,
      default: '',
    },
    pendingAlertSent: {
      type: Boolean,
      default: false,
    },
    pendingAlertSentAt: {
      type: Date,
      default: null,
    },
    pendingAlertSentCount: {
      type: Number,
      default: 0,
    },
    pendingAlertLastSentTo: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    pendingAlertEmailSubject: {
      type: String,
      trim: true,
      default: '',
    },
    pendingAlertEmailMessage: {
      type: String,
      default: '',
    },
    pendingAlertLastDueDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Add indexes for better query performance
directPaymentSchema.index({ email: 1, paymentDate: -1 });
directPaymentSchema.index({ userId: 1, createdAt: -1 });
directPaymentSchema.index({ status: 1, createdAt: -1 });

// Add pagination plugin
directPaymentSchema.plugin(mongoosePaginate);

const DirectPayment = mongoose.model('DirectPayment', directPaymentSchema);

export default DirectPayment;
