import fs from 'node:fs';
import path from 'node:path';
import csvParser from 'csv-parser';

export interface ModelFeature {
  name: string;
  displayName: string;
  weight: number;
  mean: number;
  std: number;
  description: string;
}

export interface IntentModelArtifact {
  modelVersion: string;
  algorithm: string;
  trainedAt: string;
  features: ModelFeature[];
  intercept: number;
  metrics: {
    trainSize: number;
    testSize: number;
    baselineAuc: number;
    baselineKs: number;
    modelAuc: number;
    modelKs: number;
    classBalance: {
      totalRows: number;
      paidCount: number;
      nonPaidCount: number;
      paidRate: number;
    };
    calibrationTable: Array<{
      decile: number;
      minScore: number;
      maxScore: number;
      count: number;
      predictedRate: number;
      actualRate: number;
      brierScore: number;
    }>;
  };
}

interface RawCsvRow {
  LOAN_NO: string;
  MEMBER_NAME: string;
  MOBILE_NUMBER: string;
  TOTAL_INSTAL: string;
  PRINCIPAL_TOTAL: string;
  OUTSTANDING_PRINCIPAL: string;
  PRIN_COLLECTED: string;
  Total_EMI_Paid_Count: string;
  LAST_COLL_DATE: string;
  OD_DAYS: string;
  STATUS: string;
  TOTAL_INCOME: string;
  FOIR: string;
  CYCLE: string;
  PAID_WITHIN_30D: string;
  AMOUNT_PAID_30D: string;
}

interface FeatureVector {
  loanNo: string;
  x: number[]; // feature values
  y: number;   // 0 or 1
  baselineScore: number; // legacy intent score
}

const FEATURE_NAMES = [
  'ptp_kept_rate',
  'repayment_velocity',
  'od_severity_ratio',
  'last_payment_recency_ratio',
  'contactability',
  'cycle_normalized',
  'foir_capped'
];

const FEATURE_DISPLAY_NAMES = [
  'PTP Kept Rate (EMIs Paid / Total)',
  'Repayment Velocity (Principal Collected / Total)',
  'Overdue Severity Ratio (OD Days / 210)',
  'Last Payment Recency Ratio (Days / 180)',
  'Contactability (Valid 10-Digit Mobile)',
  'Loan Cycle Count',
  'EMI Burden (FOIR)'
];

const FEATURE_DESCRIPTIONS = [
  'Proportion of scheduled EMIs honored on time',
  'Ratio of principal repaid to total disbursed loan principal',
  'Overdue days normalized by 210-day write-off threshold (negative indicator)',
  'Recency of last payment received (days since payment / 180)',
  'Whether borrower holds a valid 10-digit reachable mobile number',
  'Borrower experience tenure and discipline across loan cycles',
  'Fixed obligation to verified income burden'
];

export async function trainAndExportIntentModel(
  csvPath = 'data/portfolio.csv',
  outputArtifactPath = 'src/config/intent_model_weights.json'
): Promise<IntentModelArtifact> {
  console.log(`Starting Intent Model training pipeline from ${csvPath}...`);

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found at ${csvPath}. Run npm run generate-data first.`);
  }

  const rows: FeatureVector[] = [];
  const snapshotDate = new Date('2024-03-31');

  // 1. Stream & Extract Features (Refusing Leaky Columns)
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csvParser())
      .on('data', (raw: RawCsvRow) => {
        const totalInstal = Number(raw.TOTAL_INSTAL) || 12;
        const totalPrin = Number(raw.PRINCIPAL_TOTAL) || 1;
        const prinCollected = Number(raw.PRIN_COLLECTED) || 0;
        const paidCount = Number(raw.Total_EMI_Paid_Count) || 0;
        const odDays = Math.max(0, Number(raw.OD_DAYS) || 0);
        const mobile = raw.MOBILE_NUMBER ? String(raw.MOBILE_NUMBER).trim() : '';
        const cycle = Math.max(1, Number(raw.CYCLE) || 1);
        const foir = raw.FOIR !== '' && raw.FOIR !== undefined ? Number(raw.FOIR) : 0.50;
        const paidWithin30D = Number(raw.PAID_WITHIN_30D) === 1 ? 1 : 0;

        // Recency
        let daysSincePayment = odDays;
        if (raw.LAST_COLL_DATE) {
          const dt = new Date(raw.LAST_COLL_DATE);
          if (!isNaN(dt.getTime())) {
            daysSincePayment = Math.max(0, Math.round((snapshotDate.getTime() - dt.getTime()) / 86400000));
          }
        }

        // Contactability: Valid Indian 10-digit mobile starting with 6-9
        const isValidMobile = /^([6-9]\d{9})$/.test(mobile) ? 1.0 : 0.0;

        // Feature values
        const ptpKeptRate = Math.min(1.0, Math.max(0.0, paidCount / totalInstal));
        const repaymentVelocity = Math.min(1.0, Math.max(0.0, prinCollected / totalPrin));
        const odSeverityRatio = Math.min(1.0, Math.max(0.0, odDays / 210));
        const lastPaymentRecencyRatio = Math.min(1.0, Math.max(0.0, 1 - Math.min(daysSincePayment, 180) / 180));
        const cycleNorm = Math.max(0.0, Math.min(1.0, (cycle - 1) / 4));
        const foirCapped = Math.min(1.0, Math.max(0.0, foir));

        // Legacy Intent Card (Baseline): 4 factors at 0.25 each
        let bucketIdx = 1;
        if (odDays <= 30) bucketIdx = 1;
        else if (odDays <= 60) bucketIdx = 2;
        else if (odDays <= 90) bucketIdx = 3;
        else if (odDays <= 180) bucketIdx = 4;
        else if (odDays <= 360) bucketIdx = 5;
        else bucketIdx = 6;
        const legacyBrokenPtp = (1 - (bucketIdx - 1) / 5) * 100;
        const legacyMessageRead = raw.STATUS === 'Active' ? 100 : (raw.STATUS === 'Write-Off' ? 30 : 60);
        const legacyIntentScore = 0.25 * (isValidMobile * 100) + 0.25 * (ptpKeptRate * 100) + 0.25 * legacyBrokenPtp + 0.25 * legacyMessageRead;

        rows.push({
          loanNo: raw.LOAN_NO,
          x: [
            ptpKeptRate,
            repaymentVelocity,
            odSeverityRatio,
            lastPaymentRecencyRatio,
            isValidMobile,
            cycleNorm,
            foirCapped
          ],
          y: paidWithin30D,
          baselineScore: legacyIntentScore
        });
      })
      .on('end', () => resolve())
      .on('error', (err) => reject(err));
  });

  const totalRows = rows.length;
  console.log(`Loaded ${totalRows} total rows for training & validation.`);

  // 2. Stratified 80/20 Train/Test Split
  const positives = rows.filter((r) => r.y === 1);
  const negatives = rows.filter((r) => r.y === 0);

  const trainPosCount = Math.floor(positives.length * 0.8);
  const trainNegCount = Math.floor(negatives.length * 0.8);

  const trainSet: FeatureVector[] = [
    ...positives.slice(0, trainPosCount),
    ...negatives.slice(0, trainNegCount)
  ];
  const testSet: FeatureVector[] = [
    ...positives.slice(trainPosCount),
    ...negatives.slice(trainNegCount)
  ];

  console.log(`Train Set: ${trainSet.length} rows | Test Set: ${testSet.length} rows.`);

  // 3. Feature Standardization (Z-score normalization on train set)
  const numFeatures = FEATURE_NAMES.length;
  const means = new Array(numFeatures).fill(0);
  const stds = new Array(numFeatures).fill(0);

  for (let j = 0; j < numFeatures; j++) {
    const sum = trainSet.reduce((acc, r) => acc + r.x[j], 0);
    means[j] = sum / trainSet.length;
    const variance = trainSet.reduce((acc, r) => acc + Math.pow(r.x[j] - means[j], 2), 0) / trainSet.length;
    stds[j] = Math.sqrt(variance) || 1.0;
  }

  function standardize(x: number[]): number[] {
    return x.map((val, j) => (val - means[j]) / stds[j]);
  }

  // 4. Fit Regularized Logistic Regression with Balanced Class Weighting
  const weightPos = trainSet.length / (2 * trainPosCount);
  const weightNeg = trainSet.length / (2 * (trainSet.length - trainPosCount));

  let weights = new Array(numFeatures).fill(0);
  let intercept = 0;
  const learningRate = 0.05;
  const l2Lambda = 0.001;
  const epochs = 100;

  for (let epoch = 0; epoch < epochs; epoch++) {
    let gradIntercept = 0;
    const gradWeights = new Array(numFeatures).fill(0);

    for (const sample of trainSet) {
      const xStd = standardize(sample.x);
      let z = intercept;
      for (let j = 0; j < numFeatures; j++) {
        z += weights[j] * xStd[j];
      }
      const pred = 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, z))));
      const sampleWeight = sample.y === 1 ? weightPos : weightNeg;
      const error = (pred - sample.y) * sampleWeight;

      gradIntercept += error;
      for (let j = 0; j < numFeatures; j++) {
        gradWeights[j] += error * xStd[j];
      }
    }

    intercept -= (learningRate * gradIntercept) / trainSet.length;
    for (let j = 0; j < numFeatures; j++) {
      weights[j] -= learningRate * (gradWeights[j] / trainSet.length + l2Lambda * weights[j]);
    }
  }

  console.log('Logistic Regression fitted successfully.');
  console.log('Learned Weights (Standardized):', weights);
  console.log('Learned Intercept:', intercept);

  // 5. Model Inference Function
  function predictProb(x: number[]): number {
    const xStd = standardize(x);
    let z = intercept;
    for (let j = 0; j < numFeatures; j++) {
      z += weights[j] * xStd[j];
    }
    return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, z))));
  }

  // 6. Evaluate on Held-out Test Set (AUC and KS)
  function computeAucAndKs(predictions: Array<{ score: number; y: number }>) {
    const sorted = [...predictions].sort((a, b) => b.score - a.score);
    const totalPos = sorted.filter((s) => s.y === 1).length;
    const totalNeg = sorted.filter((s) => s.y === 0).length;

    if (totalPos === 0 || totalNeg === 0) return { auc: 0.5, ks: 0 };

    let cumPos = 0;
    let cumNeg = 0;
    let maxKs = 0;
    let aucSum = 0;
    let prevFpr = 0;
    let prevTpr = 0;

    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].y === 1) cumPos++;
      else cumNeg++;

      const tpr = cumPos / totalPos;
      const fpr = cumNeg / totalNeg;

      const ks = Math.abs(tpr - fpr) * 100;
      if (ks > maxKs) maxKs = ks;

      aucSum += ((fpr - prevFpr) * (tpr + prevTpr)) / 2;
      prevFpr = fpr;
      prevTpr = tpr;
    }

    return {
      auc: Number(aucSum.toFixed(4)),
      ks: Number(maxKs.toFixed(2))
    };
  }

  const baselineTestPreds = testSet.map((s) => ({ score: s.baselineScore, y: s.y }));
  const modelTestPreds = testSet.map((s) => ({ score: predictProb(s.x) * 100, y: s.y }));

  const baselineMetrics = computeAucAndKs(baselineTestPreds);
  const modelMetrics = computeAucAndKs(modelTestPreds);

  console.log(`Baseline Heuristic Card -> AUC: ${baselineMetrics.auc} | KS: ${baselineMetrics.ks}%`);
  console.log(`Fitted Logistic Model   -> AUC: ${modelMetrics.auc} | KS: ${modelMetrics.ks}%`);

  // 7. Decile Calibration Table
  const sortedModelTest = [...modelTestPreds].sort((a, b) => a.score - b.score);
  const decileSize = Math.floor(sortedModelTest.length / 10);
  const calibrationTable: IntentModelArtifact['metrics']['calibrationTable'] = [];

  for (let d = 0; d < 10; d++) {
    const start = d * decileSize;
    const end = d === 9 ? sortedModelTest.length : (d + 1) * decileSize;
    const bucket = sortedModelTest.slice(start, end);

    const minScore = Number(bucket[0].score.toFixed(1));
    const maxScore = Number(bucket[bucket.length - 1].score.toFixed(1));
    const count = bucket.length;
    const avgPred = Number((bucket.reduce((acc, b) => acc + b.score, 0) / count / 100).toFixed(4));
    const actualRate = Number((bucket.filter((b) => b.y === 1).length / count).toFixed(4));
    const brierScore = Number((bucket.reduce((acc, b) => acc + Math.pow(b.score / 100 - b.y, 2), 0) / count).toFixed(4));

    calibrationTable.push({
      decile: d + 1,
      minScore,
      maxScore,
      count,
      predictedRate: avgPred,
      actualRate,
      brierScore
    });
  }

  // 8. Construct Export Artifact
  const modelFeatures: ModelFeature[] = FEATURE_NAMES.map((name, i) => ({
    name,
    displayName: FEATURE_DISPLAY_NAMES[i],
    weight: Number(weights[i].toFixed(4)),
    mean: Number(means[i].toFixed(4)),
    std: Number(stds[i].toFixed(4)),
    description: FEATURE_DESCRIPTIONS[i]
  }));

  const artifact: IntentModelArtifact = {
    modelVersion: 'v1.0.0-logistic-l2',
    algorithm: 'Regularized Logistic Regression (L2, Balanced Class Weights)',
    trainedAt: new Date().toISOString(),
    features: modelFeatures,
    intercept: Number(intercept.toFixed(4)),
    metrics: {
      trainSize: trainSet.length,
      testSize: testSet.length,
      baselineAuc: baselineMetrics.auc,
      baselineKs: baselineMetrics.ks,
      modelAuc: modelMetrics.auc,
      modelKs: modelMetrics.ks,
      classBalance: {
        totalRows,
        paidCount: positives.length,
        nonPaidCount: negatives.length,
        paidRate: Number((positives.length / totalRows).toFixed(4))
      },
      calibrationTable
    }
  };

  const artifactDir = path.dirname(outputArtifactPath);
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  fs.writeFileSync(outputArtifactPath, JSON.stringify(artifact, null, 2), 'utf8');
  console.log(`Saved model artifact with weights to ${outputArtifactPath}`);

  return artifact;
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('train_intent_model')) {
  trainAndExportIntentModel().catch(console.error);
}
