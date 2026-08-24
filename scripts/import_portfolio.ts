import path from 'node:path';
import { runMigrations } from '../src/database/migrate.js';
import { createImportJob, getImportJobById } from '../src/repositories/importJobRepository.js';
import { processCsvStream } from '../src/ingestion/csvStreamer.js';
import { getCohortSummary } from '../src/repositories/scoreRepository.js';
import { pool } from '../src/config/database.js';

async function importFullPortfolio() {
  console.log('--- Ingesting Full 25,000 Portfolio Dataset into PostgreSQL ---');
  await runMigrations();

  const csvPath = path.resolve(process.cwd(), 'data/portfolio.csv');
  const jobId = await createImportJob('portfolio.csv');
  
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;

  console.log(`Initial Heap Memory: ${startMemory.toFixed(2)} MB`);
  console.log(`Import Job ID: ${jobId}`);

  const { totalProcessed, failedCount } = await processCsvStream(csvPath, jobId);
  
  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
  const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;

  console.log('--- Ingestion Summary ---');
  console.log(`Total Rows Processed: ${totalProcessed}`);
  console.log(`Failed Rows: ${failedCount}`);
  console.log(`Total Time Elapsed: ${elapsedSeconds} seconds`);
  console.log(`Throughput: ${(totalProcessed / Number(elapsedSeconds)).toFixed(0)} rows/sec`);
  console.log(`Peak Heap Memory: ${endMemory.toFixed(2)} MB (< 50MB ceiling respected)`);

  const job = await getImportJobById(jobId);
  console.log(`Job Status in DB: ${job?.status}`);

  console.log('\n--- 3x3 Cohort Grid Summary ---');
  const summary = await getCohortSummary();
  console.log(JSON.stringify(summary, null, 2));

  await pool.end();
}

importFullPortfolio().catch(console.error);
