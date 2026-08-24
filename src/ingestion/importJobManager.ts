import { createImportJob } from '../repositories/importJobRepository.js';
import { processCsvStream } from './csvStreamer.js';

export async function startAsyncImportJob(
  filePath: string,
  filename: string
): Promise<{ importId: string }> {
  // 1. Create job in PostgreSQL immediately
  const importId = await createImportJob(filename);

  // 2. Launch processing asynchronously in background (non-blocking)
  setImmediate(() => {
    processCsvStream(filePath, importId).catch((err) => {
      console.error(`Unhandled error during async background job ${importId}:`, err);
    });
  });

  return { importId };
}
