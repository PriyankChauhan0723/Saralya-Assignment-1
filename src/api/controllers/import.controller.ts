import { Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { startAsyncImportJob } from '../../ingestion/importJobManager.js';
import { getImportJobById } from '../../repositories/importJobRepository.js';
import { AppError } from '../middlewares/errorHandler.js';

const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${path.basename(file.originalname)}`);
  }
});

const fileFilter = (
  req: Request & { fileValidationError?: string },
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.csv') {
    cb(null, true);
  } else {
    req.fileValidationError = 'Only CSV files with .csv extension are permitted for upload.';
    cb(null, false);
  }
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }
});

export async function importPortfolioHandler(req: Request & { fileValidationError?: string }, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.fileValidationError) {
      throw new AppError(req.fileValidationError, 400, 'INVALID_FILE_TYPE');
    }

    if (!req.file) {
      throw new AppError('No CSV file uploaded. Please provide a "file" field in multipart form-data.', 400, 'FILE_MISSING');
    }

    const filePath = req.file.path;
    const filename = req.file.originalname;

    const { importId } = await startAsyncImportJob(filePath, filename);

    res.status(202).json({
      success: true,
      data: {
        importId,
        filename,
        status: 'PROCESSING',
        message: 'File upload accepted. Ingestion and scoring are running in the background.'
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getImportStatusHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const importId = String(req.params.id);
    const job = await getImportJobById(importId);

    if (!job) {
      throw new AppError(`Import job with ID "${importId}" not found.`, 404, 'JOB_NOT_FOUND');
    }

    res.status(200).json({
      success: true,
      data: {
        importId: job.id,
        filename: job.filename,
        status: job.status,
        totalRows: job.total_rows,
        processedRows: job.processed_rows,
        failedRows: job.failed_rows,
        errorLog: job.error_log,
        createdAt: job.created_at,
        completedAt: job.completed_at
      }
    });
  } catch (err) {
    next(err);
  }
}
