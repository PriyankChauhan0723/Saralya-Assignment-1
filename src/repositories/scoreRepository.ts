import pg from 'pg';
import { query } from '../config/database.js';
import { BorrowerScore } from '../domain/models/score.model.js';
import { CohortType, COHORT_DEFINITIONS } from '../domain/models/cohort.model.js';

export interface CohortCellSummary {
  cohort: CohortType;
  displayName: string;
  count: number;
  totalOutstanding: number;
  recommendedAction: string;
  operationalChannel: string;
}

export interface CohortGridSummary {
  grid: {
    HIGH_ABILITY: {
      LOW_INTENT: CohortCellSummary;
      MED_INTENT: CohortCellSummary;
      HIGH_INTENT: CohortCellSummary;
    };
    MED_ABILITY: {
      LOW_INTENT: CohortCellSummary;
      MED_INTENT: CohortCellSummary;
      HIGH_INTENT: CohortCellSummary;
    };
    LOW_ABILITY: {
      LOW_INTENT: CohortCellSummary;
      MED_INTENT: CohortCellSummary;
      HIGH_INTENT: CohortCellSummary;
    };
  };
  totalBorrowers: number;
  totalPortfolioOutstanding: number;
}

/**
 * Performs transactional bulk upsert for computed borrower scores.
 */
export async function batchUpsertScores(
  client: pg.PoolClient,
  scores: BorrowerScore[]
): Promise<void> {
  if (scores.length === 0) return;

  const valueRows: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  for (const s of scores) {
    const rowPlaceholders = [
      `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`,
      `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`, `$${paramIdx++}`,
      `$${paramIdx++}`
    ];
    valueRows.push(`(${rowPlaceholders.join(', ')})`);

    params.push(
      s.loanNo,
      s.abilityScore,
      s.abilityBand,
      s.intentScore,
      s.intentBand,
      s.cohort,
      s.modelVersion,
      JSON.stringify(s.factorBreakdown),
      s.agentCallScript
    );
  }

  const sql = `
    INSERT INTO scores (
      loan_no, ability_score, ability_band, intent_score, intent_band,
      cohort, model_version, factor_breakdown, agent_call_script
    )
    VALUES ${valueRows.join(', ')}
    ON CONFLICT (loan_no) DO UPDATE SET
      ability_score = EXCLUDED.ability_score,
      ability_band = EXCLUDED.ability_band,
      intent_score = EXCLUDED.intent_score,
      intent_band = EXCLUDED.intent_band,
      cohort = EXCLUDED.cohort,
      model_version = EXCLUDED.model_version,
      factor_breakdown = EXCLUDED.factor_breakdown,
      agent_call_script = EXCLUDED.agent_call_script,
      updated_at = CURRENT_TIMESTAMP;
  `;

  await client.query(sql, params);
}

/**
 * Retrieves detailed scorecard, mathematical factors, and phone script for a loan.
 */
export async function getScoreByLoanNo(loanNo: string): Promise<any | null> {
  const sql = `
    SELECT
      s.loan_no as "loanNo",
      l.member_name as "memberName",
      s.ability_score::numeric as "abilityScore",
      s.ability_band as "abilityBand",
      s.intent_score::numeric as "intentScore",
      s.intent_band as "intentBand",
      s.cohort,
      s.model_version as "modelVersion",
      s.factor_breakdown as "factorBreakdown",
      s.agent_call_script as "agentCallScript",
      s.updated_at as "computedAt"
    FROM scores s
    JOIN loans l ON s.loan_no = l.loan_no
    WHERE s.loan_no = $1;
  `;
  const res = await query(sql, [loanNo]);
  if (!res.rows[0]) return null;

  const row = res.rows[0];
  return {
    ...row,
    abilityScore: Number(row.abilityScore),
    intentScore: Number(row.intentScore),
    factorBreakdown: typeof row.factorBreakdown === 'string' ? JSON.parse(row.factorBreakdown) : row.factorBreakdown
  };
}

/**
 * Aggregates borrower counts and total outstanding principal across the 3x3 grid in a single query.
 */
export async function getCohortSummary(): Promise<CohortGridSummary> {
  const sql = `
    SELECT
      s.cohort,
      COUNT(s.loan_no)::integer AS borrower_count,
      COALESCE(SUM(l.outstanding_principal), 0)::numeric AS total_outstanding
    FROM scores s
    JOIN loans l ON s.loan_no = l.loan_no
    GROUP BY s.cohort;
  `;

  const res = await query<{ cohort: string; borrower_count: number; total_outstanding: string }>(sql);

  const summaryMap: Record<string, { count: number; totalOutstanding: number }> = {};
  for (const row of res.rows) {
    summaryMap[row.cohort] = {
      count: Number(row.borrower_count),
      totalOutstanding: Number(row.total_outstanding)
    };
  }

  function getCell(cohort: CohortType): CohortCellSummary {
    const meta = COHORT_DEFINITIONS[cohort];
    const data = summaryMap[cohort] || { count: 0, totalOutstanding: 0 };
    return {
      cohort,
      displayName: meta.displayName,
      count: data.count,
      totalOutstanding: Number(data.totalOutstanding.toFixed(2)),
      recommendedAction: meta.recommendedAction,
      operationalChannel: meta.operationalChannel
    };
  }

  const grid = {
    HIGH_ABILITY: {
      LOW_INTENT: getCell(CohortType.WILFUL_DEFAULTER),
      MED_INTENT: getCell(CohortType.PROCRASTINATOR),
      HIGH_INTENT: getCell(CohortType.OOPS)
    },
    MED_ABILITY: {
      LOW_INTENT: getCell(CohortType.EVASION_RISK),
      MED_INTENT: getCell(CohortType.FENCE_SITTER),
      HIGH_INTENT: getCell(CohortType.CASHFLOW_CRUNCH)
    },
    LOW_ABILITY: {
      LOW_INTENT: getCell(CohortType.LOST_CAUSE),
      MED_INTENT: getCell(CohortType.STRUGGLER),
      HIGH_INTENT: getCell(CohortType.DISTRESSED)
    }
  };

  let totalBorrowers = 0;
  let totalPortfolioOutstanding = 0;

  for (const cellData of Object.values(summaryMap)) {
    totalBorrowers += cellData.count;
    totalPortfolioOutstanding += cellData.totalOutstanding;
  }

  return {
    grid,
    totalBorrowers,
    totalPortfolioOutstanding: Number(totalPortfolioOutstanding.toFixed(2))
  };
}
