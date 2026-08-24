import { CohortType, ScoreBand, COHORT_DEFINITIONS, CohortMetadata } from '../models/cohort.model.js';

export function getScoreBand(score: number): ScoreBand {
  if (score >= 70) return ScoreBand.HIGH;
  if (score >= 40) return ScoreBand.MEDIUM;
  return ScoreBand.LOW;
}

/**
 * Maps continuous 0–100 Ability and Intent scores into the 3x3 operational grid.
 */
export function classifyCohort(abilityScore: number, intentScore: number): {
  abilityBand: ScoreBand;
  intentBand: ScoreBand;
  cohort: CohortType;
  metadata: CohortMetadata;
} {
  const abilityBand = getScoreBand(abilityScore);
  const intentBand = getScoreBand(intentScore);

  let cohort: CohortType;

  if (abilityBand === ScoreBand.HIGH) {
    if (intentBand === ScoreBand.LOW) cohort = CohortType.WILFUL_DEFAULTER;
    else if (intentBand === ScoreBand.MEDIUM) cohort = CohortType.PROCRASTINATOR;
    else cohort = CohortType.OOPS;
  } else if (abilityBand === ScoreBand.MEDIUM) {
    if (intentBand === ScoreBand.LOW) cohort = CohortType.EVASION_RISK;
    else if (intentBand === ScoreBand.MEDIUM) cohort = CohortType.FENCE_SITTER;
    else cohort = CohortType.CASHFLOW_CRUNCH;
  } else {
    if (intentBand === ScoreBand.LOW) cohort = CohortType.LOST_CAUSE;
    else if (intentBand === ScoreBand.MEDIUM) cohort = CohortType.STRUGGLER;
    else cohort = CohortType.DISTRESSED;
  }

  return {
    abilityBand,
    intentBand,
    cohort,
    metadata: COHORT_DEFINITIONS[cohort]
  };
}
