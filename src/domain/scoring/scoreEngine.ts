import { Loan } from '../models/loan.model.js';
import { BorrowerScore, ScoreSimulationResult } from '../models/score.model.js';
import { computeAbilityScore } from './abilityScorecard.js';
import { computeIntentScore } from './intentModel.js';
import { classifyCohort } from './cohortClassifier.js';
import { generateAgentCallScript } from './explainability.js';

/**
 * Computes complete borrower assessment including Ability, Intent, Bands, Cohort, and Call Script.
 */
export function calculateBorrowerScore(
  loan: Loan,
  snapshotDate: Date = new Date('2024-03-31')
): BorrowerScore {
  const { abilityScore, factorBreakdown: abilityFactors } = computeAbilityScore(loan, snapshotDate);
  const { intentScore, modelVersion, factorBreakdown: intentFactors } = computeIntentScore(loan, snapshotDate);
  const { abilityBand, intentBand, cohort } = classifyCohort(abilityScore, intentScore);

  const agentCallScript = generateAgentCallScript(
    loan.member_name,
    abilityScore,
    abilityBand,
    intentScore,
    intentBand,
    cohort,
    abilityFactors
  );

  return {
    loanNo: loan.loan_no,
    abilityScore,
    abilityBand,
    intentScore,
    intentBand,
    cohort,
    modelVersion,
    factorBreakdown: {
      ability: abilityFactors,
      intent: intentFactors
    },
    agentCallScript,
    computedAt: new Date()
  };
}

/**
 * Simulates in-memory score and cohort recalculation for live what-if questions without persisting to database.
 */
export function simulateBorrowerScore(
  baseLoan: Loan,
  overrides: Partial<Loan>,
  snapshotDate: Date = new Date('2024-03-31')
): ScoreSimulationResult {
  const baseline = calculateBorrowerScore(baseLoan, snapshotDate);

  const simulatedLoan: Loan = {
    ...baseLoan,
    ...overrides
  };

  if (overrides.last_coll_amount !== undefined && overrides.last_coll_amount !== null && overrides.last_coll_amount > 0) {
    const payment = Number(overrides.last_coll_amount);
    
    if (overrides.outstanding_principal === undefined) {
      simulatedLoan.outstanding_principal = Math.max(0, (baseLoan.outstanding_principal ?? 0) - payment);
    }
    if (overrides.prin_collected === undefined) {
      simulatedLoan.prin_collected = Math.min(baseLoan.principal_total, (baseLoan.prin_collected ?? 0) + payment);
    }
    if (overrides.last_coll_date === undefined) {
      simulatedLoan.last_coll_date = snapshotDate.toISOString().split('T')[0];
    }
    if (overrides.total_arrear === undefined) {
      simulatedLoan.total_arrear = Math.max(0, (baseLoan.total_arrear ?? 0) - payment);
    }
  }

  const simulated = calculateBorrowerScore(simulatedLoan, snapshotDate);

  const deltaAbility = Number((simulated.abilityScore - baseline.abilityScore).toFixed(2));
  const deltaIntent = Number((simulated.intentScore - baseline.intentScore).toFixed(2));
  const cohortChanged = baseline.cohort !== simulated.cohort;

  let simulationSummary = `Simulated overrides resulted in Ability: ${simulated.abilityScore.toFixed(1)} (${deltaAbility >= 0 ? '+' : ''}${deltaAbility}) and Intent: ${simulated.intentScore.toFixed(1)} (${deltaIntent >= 0 ? '+' : ''}${deltaIntent}).`;
  if (cohortChanged) {
    simulationSummary += ` Cohort shifted from ${baseline.cohort} to ${simulated.cohort}.`;
  } else {
    simulationSummary += ` Borrower remains in the ${baseline.cohort} cohort.`;
  }

  return {
    loanNo: baseLoan.loan_no,
    baseline: {
      abilityScore: baseline.abilityScore,
      abilityBand: baseline.abilityBand,
      intentScore: baseline.intentScore,
      intentBand: baseline.intentBand,
      cohort: baseline.cohort
    },
    simulated: {
      abilityScore: simulated.abilityScore,
      abilityBand: simulated.abilityBand,
      intentScore: simulated.intentScore,
      intentBand: simulated.intentBand,
      cohort: simulated.cohort
    },
    deltas: {
      deltaAbility,
      deltaIntent,
      cohortChanged
    },
    simulationSummary,
    simulatedScore: simulated
  };
}
