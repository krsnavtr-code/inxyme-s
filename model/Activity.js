import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  questionText: {
    type: String,
    required: true,
    trim: true,
  },
  maxMarks: {
    type: Number,
    default: 10,
  },
  hint: {
    type: String,
    default: '',
  },
});

const submissionAnswerSchema = new mongoose.Schema({
  questionIndex: {
    type: Number,
    required: true,
  },
  questionText: {
    type: String,
    default: '',
  },
  studentAnswer: {
    type: String,
    required: true,
    trim: true,
  },
});

const submissionSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  answers: [submissionAnswerSchema],
  submittedAt: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['Submitted', 'Reviewed', 'Graded'],
    default: 'Submitted',
  },
  marksObtained: {
    type: Number,
  },
  feedback: {
    type: String,
    default: '',
  },
});

const activitySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Batch',
    },
    activityType: {
      type: String,
      default: 'Quiz',
    },
    questions: {
      type: [questionSchema],
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length >= 1 && v.length <= 3;
        },
        message: 'An activity quiz must have between 1 and 3 questions',
      },
    },
    submissions: [submissionSchema],
    deadline: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['Published', 'Draft', 'Archived'],
      default: 'Published',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

const Activity = mongoose.model('Activity', activitySchema);
export default Activity;

