import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { 
  uploadDocuments, 
  uploadProposalDocuments, 
  deleteProposalDocument 
} from '../controller/proposalDocumentController.js';
import multer from 'multer';
import AppError from '../utils/appError.js';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

// Protect all routes and restrict to admin users
router.use(protect);
router.use(authorize('admin'));

// Increase request timeout for file uploads
router.use((req, res, next) => {
  req.setTimeout(300000); // 5 minutes
  res.setTimeout(300000);
  next();
});

// Upload proposal documents
router.post(
  '/upload-proposal-documents',
  (req, res, next) => {
    uploadDocuments(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          // A Multer error occurred when uploading
          if (err.code === 'LIMIT_FILE_SIZE') {
            return next(new AppError('File size too large. Maximum 10MB per file.', 400));
          }
          return next(new AppError(`Upload error: ${err.message}`, 400));
        } else if (err) {
          // An unknown error occurred
          return next(err);
        }
      }
      next();
    });
  },
  uploadProposalDocuments
);

router.get('/proposal-documents', protect, authorize('admin'), async (req, res) => {
    try {
        const uploadDir = path.join(process.cwd(), 'public', 'proposal_documents');
        await fs.mkdir(uploadDir, { recursive: true });
        const files = await fs.readdir(uploadDir);
        res.json({
            success: true,
            files: files.filter(file => !file.startsWith('.')) // Filter out hidden files
        });
    } catch (error) {
        console.error('Error reading files:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch files',
            error: error.message
        });
    }
});

// Delete proposal document
router.delete('/delete-proposal-document', deleteProposalDocument);

export default router;
