import pg from 'pg';
import { query } from '../config/database.js';
import { Loan } from '../domain/models/loan.model.js';

export interface BorrowerFilterParams {
  cohort: string;
  page?: number;
  limit?: number;
  sortBy?: 'od_days' | 'outstanding_principal' | 'ability_score' | 'intent_score';
  sortOrder?: 'ASC' | 'DESC';
  state?: string;
  product?: string;
  od_bucket?: string;
  minOutstanding?: number;
  maxOutstanding?: number;
}

export interface PaginatedBorrowersResult {
  cohort: string;
  pagination: {
    page: number;
    limit: number;
    totalRecords: number;
    totalPages: number;
  };
  items: Array<{
    loanNo: string;
    memberName: string;
    mobileNumber: string;
    isValidMobile: boolean;
    state: string;
    district: string;
    product: string;
    odDays: number;
    odBucket: string;
    outstandingPrincipal: number;
    abilityScore: number;
    abilityBand: string;
    intentScore: number;
    intentBand: string;
    cohort: string;
  }>;
}

export function normalizeCohortKey(key: string): string {
  return key.trim().toUpperCase().replace(/[\s\-]+/g, '_');
}

/**
 * Performs transactional bulk upsert for normalized loan records.
 */
export async function batchUpsertLoans(client: pg.PoolClient, loans: Loan[]): Promise<void> {
  if (loans.length === 0) return;

  const valueRows: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  for (const l of loans) {
    const rowPlaceholders = [
      `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`,
      `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`,
      `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`,
      `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`,
      `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`,
      `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`
    ];
    valueRows.push(`(${rowPlaceholders.join(', ')})`);

    params.push(
      l.loan_no,
      l.member_name,
      l.mobile_number,
      l.is_valid_mobile,
      l.state,
      l.district,
      l.rural_urban,
      l.product,
      l.disbursement_date,
      l.tenure,
      l.total_instal,
      l.principal_total,
      l.outstanding_principal,
      l.prin_collected,
      l.int_collected,
      l.last_emi,
      l.total_arrear,
      l.total_emi_paid_count,
      l.last_coll_date,
      l.last_coll_amount,
      l.od_days,
      l.od_bucket,
      l.status,
      l.total_income,
      l.total_expense,
      l.foir,
      l.age,
      l.cycle,
      l.paid_within_30d
    );
  }

  const sql = `
    INSERT INTO loans (
      loan_no, member_name, mobile_number, is_valid_mobile, state, district,
      rural_urban, product, disbursement_date, tenure, total_instal,
      principal_total, outstanding_principal, prin_collected, int_collected,
      last_emi, total_arrear, total_emi_paid_count, last_coll_date, last_coll_amount,
      od_days, od_bucket, status, total_income, total_expense, foir, age, cycle,
      paid_within_30d
    )
    VALUES ${valueRows.join(', ')}
    ON CONFLICT (loan_no) DO UPDATE SET
      member_name = EXCLUDED.member_name,
      mobile_number = EXCLUDED.mobile_number,
      is_valid_mobile = EXCLUDED.is_valid_mobile,
      state = EXCLUDED.state,
      district = EXCLUDED.district,
      rural_urban = EXCLUDED.rural_urban,
      product = EXCLUDED.product,
      disbursement_date = EXCLUDED.disbursement_date,
      tenure = EXCLUDED.tenure,
      total_instal = EXCLUDED.total_instal,
      principal_total = EXCLUDED.principal_total,
      outstanding_principal = EXCLUDED.outstanding_principal,
      prin_collected = EXCLUDED.prin_collected,
      int_collected = EXCLUDED.int_collected,
      last_emi = EXCLUDED.last_emi,
      total_arrear = EXCLUDED.total_arrear,
      total_emi_paid_count = EXCLUDED.total_emi_paid_count,
      last_coll_date = EXCLUDED.last_coll_date,
      last_coll_amount = EXCLUDED.last_coll_amount,
      od_days = EXCLUDED.od_days,
      od_bucket = EXCLUDED.od_bucket,
      status = EXCLUDED.status,
      total_income = EXCLUDED.total_income,
      total_expense = EXCLUDED.total_expense,
      foir = EXCLUDED.foir,
      age = EXCLUDED.age,
      cycle = EXCLUDED.cycle,
      paid_within_30d = EXCLUDED.paid_within_30d,
      updated_at = CURRENT_TIMESTAMP;
  `;

  await client.query(sql, params);
}

export async function getLoanByNo(loanNo: string): Promise<Loan | null> {
  const res = await query<Loan>(
    `SELECT * FROM loans WHERE loan_no = $1;`,
    [loanNo]
  );
  return res.rows[0] || null;
}

/**
 * Retrieves index-backed paginated, sorted, and filtered delinquent borrowers in a specific cohort.
 */
export async function getFilteredBorrowersByCohort(
  filters: BorrowerFilterParams
): Promise<PaginatedBorrowersResult> {
  const normalizedCohort = normalizeCohortKey(filters.cohort);
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = ['s.cohort = $1'];
  const params: any[] = [normalizedCohort];
  let paramIdx = 2;

  if (filters.state && filters.state.trim() !== '') {
    conditions.push(`l.state = $${paramIdx++}`);
    params.push(filters.state.trim());
  }
  if (filters.product && filters.product.trim() !== '') {
    conditions.push(`l.product = $${paramIdx++}`);
    params.push(filters.product.trim());
  }
  if (filters.od_bucket && filters.od_bucket.trim() !== '') {
    conditions.push(`l.od_bucket = $${paramIdx++}`);
    params.push(filters.od_bucket.trim());
  }
  if (filters.minOutstanding !== undefined && Number.isFinite(filters.minOutstanding)) {
    const minVal = Math.max(0, Number(filters.minOutstanding));
    conditions.push(`l.outstanding_principal >= $${paramIdx++}`);
    params.push(minVal);
  }
  if (filters.maxOutstanding !== undefined && Number.isFinite(filters.maxOutstanding)) {
    const maxVal = Math.max(0, Number(filters.maxOutstanding));
    conditions.push(`l.outstanding_principal <= $${paramIdx++}`);
    params.push(maxVal);
  }

  const whereClause = conditions.join(' AND ');

  const countSql = `
    SELECT COUNT(*)::integer AS total
    FROM loans l
    JOIN scores s ON l.loan_no = s.loan_no
    WHERE ${whereClause};
  `;
  const countRes = await query<{ total: number }>(countSql, params);
  const totalRecords = countRes.rows[0]?.total ?? 0;
  const totalPages = Math.ceil(totalRecords / limit);

  let orderColumn = 'l.od_days';
  if (filters.sortBy === 'outstanding_principal') orderColumn = 'l.outstanding_principal';
  else if (filters.sortBy === 'ability_score') orderColumn = 's.ability_score';
  else if (filters.sortBy === 'intent_score') orderColumn = 's.intent_score';
  else if (filters.sortBy === 'od_days') orderColumn = 'l.od_days';

  const orderDir = filters.sortOrder === 'ASC' ? 'ASC' : 'DESC';

  const dataSql = `
    SELECT
      l.loan_no as "loanNo",
      l.member_name as "memberName",
      l.mobile_number as "mobileNumber",
      l.is_valid_mobile as "isValidMobile",
      l.state,
      l.district,
      l.product,
      l.od_days as "odDays",
      l.od_bucket as "odBucket",
      l.outstanding_principal::numeric as "outstandingPrincipal",
      s.ability_score::numeric as "abilityScore",
      s.ability_band as "abilityBand",
      s.intent_score::numeric as "intentScore",
      s.intent_band as "intentBand",
      s.cohort
    FROM loans l
    JOIN scores s ON l.loan_no = s.loan_no
    WHERE ${whereClause}
    ORDER BY ${orderColumn} ${orderDir}
    LIMIT $${paramIdx++} OFFSET $${paramIdx++};
  `;

  const dataParams = [...params, limit, offset];
  const dataRes = await query(dataSql, dataParams);

  return {
    cohort: normalizedCohort,
    pagination: {
      page,
      limit,
      totalRecords,
      totalPages
    },
    items: dataRes.rows.map((r) => ({
      loanNo: r.loanNo,
      memberName: r.memberName,
      mobileNumber: r.mobileNumber,
      isValidMobile: Boolean(r.isValidMobile),
      state: r.state,
      district: r.district,
      product: r.product,
      odDays: Number(r.odDays),
      odBucket: r.odBucket,
      outstandingPrincipal: Number(r.outstandingPrincipal),
      abilityScore: Number(r.abilityScore),
      abilityBand: r.abilityBand,
      intentScore: Number(r.intentScore),
      intentBand: r.intentBand,
      cohort: r.cohort
    }))
  };
}
