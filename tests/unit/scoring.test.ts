import { describe, it, expect } from 'vitest';
import { calculateBorrowerScore, simulateBorrowerScore } from '../../src/domain/scoring/scoreEngine.js';
import { computeAbilityScore } from '../../src/domain/scoring/abilityScorecard.js';
import { classifyCohort, getScoreBand } from '../../src/domain/scoring/cohortClassifier.js';
import { CohortType, ScoreBand } from '../../src/domain/models/cohort.model.js';
import { Loan } from '../../src/domain/models/loan.model.js';

describe('Scoring Engine Unit Tests (Mathematical & Statistical Rigor)', () => {
  const sampleLoan: Loan = {
    loan_no: 'LN1000001',
    member_name: 'Sunita Devi',
    mobile_number: '9876543210',
    is_valid_mobile: true,
    state: 'Bihar',
    district: 'Patna',
    rural_urban: 'RURAL',
    product: 'JLG',
    disbursement_date: '2023-06-15',
    tenure: 24,
    total_instal: 24,
    principal_total: 50000,
    outstanding_principal: 15000,
    prin_collected: 35000,
    int_collected: 6300,
    last_emi: 2600,
    total_arrear: 5200,
    total_emi_paid_count: 18,
    last_coll_date: '2024-02-28',
    last_coll_amount: 2600,
    od_days: 32,
    od_bucket: '31-60',
    status: 'Active',
    total_income: 35000,
    total_expense: 18000,
    foir: 0.5143,
    age: 34,
    cycle: 2,
    paid_within_30d: 1,
    amount_paid_30d: 2600
  };

  it('1. should compute Ability score strictly bounded between 0 and 100', () => {
    const score = calculateBorrowerScore(sampleLoan);
    expect(score.abilityScore).toBeGreaterThanOrEqual(0);
    expect(score.abilityScore).toBeLessThanOrEqual(100);
    expect(score.intentScore).toBeGreaterThanOrEqual(0);
    expect(score.intentScore).toBeLessThanOrEqual(100);
  });

  it('2. should handle missing numeric inputs without substitution by rescaling weights to sum to 1.0', () => {
    const loanWithMissingData: Loan = {
      ...sampleLoan,
      total_income: null,
      foir: null,
      last_coll_amount: null
    };

    const { abilityScore, factorBreakdown } = computeAbilityScore(loanWithMissingData);

    expect(abilityScore).toBeGreaterThanOrEqual(0);
    expect(abilityScore).toBeLessThanOrEqual(100);

    const incomeFactor = factorBreakdown.find((f) => f.factor === 'income_stability');
    expect(incomeFactor?.isMissing).toBe(true);
    expect(incomeFactor?.weight).toBe(0);
    expect(incomeFactor?.normalizedScore).toBeNull();

    const foirFactor = factorBreakdown.find((f) => f.factor === 'emi_burden');
    expect(foirFactor?.isMissing).toBe(true);
    expect(foirFactor?.weight).toBe(0);

    const totalObservedWeight = factorBreakdown
      .filter((f) => !f.isMissing)
      .reduce((sum, f) => sum + f.weight, 0);

    expect(Number(totalObservedWeight.toFixed(2))).toBeCloseTo(1.0, 1);
  });

  it('3. should calculate exactly 100.00 Ability score for a pristine non-delinquent borrower', () => {
    const perfectLoan: Loan = {
      ...sampleLoan,
      od_days: 0,
      prin_collected: 50000,
      principal_total: 50000,
      outstanding_principal: 0,
      last_coll_date: '2024-03-31',
      total_income: 50000,
      foir: 0.0
    };

    const { abilityScore } = computeAbilityScore(perfectLoan, new Date('2024-03-31'));
    expect(abilityScore).toBe(100.00);
  });

  it('4. should handle future collection dates gracefully by clamping daysSincePayment to 0', () => {
    const futureDateLoan: Loan = {
      ...sampleLoan,
      last_coll_date: '2024-04-05' // 5 days after snapshot date
    };

    const { factorBreakdown } = computeAbilityScore(futureDateLoan, new Date('2024-03-31'));
    const recencyFactor = factorBreakdown.find((f) => f.factor === 'last_payment_recency');

    expect(recencyFactor).toBeDefined();
    expect(recencyFactor?.rawValue).toBe(0); // Clamped to 0 days ago
    expect(recencyFactor?.normalizedScore).toBe(100);
  });

  it('5. should handle the OUTSTANDING > PRINCIPAL anomaly safely by clamping exposure ratio', () => {
    const anomalousLoan: Loan = {
      ...sampleLoan,
      principal_total: 40000,
      outstanding_principal: 48000
    };

    const { factorBreakdown } = computeAbilityScore(anomalousLoan);
    const exposureFactor = factorBreakdown.find((f) => f.factor === 'exposure_ratio');

    expect(exposureFactor).toBeDefined();
    expect(exposureFactor?.normalizedScore).toBe(0);
  });

  it('6. should correctly classify all 9 Cohort Matrix boundaries', () => {
    expect(getScoreBand(70.0)).toBe(ScoreBand.HIGH);
    expect(getScoreBand(69.99)).toBe(ScoreBand.MEDIUM);
    expect(getScoreBand(40.0)).toBe(ScoreBand.MEDIUM);
    expect(getScoreBand(39.99)).toBe(ScoreBand.LOW);

    // High Ability (>=70)
    expect(classifyCohort(80, 20).cohort).toBe(CohortType.WILFUL_DEFAULTER);
    expect(classifyCohort(80, 50).cohort).toBe(CohortType.PROCRASTINATOR);
    expect(classifyCohort(80, 85).cohort).toBe(CohortType.OOPS);

    // Medium Ability (40-69)
    expect(classifyCohort(55, 25).cohort).toBe(CohortType.EVASION_RISK);
    expect(classifyCohort(55, 55).cohort).toBe(CohortType.FENCE_SITTER);
    expect(classifyCohort(55, 80).cohort).toBe(CohortType.CASHFLOW_CRUNCH);

    // Low Ability (<40)
    expect(classifyCohort(20, 20).cohort).toBe(CohortType.LOST_CAUSE);
    expect(classifyCohort(20, 50).cohort).toBe(CohortType.STRUGGLER);
    expect(classifyCohort(20, 85).cohort).toBe(CohortType.DISTRESSED);
  });

  it('7. should produce 100% deterministic scores across repeated calculations', () => {
    const score1 = calculateBorrowerScore(sampleLoan);
    const score2 = calculateBorrowerScore(sampleLoan);

    expect(score1.abilityScore).toBe(score2.abilityScore);
    expect(score1.intentScore).toBe(score2.intentScore);
    expect(score1.cohort).toBe(score2.cohort);
    expect(score1.modelVersion).toBe(score2.modelVersion);
  });

  it('8. should simulate what-if payments and update recency without mutating baseline loan object', () => {
    const originalPrinCollected = sampleLoan.prin_collected;
    const originalOutstanding = sampleLoan.outstanding_principal;

    const simulation = simulateBorrowerScore(sampleLoan, {
      last_coll_amount: 10000,
      od_days: 5
    });

    expect(sampleLoan.prin_collected).toBe(originalPrinCollected);
    expect(sampleLoan.outstanding_principal).toBe(originalOutstanding);

    expect(simulation.deltas.deltaAbility).toBeGreaterThanOrEqual(0);
    expect(simulation.simulated.abilityScore).toBeGreaterThanOrEqual(simulation.baseline.abilityScore);
    expect(simulation.simulationSummary).toContain('Simulated overrides');
  });

  it('9. should generate speakable call center agent scripts for collections agents', () => {
    const distressedLoan: Loan = {
      ...sampleLoan,
      total_income: 10000,
      foir: 0.85,
      od_days: 120,
      total_emi_paid_count: 20,
      total_instal: 24
    };

    const score = calculateBorrowerScore(distressedLoan);
    expect(score.agentCallScript).toBeDefined();
    expect(score.agentCallScript.length).toBeGreaterThan(20);
    expect(score.factorBreakdown.ability.length).toBeGreaterThan(0);
    expect(score.factorBreakdown.intent.length).toBeGreaterThan(0);
  });
});
