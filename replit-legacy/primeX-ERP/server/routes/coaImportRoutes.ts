import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { isAuthenticated, requireRole } from '../middleware/auth';
import { secureFileUpload } from '../middleware/security';
import { importCOAFromExcel } from '../services/coaImporter';

const router = express.Router();

const uploadDir = path.join(process.cwd(), 'server', 'uploads', 'coa');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are accepted'));
    }
  },
});

router.post(
  '/tenants/:tenantId/coa/reset-from-excel',
  isAuthenticated,
  upload.single('file'),
  secureFileUpload,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const userRole = (req as any).user?.role;
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'No Excel file uploaded. Please upload an .xlsx or .xls file.' });
      }
      const filePath = req.file.path;

      const cutoverDate = req.body.cutover || req.body.cutover_date || '2026-02-15';
      const dryRun = req.body.dry_run === true || req.body.dry_run === 'true' || req.body.dryRun === true || req.body.dryRun === 'true';

      const result = await importCOAFromExcel(tenantId, filePath, cutoverDate, dryRun);

      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch (cleanupErr) {
          console.error('Error cleaning up uploaded COA file:', cleanupErr);
        }
      }

      const statusCode = result.success ? 200 : 422;
      return res.status(statusCode).json(result);
    } catch (error: any) {
      console.error('COA import error:', error);
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch (cleanupErr) {
          console.error('Error cleaning up uploaded COA file after import error:', cleanupErr);
        }
      }
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to import COA',
        validationErrors: [error.message],
      });
    }
  }
);

export default router;
