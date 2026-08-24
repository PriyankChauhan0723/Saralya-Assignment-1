export enum ScoreBand {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW'
}

export enum CohortType {
  // ABILITY HIGH (>=70)
  WILFUL_DEFAULTER = 'WILFUL_DEFAULTER',   // Intent Low (<40)
  PROCRASTINATOR = 'PROCRASTINATOR',       // Intent Med (40-69)
  OOPS = 'OOPS',                           // Intent High (>=70)

  // ABILITY MED (40-69)
  EVASION_RISK = 'EVASION_RISK',           // Intent Low (<40)
  FENCE_SITTER = 'FENCE_SITTER',           // Intent Med (40-69)
  CASHFLOW_CRUNCH = 'CASHFLOW_CRUNCH',     // Intent High (>=70)

  // ABILITY LOW (<40)
  LOST_CAUSE = 'LOST_CAUSE',               // Intent Low (<40)
  STRUGGLER = 'STRUGGLER',                 // Intent Med (40-69)
  DISTRESSED = 'DISTRESSED'                // Intent High (>=70)
}

export interface CohortMetadata {
  cohort: CohortType;
  displayName: string;
  abilityBand: ScoreBand;
  intentBand: ScoreBand;
  recommendedAction: string;
  operationalChannel: string;
  description: string;
}

export const COHORT_DEFINITIONS: Record<CohortType, CohortMetadata> = {
  [CohortType.WILFUL_DEFAULTER]: {
    cohort: CohortType.WILFUL_DEFAULTER,
    displayName: 'Wilful Defaulter',
    abilityBand: ScoreBand.HIGH,
    intentBand: ScoreBand.LOW,
    recommendedAction: 'Escalate to Legal Notice & Field Visit',
    operationalChannel: 'Legal / Intensive Field Enforcement',
    description: 'Borrower can afford to repay but refuses or evades payment commitments.'
  },
  [CohortType.PROCRASTINATOR]: {
    cohort: CohortType.PROCRASTINATOR,
    displayName: 'Procrastinator',
    abilityBand: ScoreBand.HIGH,
    intentBand: ScoreBand.MEDIUM,
    recommendedAction: 'Direct Phone Call with Strict Payment Deadline',
    operationalChannel: 'Outbound Call Center',
    description: 'Borrower has adequate financial capacity but delays payments without firm nudges.'
  },
  [CohortType.OOPS]: {
    cohort: CohortType.OOPS,
    displayName: 'Oops',
    abilityBand: ScoreBand.HIGH,
    intentBand: ScoreBand.HIGH,
    recommendedAction: 'Automated SMS / WhatsApp Payment Link Reminder',
    operationalChannel: 'Digital Messaging',
    description: 'High capacity and high intent; non-payment is usually an unintentional oversight.'
  },
  [CohortType.EVASION_RISK]: {
    cohort: CohortType.EVASION_RISK,
    displayName: 'Evasion Risk',
    abilityBand: ScoreBand.MEDIUM,
    intentBand: ScoreBand.LOW,
    recommendedAction: 'In-person Field Verification and Hard PTP Agreement',
    operationalChannel: 'Field Agent Team',
    description: 'Moderate financial capacity coupled with evasive repayment behavior.'
  },
  [CohortType.FENCE_SITTER]: {
    cohort: CohortType.FENCE_SITTER,
    displayName: 'Fence-Sitter',
    abilityBand: ScoreBand.MEDIUM,
    intentBand: ScoreBand.MEDIUM,
    recommendedAction: 'Targeted Call Negotiation with Immediate UPI Link',
    operationalChannel: 'Tele-calling Agent',
    description: 'Borrower is undecided; proactive negotiation can successfully recover arrears.'
  },
  [CohortType.CASHFLOW_CRUNCH]: {
    cohort: CohortType.CASHFLOW_CRUNCH,
    displayName: 'Cashflow Crunch',
    abilityBand: ScoreBand.MEDIUM,
    intentBand: ScoreBand.HIGH,
    recommendedAction: 'Offer Short Grace Period / Partial Split Payment',
    operationalChannel: 'Relationship Manager',
    description: 'Willing borrower experiencing temporary cashflow shortfall (e.g. delayed harvest/salary).'
  },
  [CohortType.LOST_CAUSE]: {
    cohort: CohortType.LOST_CAUSE,
    displayName: 'Lost Cause',
    abilityBand: ScoreBand.LOW,
    intentBand: ScoreBand.LOW,
    recommendedAction: 'Evaluate for One-Time Settlement (OTS) or Write-Off',
    operationalChannel: 'Settlement Desk',
    description: 'Severe financial distress with zero willingness or ability to repay.'
  },
  [CohortType.STRUGGLER]: {
    cohort: CohortType.STRUGGLER,
    displayName: 'Struggler',
    abilityBand: ScoreBand.LOW,
    intentBand: ScoreBand.MEDIUM,
    recommendedAction: 'Negotiate Small Token Payment & Extended Repayment Plan',
    operationalChannel: 'Assisted Collections',
    description: 'Borrower has low financial buffer but makes modest attempts to repay.'
  },
  [CohortType.DISTRESSED]: {
    cohort: CohortType.DISTRESSED,
    displayName: 'Distressed',
    abilityBand: ScoreBand.LOW,
    intentBand: ScoreBand.HIGH,
    recommendedAction: 'Offer Loan Restructure / Tenure Extension (No Harassment)',
    operationalChannel: 'Restructuring / Customer Care',
    description: 'Genuine borrower facing severe hardship who desires to repay; avoid aggressive collection.'
  }
};
