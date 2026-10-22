import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

const paymentLinkSchema = new mongoose.Schema(
  {
    linkId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    title: {
      type: String,
      required: [true, 'Payment title or purpose is required'],
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [1, 'Amount must be at least ₹1'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    studentName: {
      type: String,
      trim: true,
      default: '',
    },
    studentEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    studentPhone: {
      type: String,
      trim: true,
      default: '',
    },
    course: {
      type: String,
      trim: true,
      default: '',
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'paid', 'expired', 'cancelled'],
      default: 'active',
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdByName: {
      type: String,
      default: 'Admin',
    },
    paidAt: {
      type: Date,
      default: null,
    },
    paymentDetails: {
      paymentId: { type: String, default: '' },
      orderId: { type: String, default: '' },
      signature: { type: String, default: '' },
      paidAmount: { type: Number, default: 0 },
      payerName: { type: String, default: '' },
      payerEmail: { type: String, default: '' },
      payerPhone: { type: String, default: '' },
      payerAddress: { type: String, default: '' },
    },
    directPaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DirectPayment',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

paymentLinkSchema.index({ status: 1, createdAt: -1 });
paymentLinkSchema.index({ studentEmail: 1 });
paymentLinkSchema.plugin(mongoosePaginate);

const PaymentLink = mongoose.model('PaymentLink', paymentLinkSchema);

export default PaymentLink;
