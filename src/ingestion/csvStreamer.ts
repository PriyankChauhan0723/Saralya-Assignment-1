import fs from 'node:fs';
import readline from 'node:readline';
import { getClient } from '../config/database.js';
import { normalizeRawRow } from './dataNormalizer.js';
import { calculateBorrowerScore } from '../domain/scoring/scoreEngine.js';
import { batchUpsertLoans } from '../repositories/loanRepository.js';
import { batchUpsertScores } from '../repositories/scoreRepository.js';
import { updateImportJobProgress, completeImportJob, failImportJob } from '../repositories/importJobRepository.js';
import { Loan } from '../domain/models/loan.model.js';
import { BorrowerScore } from '../domain/models/score.model.js';

const BATCH_SIZE = 500;

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Memory-bounded streaming pipeline for ingesting and auto-scoring portfolio CSV dumps.
 * Uses sequential asynchronous line iteration with transactional batch commits.
 */
export async function processCsvStream(
  filePath: string,
  jobId: string,
  snapshotDate: Date = new Date('2024-03-31')
): Promise<{ totalProcessed: number; failedCount: number }> {
  console.log(`[Ingestion Job ${jobId}]: Starting streaming processing of ${filePath}`);

  let totalProcessed = 0;
  let failedCount = 0;
  let headers: string[] = [];
  let isFirstLine = true;

  let currentBatchLoans: Loan[] = [];
  let currentBatchScores: BorrowerScore[] = [];

  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const client = await getClient();

  try {
    const flushBatch = async () => {
      if (currentBatchLoans.length === 0) return;

      try {
        await client.query('BEGIN');
        await batchUpsertLoans(client, currentBatchLoans);
        await batchUpsertScores(client, currentBatchScores);
        await client.query('COMMIT');

        totalProcessed += currentBatchLoans.length;

        if (totalProcessed % 2500 === 0 || totalProcessed < 2500) {
          await updateImportJobProgress(jobId, totalProcessed, failedCount);
        }
      } catch (err: any) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`[Ingestion Job ${jobId}] Batch transaction failed:`, err.message);
        failedCount += currentBatchLoans.length;
      } finally {
        currentBatchLoans = [];
        currentBatchScores = [];
      }
    };

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (isFirstLine) {
        headers = parseCsvLine(trimmed);
        isFirstLine = false;
        continue;
      }

      const values = parseCsvLine(trimmed);
      const rawRow: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        rawRow[headers[i]] = values[i] ?? '';
      }

      try {
        const loan = normalizeRawRow(rawRow);
        const score = calculateBorrowerScore(loan, snapshotDate);

        currentBatchLoans.push(loan);
        currentBatchScores.push(score);

        if (currentBatchLoans.length >= BATCH_SIZE) {
          await flushBatch();
        }
      } catch (err) {
        failedCount++;
      }
    }

    await flushBatch();
    await completeImportJob(jobId, totalProcessed + failedCount, totalProcessed, failedCount);
    console.log(`[Ingestion Job ${jobId}]: Successfully completed. Processed: ${totalProcessed}, Failed: ${failedCount}`);

    return { totalProcessed, failedCount };
  } catch (err: any) {
    console.error(`[Ingestion Job ${jobId}] Fatal error during stream processing:`, err);
    await failImportJob(jobId, err.message || 'Fatal stream processing error');
    throw err;
  } finally {
    client.release();
    if (filePath.includes('uploads') && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        // Safe temp file cleanup
      }
    }
  }
}
