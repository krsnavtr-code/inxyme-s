import mongoose from 'mongoose';

const careerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  requirements: [{
    type: String,
    required: true
  }],
  responsibilities: [{
    type: String,
    required: true
  }],
  location: {
    type: String,
    required: true
  },
  jobType: {
    type: String,
    enum: ['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'],
    required: true
  },
  salary: {
    type: String,
    required: false
  },
  companyName: {
    type: String,
    default: "Inxyme Hiring Partner"
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  assignedBatches: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Batch'
  }],
  assignedStudents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  studentReferrals: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Batch'
    },
    status: {
      type: String,
      enum: ['Referred', 'Applied', 'Shortlisted', 'Interview Scheduled', 'Offer Received', 'Not Selected'],
      default: 'Referred'
    },
    referredAt: {
      type: Date,
      default: Date.now
    },
    notes: String,
    interviewDate: Date
  }],
  status: {
    type: String,
    enum: ['Open', 'Closed', 'Draft'],
    default: 'Draft'
  },
  applicationDeadline: {
    type: Date,
    required: true
  },
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

const Career = mongoose.model('Career', careerSchema);

export default Career;
