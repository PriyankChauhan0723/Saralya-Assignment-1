import { Loan } from '../models/loan.model.js';
import { FactorContribution } from '../models/score.model.js';

interface RawAbilityFactor {
  factor: string;
  factorDisplayName: string;
  rawValue: number | string | null;
  normalizedScore: number | null;
  standardWeight: number;
  isMissing: boolean;
  explanation: string;
}

/**
 * Computes the continuous 0–100 Ability Score using an empirical linear scorecard.
 * Implements dynamic weight rescaling for missing inputs and strips unobserved ghost feeds.
 */
export function computeAbilityScore(
  loan: Loan,
  snapshotDate: Date = new Date('2024-03-31')
): { abilityScore: number; factorBreakdown: FactorContribution[] } {
  const factors: RawAbilityFactor[] = [];

  // 1. Overdue Severity (0.20 base weight)
  const odDays = Math.max(0, loan.od_days ?? 0);
  const normOdSeverity = Math.max(0, (1 - Math.min(odDays, 210) / 210) * 100);
  factors.push({
    factor: 'overdue_severity',
    factorDisplayName: 'Overdue Severity',
    rawValue: odDays,
    normalizedScore: Number(normOdSeverity.toFixed(2)),
    standardWeight: 0.20,
    isMissing: false,
    explanation:
      odDays === 0
        ? 'Account is current with zero overdue days.'
        : `Account is ${odDays} days overdue (delinquency cap at 210 days).`
  });

  // 2. Repayment Velocity (0.15 base weight)
  const prinTotal = loan.principal_total > 0 ? loan.principal_total : 1;
  const prinCollected = Math.max(0, loan.prin_collected ?? 0);
  const normRepaymentVelocity = Math.min(100, Math.max(0, (prinCollected / prinTotal) * 100));
  factors.push({
    factor: 'repayment_velocity',
    factorDisplayName: 'Repayment Velocity',
    rawValue: prinCollected,
    normalizedScore: Number(normRepaymentVelocity.toFixed(2)),
    standardWeight: 0.15,
    isMissing: false,
    explanation: `Collected ₹${prinCollected.toLocaleString('en-IN')} of ₹${loan.principal_total.toLocaleString('en-IN')} principal (${normRepaymentVelocity.toFixed(1)}%).`
  });

  // 3. Last Payment Recency (0.12 base weight)
  let daysSincePayment = odDays;
  let hasLastCollDate = false;
  if (loan.last_coll_date) {
    const collDate = new Date(loan.last_coll_date);
    if (!isNaN(collDate.getTime())) {
      const diffDays = Math.round((snapshotDate.getTime() - collDate.getTime()) / (1000 * 60 * 60 * 24));
      daysSincePayment = Math.max(0, diffDays);
      hasLastCollDate = true;
    }
  }
  const normRecency = Math.max(0, (1 - Math.min(daysSincePayment, 180) / 180) * 100);
  factors.push({
    factor: 'last_payment_recency',
    factorDisplayName: 'Last Payment Recency',
    rawValue: hasLastCollDate ? daysSincePayment : null,
    normalizedScore: Number(normRecency.toFixed(2)),
    standardWeight: 0.12,
    isMissing: !hasLastCollDate && loan.od_days === undefined,
    explanation: hasLastCollDate
      ? `Last payment landed ${daysSincePayment} days prior to snapshot date.`
      : `Last collection date missing; estimated from ${odDays} overdue days.`
  });

  // 4. Income Stability (0.11 base weight)
  const hasIncome = loan.total_income !== null && loan.total_income !== undefined;
  const normIncome = hasIncome ? (loan.total_income! > 0 ? 100 : 0) : null;
  factors.push({
    factor: 'income_stability',
    factorDisplayName: 'Income Stability',
    rawValue: hasIncome ? loan.total_income : null,
    normalizedScore: normIncome,
    standardWeight: 0.11,
    isMissing: !hasIncome,
    explanation: hasIncome
      ? `Verified monthly income of ₹${loan.total_income?.toLocaleString('en-IN')}.`
      : 'Income data missing from feed (weight rescaled across observed factors).'
  });

  // 5. EMI Burden / FOIR (0.10 base weight)
  const hasFoir = loan.foir !== null && loan.foir !== undefined;
  let normFoir: number | null = null;
  if (hasFoir) {
    const foirVal = Math.max(0, loan.foir!);
    normFoir = Number(Math.max(0, (1 - Math.min(foirVal, 0.75) / 0.75) * 100).toFixed(2));
  }
  factors.push({
    factor: 'emi_burden',
    factorDisplayName: 'EMI Burden (FOIR)',
    rawValue: hasFoir ? loan.foir : null,
    normalizedScore: normFoir,
    standardWeight: 0.10,
    isMissing: !hasFoir,
    explanation: hasFoir
      ? `Fixed Obligation to Income Ratio (FOIR) is ${(loan.foir! * 100).toFixed(1)}% (threshold 75%).`
      : 'FOIR data missing from feed (weight rescaled across observed factors).'
  });

  // 6. Principal Exposure Ratio (0.08 base weight)
  const outstanding = Math.max(0, loan.outstanding_principal ?? 0);
  const clampedOutstanding = Math.min(outstanding, prinTotal);
  const normExposure = Math.max(0, (1 - clampedOutstanding / prinTotal) * 100);
  factors.push({
    factor: 'exposure_ratio',
    factorDisplayName: 'Principal Exposure Ratio',
    rawValue: outstanding,
    normalizedScore: Number(normExposure.toFixed(2)),
    standardWeight: 0.08,
    isMissing: false,
    explanation:
      outstanding > loan.principal_total
        ? `Outstanding ₹${outstanding.toLocaleString('en-IN')} exceeds original principal ₹${loan.principal_total.toLocaleString('en-IN')} due to penal interest.`
        : `Outstanding principal is ₹${outstanding.toLocaleString('en-IN')} (${((outstanding / prinTotal) * 100).toFixed(1)}% of total).`
  });

  // Unobserved feeds stripped from legacy card
  const missingFeeds = [
    { factor: 'bounce_pressure', name: 'Bounce Pressure', legacyWeight: 0.10 },
    { factor: 'balance_cover', name: 'Balance Cover', legacyWeight: 0.09 },
    { factor: 'employment_tenure', name: 'Employment Tenure', legacyWeight: 0.05 }
  ];
  for (const feed of missingFeeds) {
    factors.push({
      factor: feed.factor,
      factorDisplayName: feed.name,
      rawValue: null,
      normalizedScore: null,
      standardWeight: 0.00,
      isMissing: true,
      explanation: `Feed missing in MFI portfolio dump; legacy ${feed.legacyWeight * 100}% static weight removed.`
    });
  }

  // Dynamic weight rescaling over observed features
  const observedFactors = factors.filter((f) => !f.isMissing && f.normalizedScore !== null);
  const totalObservedWeight = observedFactors.reduce((acc, f) => acc + f.standardWeight, 0);

  let rawWeightedSum = 0;
  const factorBreakdown: FactorContribution[] = [];

  for (const f of factors) {
    if (f.isMissing || f.normalizedScore === null || totalObservedWeight === 0) {
      factorBreakdown.push({
        factor: f.factor,
        factorDisplayName: f.factorDisplayName,
        rawValue: f.rawValue,
        normalizedScore: null,
        weight: 0,
        contribution: null,
        isMissing: true,
        agentExplanation: f.explanation
      });
    } else {
      const exactRescaledWeight = f.standardWeight / totalObservedWeight;
      const exactContribution = f.normalizedScore * exactRescaledWeight;
      rawWeightedSum += exactContribution;

      factorBreakdown.push({
        factor: f.factor,
        factorDisplayName: f.factorDisplayName,
        rawValue: f.rawValue,
        normalizedScore: f.normalizedScore,
        weight: Number(exactRescaledWeight.toFixed(4)),
        contribution: Number(exactContribution.toFixed(2)),
        isMissing: false,
        agentExplanation: f.explanation
      });
    }
  }

  const finalAbilityScore = totalObservedWeight === 0 ? 0 : Math.min(100, Math.max(0, Number(rawWeightedSum.toFixed(2))));

  return {
    abilityScore: finalAbilityScore,
    factorBreakdown
  };
}
