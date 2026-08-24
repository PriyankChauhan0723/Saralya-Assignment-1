import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Loan } from '../models/loan.model.js';
import { FactorContribution } from '../models/score.model.js';
import { IntentModelArtifact } from '../../../scripts/train_intent_model.js';

let cachedArtifact: IntentModelArtifact | null = null;

function loadModelArtifact(): IntentModelArtifact {
  if (cachedArtifact) return cachedArtifact;

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.resolve(currentDir, '../../config/intent_model_weights.json'),
    path.resolve(process.cwd(), 'src/config/intent_model_weights.json'),
    path.resolve(process.cwd(), 'dist/config/intent_model_weights.json')
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      const data = fs.readFileSync(p, 'utf8');
      cachedArtifact = JSON.parse(data) as IntentModelArtifact;
      return cachedArtifact;
    }
  }

  throw new Error('Intent model weights artifact (intent_model_weights.json) not found.');
}

/**
 * Computes the continuous 0–100 Intent Score via logistic regression inference.
 * Evaluates feature standardization and sigmoid probability at sub-millisecond runtime latency.
 */
export function computeIntentScore(
  loan: Loan,
  snapshotDate: Date = new Date('2024-03-31')
): { intentScore: number; modelVersion: string; factorBreakdown: FactorContribution[] } {
  const artifact = loadModelArtifact();

  const totalInstal = loan.total_instal > 0 ? loan.total_instal : 12;
  const totalPrin = loan.principal_total > 0 ? loan.principal_total : 1;
  const prinCollected = Math.max(0, loan.prin_collected ?? 0);
  const paidCount = Math.max(0, loan.total_emi_paid_count ?? 0);
  const odDays = Math.max(0, loan.od_days ?? 0);
  const mobile = loan.mobile_number ? String(loan.mobile_number).trim() : '';
  const cycle = Math.max(1, loan.cycle ?? 1);
  const foir = loan.foir !== null && loan.foir !== undefined ? loan.foir : 0.50;

  let daysSincePayment = odDays;
  let hasLastCollDate = false;
  if (loan.last_coll_date) {
    const dt = new Date(loan.last_coll_date);
    if (!isNaN(dt.getTime())) {
      const diffDays = Math.round((snapshotDate.getTime() - dt.getTime()) / (1000 * 60 * 60 * 24));
      daysSincePayment = Math.max(0, diffDays);
      hasLastCollDate = true;
    }
  }

  const isValidMobile = loan.is_valid_mobile ?? (/^([6-9]\d{9})$/.test(mobile));

  const rawFeatures: Record<string, { raw: number | string | null; val: number; explanation: string }> = {
    ptp_kept_rate: {
      raw: `${paidCount} / ${totalInstal}`,
      val: Math.min(1.0, Math.max(0.0, paidCount / totalInstal)),
      explanation: `Borrower honored ${paidCount} of ${totalInstal} scheduled EMIs (${((paidCount / totalInstal) * 100).toFixed(1)}%).`
    },
    repayment_velocity: {
      raw: prinCollected,
      val: Math.min(1.0, Math.max(0.0, prinCollected / totalPrin)),
      explanation: `Repaid ₹${prinCollected.toLocaleString('en-IN')} of ₹${loan.principal_total.toLocaleString('en-IN')} principal.`
    },
    od_severity_ratio: {
      raw: odDays,
      val: Math.min(1.0, Math.max(0.0, odDays / 210)),
      explanation:
        odDays === 0
          ? 'Zero overdue days (minimal default risk).'
          : `${odDays} days overdue pulls down repayment likelihood.`
    },
    last_payment_recency_ratio: {
      raw: hasLastCollDate ? daysSincePayment : null,
      val: Math.min(1.0, Math.max(0.0, 1 - Math.min(daysSincePayment, 180) / 180)),
      explanation: hasLastCollDate
        ? `Last collection landed ${daysSincePayment} days prior to snapshot date.`
        : `Collection recency estimated from ${odDays} days overdue.`
    },
    contactability: {
      raw: mobile,
      val: isValidMobile ? 1.0 : 0.0,
      explanation: isValidMobile
        ? `Valid reachable 10-digit mobile number (+91 ${mobile.slice(-10)}).`
        : 'Invalid or unreachable mobile number on record.'
    },
    cycle_normalized: {
      raw: cycle,
      val: Math.max(0.0, Math.min(1.0, (cycle - 1) / 4)),
      explanation: `Loan cycle ${cycle} indicates established credit discipline history.`
    },
    foir_capped: {
      raw: loan.foir,
      val: Math.min(1.0, Math.max(0.0, foir)),
      explanation: `Debt burden FOIR is ${(foir * 100).toFixed(1)}%.`
    }
  };

  // Inference: z = beta_0 + sum(beta_j * (x_j - mu_j) / sigma_j)
  let z = artifact.intercept;
  const factorBreakdown: FactorContribution[] = [];

  for (const feat of artifact.features) {
    const featData = rawFeatures[feat.name];
    if (!featData) continue;

    const standardizedVal = (featData.val - feat.mean) / feat.std;
    const contribution = feat.weight * standardizedVal;
    z += contribution;

    const normalizedScore = Number((featData.val * 100).toFixed(2));

    factorBreakdown.push({
      factor: feat.name,
      factorDisplayName: feat.displayName,
      rawValue: featData.raw,
      normalizedScore,
      weight: feat.weight,
      contribution: Number(contribution.toFixed(2)),
      isMissing: featData.raw === null,
      agentExplanation: featData.explanation
    });
  }

  const clampedZ = Math.max(-20, Math.min(20, z));
  const probability = 1 / (1 + Math.exp(-clampedZ));
  const intentScore = Math.min(100, Math.max(0, Number((probability * 100).toFixed(2))));

  return {
    intentScore,
    modelVersion: artifact.modelVersion,
    factorBreakdown
  };
}
