import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    default: 'Website Lead',
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  phone: {
    type: String,
    trim: true,
    match: [/^[\d\s\-+()]*$/, 'Please enter a valid phone number']
  },
  subject: {
    type: String,
    trim: true,
    maxlength: [200, 'Subject cannot exceed 200 characters']
  },
  message: {
    type: String,
    trim: true,
    maxlength: [2000, 'Message cannot exceed 2000 characters']
  },
  courseId: {
    type: String,
    trim: true,
    index: true
  },
  courseTitle: {
    type: String,
    trim: true,
    maxlength: [200, 'Course title is too long']
  },
  source: {
    type: String,
    trim: true,
    default: 'website'
  },
  pageUrl: {
    type: String,
    trim: true,
  },
  sessionFingerprint: {
    type: String,
    index: true,
  },
  visitorId: {
    type: String,
    index: true,
  },
  trackingId: {
    type: String,
    index: true,
  },
  fingerprint: {
    type: String,
    index: true,
  },
  device: {
    os: { type: String, default: "" },
    browser: { type: String, default: "" },
    deviceType: { type: String, default: "" },
    screenResolution: { type: String, default: "" },
  },
  totalVisits: {
    type: Number,
    default: 1,
  },
  pageViews: {
    type: Number,
    default: 1,
  },
  lastPageVisited: {
    type: String,
    trim: true,
  },
  visitHistory: [
    {
      pageUrl: String,
      pageTitle: String,
      visitedAt: { type: Date, default: Date.now },
      _id: false,
    },
  ],
  isPartial: {
    type: Boolean,
    default: false,
    index: true,
  },
  status: {
    type: String,
    enum: {
      values: ['new', 'contacted', 'in_progress', 'resolved', 'spam', 'partial', 'converted'],
      message: 'Invalid status value'
    },
    default: 'new',
    index: true
  },
  submittedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  notes: [{
    content: String,
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
contactSchema.index({ email: 1, status: 1 });
contactSchema.index({ status: 1, submittedAt: -1 });
contactSchema.index({ course: 1, submittedAt: -1 });

// Virtual for contact URL
contactSchema.virtual('url').get(function() {
  return `/admin/contacts/${this._id}`;
});

// Pre-save hook to update lastUpdated timestamp
contactSchema.pre('save', function(next) {
  this.lastUpdated = Date.now();
  next();
});

// Static method to get contacts by status
contactSchema.statics.findByStatus = function(status) {
  return this.find({ status }).sort({ submittedAt: -1 });
};

const Contact = mongoose.model('Contact', contactSchema);

export default Contact;
