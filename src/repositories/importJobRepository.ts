import { query } from '../config/database.js';

export interface ImportJobRecord {
  id: string;
  filename: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  total_rows: number;
  processed_rows: number;
  failed_rows: number;
  error_log: any[];
  created_at: Date;
  completed_at: Date | null;
}

export async function createImportJob(filename: string): Promise<string> {
  const res = await query<{ id: string }>(
    `INSERT INTO import_jobs (filename, status, created_at)
     VALUES ($1, 'PROCESSING', CURRENT_TIMESTAMP)
     RETURNING id;`,
    [filename]
  );
  return res.rows[0].id;
}

export async function updateImportJobProgress(
  jobId: string,
  processedRows: number,
  failedRows: number,
  totalRows?: number
): Promise<void> {
  if (totalRows !== undefined && totalRows > 0) {
    await query(
      `UPDATE import_jobs
       SET processed_rows = $2, failed_rows = $3, total_rows = $4
       WHERE id = $1;`,
      [jobId, processedRows, failedRows, totalRows]
    );
  } else {
    await query(
      `UPDATE import_jobs
       SET processed_rows = $2, failed_rows = $3
       WHERE id = $1;`,
      [jobId, processedRows, failedRows]
    );
  }
}

export async function completeImportJob(
  jobId: string,
  totalRows: number,
  processedRows: number,
  failedRows: number
): Promise<void> {
  await query(
    `UPDATE import_jobs
     SET status = 'COMPLETED',
         total_rows = $2,
         processed_rows = $3,
         failed_rows = $4,
         completed_at = CURRENT_TIMESTAMP
     WHERE id = $1;`,
    [jobId, totalRows, processedRows, failedRows]
  );
}

export async function failImportJob(jobId: string, errorMessage: string): Promise<void> {
  await query(
    `UPDATE import_jobs
     SET status = 'FAILED',
         error_log = jsonb_build_array(jsonb_build_object('error', $2::text, 'timestamp', CURRENT_TIMESTAMP)),
         completed_at = CURRENT_TIMESTAMP
     WHERE id = $1;`,
    [jobId, errorMessage]
  );
}

export async function getImportJobById(jobId: string): Promise<ImportJobRecord | null> {
  const res = await query<ImportJobRecord>(
    `SELECT * FROM import_jobs WHERE id = $1;`,
    [jobId]
  );
  return res.rows[0] || null;
}
