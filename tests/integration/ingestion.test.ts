import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runMigrations } from '../../src/database/migrate.js';
import { normalizeRawRow, validateIndianMobile } from '../../src/ingestion/dataNormalizer.js';
import { processCsvStream } from '../../src/ingestion/csvStreamer.js';
import { createImportJob, getImportJobById } from '../../src/repositories/importJobRepository.js';
import { getLoanByNo } from '../../src/repositories/loanRepository.js';
import { getScoreByLoanNo, getCohortSummary } from '../../src/repositories/scoreRepository.js';
import { query, pool } from '../../src/config/database.js';

describe('Phase 2 Ingestion & PostgreSQL Persistence Tests', () => {
  const testFixtureCsv = path.resolve(process.cwd(), 'data/test_fixture.csv');

  beforeAll(async () => {
    // Ensure migrations are run on PostgreSQL
    await runMigrations();

    // Create a small multi-row fixture with dirty data edge cases
    const csvContent = [
      'LOAN_NO,MEMBER_NAME,MOBILE_NUMBER,STATE,DISTRICT,RURAL_URBAN,PRODUCT,DISBURSEMENT_DATE,TENURE,TOTAL_INSTAL,PRINCIPAL_TOTAL,OUTSTANDING_PRINCIPAL,PRIN_COLLECTED,INT_COLLECTED,LAST_EMI,TOTAL_ARREAR,Total_EMI_Paid_Count,LAST_COLL_DATE,LAST_COLL_AMOUNT,OD_DAYS,OD_BUCKET,STATUS,TOTAL_INCOME,TOTAL_EXPENSE,FOIR,AGE,CYCLE,PAID_WITHIN_30D,AMOUNT_PAID_30D',
      'LN_TEST_001,Sunita Devi,9876543210,Bihar,Patna,RURAL,JLG,2023-06-15,24,24,50000,15000,35000,6300,2600,5200,18,2024-02-28,2600,32,31-60,Active,35000,18000,0.5143,34,2,1,2600',
      'LN_TEST_002,Anita Kumari,022-2849102,Uttar Pradesh,Varanasi,URBAN,Micro-Enterprise,2023-01-10,12,12,30000,34000,5000,1200,2800,8400,3,2023-10-15,,140,91-180,Active,,,0.8200,42,1,0,0',
      'LN_TEST_003,Rekha Bai,8765432109,Odisha,Puri,RURAL,JLG,2023-08-01,24,24,60000,0,60000,10800,3000,0,24,2024-03-31,3000,0,0-30,Active,45000,20000,0.4444,29,3,1,3000'
    ].join('\n');

    fs.writeFileSync(testFixtureCsv, csvContent, 'utf8');
  });

  afterAll(async () => {
    // Cleanup fixture file
    if (fs.existsSync(testFixtureCsv)) {
      fs.unlinkSync(testFixtureCsv);
    }
    // Clean test records
    await query(`DELETE FROM loans WHERE loan_no LIKE 'LN_TEST_%';`);
    await pool.end();
  });

  it('1. should validate Indian phone numbers and reject landlines/malformed numbers', () => {
    expect(validateIndianMobile('9876543210')).toBe(true);
    expect(validateIndianMobile('+919876543210')).toBe(true);
    expect(validateIndianMobile('022-2849102')).toBe(false); // Landline
    expect(validateIndianMobile('12345')).toBe(false);       // Incomplete
    expect(validateIndianMobile('5555555555')).toBe(false);  // Invalid starting digit
  });

  it('2. should normalize dirty raw row and preserve missing numeric strings as null', () => {
    const raw = {
      'LOAN_NO': 'LN_TEST_002',
      'MEMBER_NAME': 'Anita Kumari',
      'MOBILE_NUMBER': '022-2849102',
      'PRINCIPAL_TOTAL': '30000',
      'OUTSTANDING_PRINCIPAL': '34000',
      'LAST_COLL_AMOUNT': '', // Blank
      'TOTAL_INCOME': '',     // Blank
      'FOIR': '0.82'
    };

    const normalized = normalizeRawRow(raw);
    expect(normalized.loan_no).toBe('LN_TEST_002');
    expect(normalized.is_valid_mobile).toBe(false);
    expect(normalized.last_coll_amount).toBeNull();
    expect(normalized.total_income).toBeNull();
    expect(normalized.foir).toBe(0.82);
    expect(normalized.outstanding_principal).toBe(34000);
  });

  it('3. should stream CSV fixture, persist loans and auto-computed scores in PostgreSQL', async () => {
    const jobId = await createImportJob('test_fixture.csv');
    const result = await processCsvStream(testFixtureCsv, jobId);

    expect(result.totalProcessed).toBe(3);
    expect(result.failedCount).toBe(0);

    const job = await getImportJobById(jobId);
    expect(job?.status).toBe('COMPLETED');
    expect(job?.processed_rows).toBe(3);

    // Verify loan 1 in DB
    const loan1 = await getLoanByNo('LN_TEST_001');
    expect(loan1).toBeDefined();
    expect(loan1?.member_name).toBe('Sunita Devi');
    expect(loan1?.is_valid_mobile).toBe(true);

    // Verify auto-computed score in DB
    const score1 = await getScoreByLoanNo('LN_TEST_001');
    expect(score1).toBeDefined();
    expect(Number(score1.abilityScore)).toBeGreaterThan(0);
    expect(Number(score1.intentScore)).toBeGreaterThan(0);
    expect(score1.cohort).toBeDefined();
  });

  it('4. should guarantee idempotency by updating records without creating duplicates on re-import', async () => {
    const jobId2 = await createImportJob('test_fixture_reimport.csv');
    await processCsvStream(testFixtureCsv, jobId2);

    const countRes = await query<{ count: number }>(
      `SELECT COUNT(*)::integer as count FROM loans WHERE loan_no LIKE 'LN_TEST_%';`
    );
    expect(countRes.rows[0].count).toBe(3); // Exactly 3 records, 0 duplicates
  });

  it('5. should aggregate 3x3 cohort matrix summary correctly from PostgreSQL', async () => {
    const summary = await getCohortSummary();
    expect(summary.totalBorrowers).toBeGreaterThanOrEqual(3);
    expect(summary.totalPortfolioOutstanding).toBeGreaterThan(0);
    expect(summary.grid.HIGH_ABILITY).toBeDefined();
    expect(summary.grid.MED_ABILITY).toBeDefined();
    expect(summary.grid.LOW_ABILITY).toBeDefined();
  });
});
