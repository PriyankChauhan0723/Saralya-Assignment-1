import { CohortType, ScoreBand } from '../models/cohort.model.js';
import { FactorContribution } from '../models/score.model.js';

/**
 * Synthesizes a human-readable, speakable script for live call center collections agents.
 */
export function generateAgentCallScript(
  memberName: string,
  abilityScore: number,
  abilityBand: ScoreBand,
  intentScore: number,
  intentBand: ScoreBand,
  cohort: CohortType,
  abilityFactors: FactorContribution[]
): string {
  const name = memberName ? memberName.trim() : 'Borrower';

  const topNegativeAbility = [...abilityFactors]
    .filter((f) => !f.isMissing && (f.normalizedScore ?? 100) < 50)
    .sort((a, b) => (a.normalizedScore ?? 0) - (b.normalizedScore ?? 0))[0];

  switch (cohort) {
    case CohortType.WILFUL_DEFAULTER:
      return `${name} has strong financial capacity (Ability: ${abilityScore.toFixed(0)}), but shows low willingness to honor payments (Intent: ${intentScore.toFixed(0)}). Escalate directly to legal notice warning and demand immediate settlement.`;

    case CohortType.PROCRASTINATOR:
      return `${name} can afford to pay (Ability: ${abilityScore.toFixed(0)}), but is postponing payment. Give a clear, firm payment deadline before today's call concludes.`;

    case CohortType.OOPS:
      return `${name} has both high capacity (${abilityScore.toFixed(0)}) and high willingness (${intentScore.toFixed(0)}). Non-payment is likely an oversight; send an instant UPI link during this call.`;

    case CohortType.EVASION_RISK:
      return `${name} has moderate capacity (Ability: ${abilityScore.toFixed(0)}) but is avoiding commitments (Intent: ${intentScore.toFixed(0)}). Secure a strict Promise-to-Pay (PTP) date with field team follow-up.`;

    case CohortType.FENCE_SITTER:
      return `${name} is undecided with moderate ability (${abilityScore.toFixed(0)}) and intent (${intentScore.toFixed(0)}). Active agent negotiation and a small token payment can secure this account.`;

    case CohortType.CASHFLOW_CRUNCH:
      return `${name} is willing to pay (Intent: ${intentScore.toFixed(0)}) but facing a temporary cashflow shortfall. Offer a short grace period or split EMI option.`;

    case CohortType.LOST_CAUSE:
      return `${name} suffers from severe financial distress (Ability: ${abilityScore.toFixed(0)}) and low intent (${intentScore.toFixed(0)}). Assess for One-Time Settlement (OTS) or loss mitigation.`;

    case CohortType.STRUGGLER:
      return `${name} has limited funds (Ability: ${abilityScore.toFixed(0)}) but is making partial efforts. Negotiate an affordable token installment to prevent full write-off.`;

    case CohortType.DISTRESSED:
      return `${name} genuinely wants to repay (Intent: ${intentScore.toFixed(0)}) but is in acute financial distress (${topNegativeAbility ? topNegativeAbility.factorDisplayName : 'low capacity'}). Do not harass; offer loan tenure extension or restructuring.`;

    default:
      return `Borrower scored Ability ${abilityScore.toFixed(0)} (${abilityBand}) and Intent ${intentScore.toFixed(0)} (${intentBand}).`;
  }
}
