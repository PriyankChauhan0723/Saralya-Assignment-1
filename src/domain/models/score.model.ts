import { CohortType, ScoreBand } from './cohort.model.js';

export interface FactorContribution {
  factor: string;
  factorDisplayName: string;
  rawValue: number | string | null;
  normalizedScore: number | null; // 0-100 or null if missing
  weight: number;                 // Rescaled weight in the scorecard
  contribution: number | null;    // normalizedScore * weight
  isMissing: boolean;
  agentExplanation: string;       // Human-readable sentence for live call center agent
}

export interface BorrowerScore {
  loanNo: string;
  abilityScore: number;           // 0 - 100
  abilityBand: ScoreBand;         // HIGH, MEDIUM, LOW
  intentScore: number;            // 0 - 100
  intentBand: ScoreBand;          // HIGH, MEDIUM, LOW
  cohort: CohortType;
  modelVersion: string;
  factorBreakdown: {
    ability: FactorContribution[];
    intent: FactorContribution[];
  };
  agentCallScript: string;        // Overall synthesize call script sentence for phone collections
  computedAt: Date;
}

export interface ScoreSimulationResult {
  loanNo: string;
  baseline: {
    abilityScore: number;
    abilityBand: ScoreBand;
    intentScore: number;
    intentBand: ScoreBand;
    cohort: CohortType;
  };
  simulated: {
    abilityScore: number;
    abilityBand: ScoreBand;
    intentScore: number;
    intentBand: ScoreBand;
    cohort: CohortType;
  };
  deltas: {
    deltaAbility: number;
    deltaIntent: number;
    cohortChanged: boolean;
  };
  simulationSummary: string;
  simulatedScore: BorrowerScore;
}
