import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../../src/api/app.js';
import { runMigrations } from '../../src/database/migrate.js';
import { pool, query } from '../../src/config/database.js';

describe('Phase 3 REST API End-to-End Integration Tests', () => {
  const apiKey = 'saralcollect_secret_key_2026';
  const testCsvPath = path.resolve(process.cwd(), 'data/api_test_fixture.csv');
  const invalidTxtPath = path.resolve(process.cwd(), 'data/invalid_test.txt');
  let testImportId = '';

  beforeAll(async () => {
    await runMigrations();

    const csvContent = [
      'LOAN_NO,MEMBER_NAME,MOBILE_NUMBER,STATE,DISTRICT,RURAL_URBAN,PRODUCT,DISBURSEMENT_DATE,TENURE,TOTAL_INSTAL,PRINCIPAL_TOTAL,OUTSTANDING_PRINCIPAL,PRIN_COLLECTED,INT_COLLECTED,LAST_EMI,TOTAL_ARREAR,Total_EMI_Paid_Count,LAST_COLL_DATE,LAST_COLL_AMOUNT,OD_DAYS,OD_BUCKET,STATUS,TOTAL_INCOME,TOTAL_EXPENSE,FOIR,AGE,CYCLE,PAID_WITHIN_30D,AMOUNT_PAID_30D',
      'API_LN_001,Pooja Sharma,9876543210,Bihar,Patna,RURAL,JLG,2023-06-15,24,24,50000,15000,35000,6300,2600,5200,18,2024-02-28,2600,32,31-60,Active,35000,18000,0.5143,34,2,1,2600',
      'API_LN_002,Sunil Verma,022-2849102,Uttar Pradesh,Varanasi,URBAN,Micro-Enterprise,2023-01-10,12,12,30000,34000,5000,1200,2800,8400,3,2023-10-15,,140,91-180,Active,,,0.8200,42,1,0,0',
      'API_LN_003,Guddi Devi,8765432109,Odisha,Puri,RURAL,JLG,2023-08-01,24,24,60000,0,60000,10800,3000,0,24,2024-03-31,3000,0,0-30,Active,45000,20000,0.4444,29,3,1,3000'
    ].join('\n');

    fs.writeFileSync(testCsvPath, csvContent, 'utf8');
    fs.writeFileSync(invalidTxtPath, 'invalid content', 'utf8');
  });

  afterAll(async () => {
    if (fs.existsSync(testCsvPath)) fs.unlinkSync(testCsvPath);
    if (fs.existsSync(invalidTxtPath)) fs.unlinkSync(invalidTxtPath);
    await query(`DELETE FROM loans WHERE loan_no LIKE 'API_LN_%';`);
    await pool.end();
  });

  it('1. GET /health should be public and return 200 without auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('HEALTHY');
  });

  it('2. should reject unauthenticated requests with 401 Unauthorized', async () => {
    const res = await request(app).get('/v1/cohorts/summary');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('3. should reject non-CSV file uploads with 400 Bad Request', async () => {
    const res = await request(app)
      .post('/v1/portfolio/import')
      .set('x-api-key', apiKey)
      .attach('file', invalidTxtPath);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('4. POST /v1/portfolio/import should accept CSV and return 202 with importId', async () => {
    const res = await request(app)
      .post('/v1/portfolio/import')
      .set('x-api-key', apiKey)
      .attach('file', testCsvPath);

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data.importId).toBeDefined();
    expect(res.body.data.status).toBe('PROCESSING');

    testImportId = res.body.data.importId;
    await new Promise((r) => setTimeout(r, 800));
  });

  it('5. GET /v1/portfolio/import/:id should return ingestion status and progress', async () => {
    const res = await request(app)
      .get(`/v1/portfolio/import/${testImportId}`)
      .set('x-api-key', apiKey);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.importId).toBe(testImportId);
    expect(res.body.data.status).toBe('COMPLETED');
    expect(res.body.data.totalRows).toBe(3);
    expect(res.body.data.processedRows).toBe(3);
  });

  it('6. GET /v1/cohorts/summary should return 3x3 matrix in a single response', async () => {
    const res = await request(app)
      .get('/v1/cohorts/summary')
      .set('x-api-key', apiKey);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.grid).toBeDefined();
    expect(res.body.data.grid.HIGH_ABILITY).toBeDefined();
    expect(res.body.data.grid.MED_ABILITY).toBeDefined();
    expect(res.body.data.grid.LOW_ABILITY).toBeDefined();
    expect(res.body.data.totalBorrowers).toBeGreaterThanOrEqual(3);
  });

  it('7. GET /v1/cohorts/:key/borrowers should return paginated and filtered borrowers list', async () => {
    const res = await request(app)
      .get('/v1/cohorts/OOPS/borrowers?page=1&limit=10&sortBy=od_days&sortOrder=ASC')
      .set('x-api-key', apiKey);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.cohort).toBe('OOPS');
    expect(res.body.data.pagination).toBeDefined();
    expect(res.body.data.pagination.page).toBe(1);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('8. GET /v1/borrowers/:loanId/score should return drilldown with speakable agent call script', async () => {
    const res = await request(app)
      .get('/v1/borrowers/API_LN_001/score')
      .set('x-api-key', apiKey);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.loanNo).toBe('API_LN_001');
    expect(res.body.data.summary.abilityScore).toBeGreaterThanOrEqual(0);
    expect(res.body.data.summary.intentScore).toBeGreaterThanOrEqual(0);
    expect(res.body.data.agentCallScript).toBeDefined();
    expect(res.body.data.factorBreakdown.ability.length).toBeGreaterThan(0);
    expect(res.body.data.factorBreakdown.intent.length).toBeGreaterThan(0);
  });

  it('9. POST /v1/score/simulate should return what-if calculation without modifying DB record', async () => {
    const beforeRes = await request(app)
      .get('/v1/borrowers/API_LN_001/score')
      .set('x-api-key', apiKey);

    const baselineAbility = beforeRes.body.data.summary.abilityScore;

    const simRes = await request(app)
      .post('/v1/score/simulate')
      .set('x-api-key', apiKey)
      .send({
        loanId: 'API_LN_001',
        overrides: {
          last_coll_amount: 10000,
          od_days: 0
        }
      });

    expect(simRes.status).toBe(200);
    expect(simRes.body.success).toBe(true);
    expect(simRes.body.data.loanNo).toBe('API_LN_001');
    expect(simRes.body.data.deltas).toBeDefined();
    expect(simRes.body.data.simulationSummary).toBeDefined();

    const afterRes = await request(app)
      .get('/v1/borrowers/API_LN_001/score')
      .set('x-api-key', apiKey);

    expect(afterRes.body.data.summary.abilityScore).toBe(baselineAbility);
  });

  it('10. should return 404 for non-existent borrower or import job', async () => {
    const res = await request(app)
      .get('/v1/borrowers/NON_EXISTENT_LOAN/score')
      .set('x-api-key', apiKey);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('BORROWER_NOT_FOUND');
  });

  it('11. should return 404 for completely unrecognized API routes', async () => {
    const res = await request(app)
      .get('/v1/unrecognized_endpoint')
      .set('x-api-key', apiKey);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('12. should return 400 for invalid query validation schema', async () => {
    const res = await request(app)
      .get('/v1/cohorts/OOPS/borrowers?limit=9999')
      .set('x-api-key', apiKey);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
