# SaralCollect: Collections Cohort Scoring Service

A production-grade backend service built in **Node.js (Express + TypeScript)** with **PostgreSQL** and an **Empirical Logistic Regression ML Pipeline** that ingests NBFC/MFI loan portfolios, scores delinquent borrowers across **Ability (0–100)** and **Intent (0–100)** axes, maps them into a **3x3 operational cohort grid**, serves high-throughput paginated queries, and provides real-time score simulation with call center speakable explanations.

---

## 1. The Business Problem & The 3x3 Cohort Grid

Indian microfinance institutions (MFIs) and NBFCs collect on tens of thousands of delinquent accounts daily with limited call center bandwidth (e.g. 2,000 calls/day against 40,000 delinquent accounts). Calling borrowers in the wrong order or applying the wrong collection action damages customer goodwill, wastes limited capacity, and leads to avoidable write-offs.

Every borrower is placed on a 3x3 grid on two independent continuous 0–100 axes:
- **ABILITY (0–100)**: Physical financial capacity to pay right now (income, FOIR, repayment velocity, days overdue).
- **INTENT (0–100)**: Willingness and discipline to honor debt obligations (past EMI discipline, promise-to-pay track record, contactability, loan cycle).

Banded into **High ($\ge 70$)**, **Medium ($40 - 69$)**, and **Low ($< 40$)**:

```
                 │ INTENT Low (<40)         │ INTENT Med (40-69)       │ INTENT High (>=70)
─────────────────┼──────────────────────────┼──────────────────────────┼──────────────────────────
ABILITY High     │ Wilful Defaulter         │ Procrastinator           │ Oops
(>=70)           │ Operational Action:      │ Operational Action:      │ Operational Action:
                 │ Legal Notice / Field     │ Outbound Phone Deadline  │ SMS / WhatsApp UPI Link
─────────────────┼──────────────────────────┼──────────────────────────┼──────────────────────────
ABILITY Med      │ Evasion Risk             │ Fence-Sitter             │ Cashflow Crunch
(40-69)          │ Operational Action:      │ Operational Action:      │ Operational Action:
                 │ In-Person Verification   │ Tele-calling Negotiation │ Grace Period / Split EMI
─────────────────┼──────────────────────────┼──────────────────────────┼──────────────────────────
ABILITY Low      │ Lost Cause               │ Struggler                │ Distressed
(<40)            │ Operational Action:      │ Operational Action:      │ Operational Action:
                 │ One-Time Settlement(OTS) │ Token Installment Plan   │ Loan Restructure (Tenure)
```

---

## 2. Quickstart & How to Run

### Prerequisites
- **Node.js**: v20+ or v22+
- **PostgreSQL**: v14+ running on port `5432` (default user: `postgres`, password: `root` or as configured in `.env`)

### 1. Installation
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` (or customize PostgreSQL credentials):
```ini
PORT=3000
NODE_ENV=development
API_KEY=saralcollect_secret_key_2026

# PostgreSQL Configuration
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=root
PGDATABASE=saralcollect_db
```

### 3. Generate Data & Train Model
```bash
# Generate reproducible 25k synthetic MFI portfolio dataset
npm run generate-data

# Train and validate empirical intent logistic regression model & export weights
npm run train-model
```

### 4. Run Automated Test Suites
```bash
# Runs Unit Tests (Scoring maths, bounds, rescaling) + PostgreSQL Integration + API E2E tests
npm test
```

### 5. Start Development Server (with hot reload)
```bash
npm run dev
```

### 6. Ingest Full 25,000 Portfolio Dump
```bash
# Ingests and auto-scores all 25,000 records into PostgreSQL in ~30s (<25MB RAM)
npm run import-portfolio
```

### 7. Production Build & Start
```bash
npm run build
npm start
```

---

## 3. System Architecture

```
                                  portfolio.csv (25,000+ records)
                                                │
                                                ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. INGESTION & DATA HYGIENE LAYER                                                        │
│ • Memory-Bounded Stream: Readline async stream + backpressure (<25MB RAM used)           │
│ • Data Hygiene: Converts "" -> null, validates phone regex (^[6-9]\d{9}$), clamps values│
│ • Background Job Tracker: Emits importId (202 Accepted), updates import_jobs in DB       │
│ • Idempotent Upsert: PostgreSQL ON CONFLICT (loan_no) DO UPDATE                          │
└───────────────────────────────────────────────┬──────────────────────────────────────────┘
                                                │
                                                ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ 2. DOMAIN SCORING ENGINE & EMPIRICAL ML PIPELINE                                         │
│ • Intent Model: Sigmoid inference P(pay)*100 from exported weights (0.001ms latency)     │
│ • Ability Scorecard: Dynamic weight rescaling for missing inputs (null preserved)        │
│ • 3x3 Grid Classifier: High (>=70) / Med (40-69) / Low (<40) -> 9 Cohorts               │
│ • Explainability Generator: Human-readable agent call-script sentences per factor        │
│ • Deterministic & Versioned: Tagged with model_version ("v1.0.0-logistic-l2")            │
└───────────────────────────────────────────────┬──────────────────────────────────────────┘
                                                │
                                                ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ 3. PERSISTENCE LAYER (PostgreSQL)                                                        │
│ • import_jobs: Tracks job ID, status, progress count, error logs, and timings            │
│ • loans: Raw normalized borrower and portfolio data                                      │
│ • scores: Computed ability, intent, bands, cohort, model version, and factor JSON        │
│ • Composite Index on (cohort, od_bucket, state, outstanding_principal)                   │
└───────────────────────────────────────────────┬──────────────────────────────────────────┘
                                                │
                                                ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ 4. REST API CONTROLLERS (Ready for Assignment 2 UI Consumption)                          │
│ • POST /v1/portfolio/import         -> Multi-part CSV upload (Async 202 response)        │
│ • GET  /v1/portfolio/import/:id     -> Ingestion progress/status polling                 │
│ • GET  /v1/cohorts/summary          -> Single aggregated 3x3 matrix query (<30ms)        │
│ • GET  /v1/cohorts/:key/borrowers   -> Paginated/filtered/sorted list (<50ms for 8k)     │
│ • GET  /v1/borrowers/:loanId/score  -> Full breakdown + agent call script sentence       │
│ • POST /v1/score/simulate           -> In-memory what-if score calculator (<15ms)        │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. REST API Contract & Endpoints

All `/v1` endpoints require the `x-api-key` header:
```http
x-api-key: saralcollect_secret_key_2026
```

### 4.1 Ingestion Endpoints

#### `POST /v1/portfolio/import`
Uploads a CSV file and starts asynchronous background ingestion and auto-scoring without holding 25k records in memory.
* **Headers**: `x-api-key: <key>`, `Content-Type: multipart/form-data`
* **Body**: `file: portfolio.csv`
* **Response (202 Accepted)**:
```json
{
  "success": true,
  "data": {
    "importId": "9cee10fb-2207-413f-8385-8d52ea45fe77",
    "filename": "portfolio.csv",
    "status": "PROCESSING",
    "message": "File upload accepted. Ingestion and scoring are running in the background."
  }
}
```

#### `GET /v1/portfolio/import/:id`
Polls the progress, duration, and status of an ingestion job.
* **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "importId": "9cee10fb-2207-413f-8385-8d52ea45fe77",
    "filename": "portfolio.csv",
    "status": "COMPLETED",
    "totalRows": 25000,
    "processedRows": 25000,
    "failedRows": 0,
    "errorLog": [],
    "createdAt": "2026-08-21T10:25:58.000Z",
    "completedAt": "2026-08-21T10:26:29.000Z"
  }
}
```

---

### 4.2 Cohort & Dashboard Endpoints

#### `GET /v1/cohorts/summary`
Returns counts and total outstanding amounts for each of the nine cells in **one request, one round trip**.
* **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "grid": {
      "HIGH_ABILITY": {
        "LOW_INTENT": {
          "cohort": "WILFUL_DEFAULTER",
          "displayName": "Wilful Defaulter",
          "count": 0,
          "totalOutstanding": 0,
          "recommendedAction": "Escalate to Legal Notice & Field Visit",
          "operationalChannel": "Legal / Intensive Field Enforcement"
        },
        "MED_INTENT": {
          "cohort": "PROCRASTINATOR",
          "displayName": "Procrastinator",
          "count": 87,
          "totalOutstanding": 1526667.00,
          "recommendedAction": "Direct Phone Call with Strict Payment Deadline",
          "operationalChannel": "Outbound Call Center"
        },
        "HIGH_INTENT": {
          "cohort": "OOPS",
          "displayName": "Oops",
          "count": 5452,
          "totalOutstanding": 62210083.00,
          "recommendedAction": "Automated SMS / WhatsApp Payment Link Reminder",
          "operationalChannel": "Digital Messaging"
        }
      },
      "MED_ABILITY": {
        "LOW_INTENT": {
          "cohort": "EVASION_RISK",
          "displayName": "Evasion Risk",
          "count": 1560,
          "totalOutstanding": 64407999.00,
          "recommendedAction": "In-person Field Verification and Hard PTP Agreement",
          "operationalChannel": "Field Agent Team"
        },
        "MED_INTENT": {
          "cohort": "FENCE_SITTER",
          "displayName": "Fence-Sitter",
          "count": 9214,
          "totalOutstanding": 309993031.00,
          "recommendedAction": "Targeted Call Negotiation with Immediate UPI Link",
          "operationalChannel": "Tele-calling Agent"
        },
        "HIGH_INTENT": {
          "cohort": "CASHFLOW_CRUNCH",
          "displayName": "Cashflow Crunch",
          "count": 3199,
          "totalOutstanding": 82063984.00,
          "recommendedAction": "Offer Short Grace Period / Partial Split Payment",
          "operationalChannel": "Relationship Manager"
        }
      },
      "LOW_ABILITY": {
        "LOW_INTENT": {
          "cohort": "LOST_CAUSE",
          "displayName": "Lost Cause",
          "count": 5425,
          "totalOutstanding": 251190236.00,
          "recommendedAction": "Evaluate for One-Time Settlement (OTS) or Write-Off",
          "operationalChannel": "Settlement Desk"
        },
        "MED_INTENT": {
          "cohort": "STRUGGLER",
          "displayName": "Struggler",
          "count": 63,
          "totalOutstanding": 2814933.00,
          "recommendedAction": "Negotiate Small Token Payment & Extended Repayment Plan",
          "operationalChannel": "Assisted Collections"
        },
        "HIGH_INTENT": {
          "cohort": "DISTRESSED",
          "displayName": "Distressed",
          "count": 0,
          "totalOutstanding": 0,
          "recommendedAction": "Offer Loan Restructure / Tenure Extension (No Harassment)",
          "operationalChannel": "Restructuring / Customer Care"
        }
      }
    },
    "totalBorrowers": 25000,
    "totalPortfolioOutstanding": 774206933.00
  }
}
```

#### `GET /v1/cohorts/:key/borrowers`
Paginated, sortable, filterable borrower queue (stays sub-50ms when a cell holds 8,000+ borrowers).
* **Path Param**: `key` (e.g., `FENCE_SITTER`, `EVASION_RISK`, `OOPS`)
* **Query Params**:
  - `page` (default `1`)
  - `limit` (default `50`, max `200`)
  - `sortBy` (`od_days`, `outstanding_principal`, `ability_score`, `intent_score`)
  - `sortOrder` (`ASC`, `DESC`)
  - `state`, `product`, `od_bucket`, `minOutstanding`, `maxOutstanding`
* **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "cohort": "FENCE_SITTER",
    "pagination": {
      "page": 1,
      "limit": 2,
      "totalRecords": 9214,
      "totalPages": 4607
    },
    "items": [
      {
        "loanNo": "LN1000001",
        "memberName": "Sunita Devi",
        "mobileNumber": "9876543210",
        "isValidMobile": true,
        "state": "Bihar",
        "district": "Patna",
        "product": "JLG",
        "odDays": 32,
        "odBucket": "31-60",
        "outstandingPrincipal": 15000,
        "abilityScore": 62.40,
        "abilityBand": "MEDIUM",
        "intentScore": 58.70,
        "intentBand": "MEDIUM",
        "cohort": "FENCE_SITTER"
      }
    ]
  }
}
```

---

### 4.3 Borrower Drilldown & Score Simulation

#### `GET /v1/borrowers/:loanId/score`
Drilldown with both scores, bands, cohort, factor breakdown, and human-readable sentences for call center agents.
* **Path Param**: `loanId` (e.g., `LN1000001`)
* **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "loanNo": "LN1000001",
    "memberName": "Sunita Devi",
    "modelVersion": "v1.0.0-logistic-l2",
    "summary": {
      "abilityScore": 62.40,
      "abilityBand": "MEDIUM",
      "intentScore": 58.70,
      "intentBand": "MEDIUM",
      "cohort": "FENCE_SITTER"
    },
    "agentCallScript": "Sunita Devi is undecided with moderate ability (62) and intent (59). Active agent negotiation and a small token payment can secure this account.",
    "factorBreakdown": {
      "ability": [
        {
          "factor": "overdue_severity",
          "factorDisplayName": "Overdue Severity",
          "rawValue": 32,
          "normalizedScore": 84.76,
          "weight": 0.2632,
          "contribution": 22.31,
          "isMissing": false,
          "agentExplanation": "Account is 32 days overdue (delinquency cap at 210 days)."
        },
        {
          "factor": "repayment_velocity",
          "factorDisplayName": "Repayment Velocity",
          "rawValue": 35000,
          "normalizedScore": 70.00,
          "weight": 0.1974,
          "contribution": 13.82,
          "isMissing": false,
          "agentExplanation": "Collected ₹35,000 of ₹50,000 principal (70.0%)."
        }
      ],
      "intent": [
        {
          "factor": "ptp_kept_rate",
          "factorDisplayName": "PTP Kept Rate (EMIs Paid / Total)",
          "rawValue": "18 / 24",
          "normalizedScore": 75.00,
          "weight": 0.2776,
          "contribution": 0.29,
          "isMissing": false,
          "agentExplanation": "Borrower honored 18 of 24 scheduled EMIs (75.0%)."
        }
      ]
    },
    "computedAt": "2026-08-21T10:26:00.000Z"
  }
}
```

#### `POST /v1/score/simulate`
Evaluates "what if" factor overrides during a live call without persisting changes to the database.
* **Body**:
```json
{
  "loanId": "LN1000001",
  "overrides": {
    "last_coll_amount": 10000,
    "od_days": 5
  }
}
```
* **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "loanNo": "LN1000001",
    "baseline": {
      "abilityScore": 62.40,
      "abilityBand": "MEDIUM",
      "intentScore": 58.70,
      "intentBand": "MEDIUM",
      "cohort": "FENCE_SITTER"
    },
    "simulated": {
      "abilityScore": 81.20,
      "abilityBand": "HIGH",
      "intentScore": 78.40,
      "intentBand": "HIGH",
      "cohort": "OOPS"
    },
    "deltas": {
      "deltaAbility": 18.80,
      "deltaIntent": 19.70,
      "cohortChanged": true
    },
    "simulationSummary": "Simulated overrides resulted in Ability: 81.2 (+18.8) and Intent: 78.4 (+19.7). Cohort shifted from FENCE_SITTER to OOPS."
  }
}
```

---

## 5. Critical Domain Interrogations & Spec Clarifications

1. **Missing Data Handling (Zero Silent Substitution)**:
   - When numeric inputs (`TOTAL_INCOME`, `FOIR`, `LAST_COLL_DATE`) are missing from lender feeds, they are stored as `null` and displayed as `null`.
   - In the Ability scorecard, missing factors receive `weight = 0`, and the remaining observed weights are dynamically rescaled so $\sum w_{\text{observed}} = 1.0$.
2. **Ghost Feeds Omission**:
   - `bounce_pressure (0.10)`, `balance_cover (0.09)`, and `employment_tenure (0.05)` have no data in MFI feeds. The legacy card's constant `50` placeholder (which injected 24% static noise) was completely eliminated.
3. **FOIR Collinearity Interrogation**:
   - The legacy card derived `income_stability` from income while also scoring `emi_burden (FOIR)`. We isolated debt burden to `emi_burden` and evaluate verified income presence independently, preventing double-counting of FOIR.
4. **Target Leakage Refusal**:
   - Excluded `AMOUNT_PAID_30D` (future outcome), `PAID_WITHIN_30D` (target label), `MEMBER_NAME`, and `LOAN_NO` from the Intent model.

---

## 6. What Was Built, What Was Not Built, and Future Roadmap

### What Was Built:
- Fully working TypeScript / PostgreSQL backend running from a single documented command.
- Streaming memory-bounded CSV parser handling 25,000 records at ~807 rows/sec with $<25\text{MB}$ peak RAM.
- Empirical Logistic Regression Intent model evaluated on held-out test data (AUC: `0.8514`, KS: `55.59%`).
- Complete 3x3 Cohort aggregation, filtering, drilldown, and live what-if simulation APIs.
- Comprehensive mathematical unit tests + database integration tests + API E2E tests (26/26 passing in Vitest).
- Comprehensive documentation (`MODEL.md`, `DECISIONS.md`, `README.md`, and Postman Collection).

### What Was NOT Built (and Why):
Per **Section 4.5 of the Assignment Specification**:
- **No User Interface**: The UI is explicitly reserved for Assignment 2. The REST API exposed here serves as the exact consumption contract.
- **No Cloud Deployment / Infrastructure**: Designed and validated to run deterministically on local developer machines via single-command Docker or npm scripts.
- **No External Messaging / Payment Gateways**: WhatsApp/SMS triggers and UPI payment webhooks were omitted to keep the focus on scoring mathematics and ingestion performance.

### What We Would Build With Another Two Days:
1. **Distributed Asynchronous Job Queue (Redis / BullMQ)**:
   - Transition from in-process streaming to a distributed BullMQ worker cluster to support concurrent multi-gigabyte lender file imports with horizontal worker auto-scaling.
2. **WebSocket Real-Time Progress Stream**:
   - Broadcast live percentage progress and row ingest counters directly to the frontend dashboard over WebSockets rather than HTTP polling.
3. **Multi-Tenant Lender Feed Mapping Engine**:
   - Provide a dynamic schema mapper allowing call center managers to map arbitrary lender CSV headers to internal domain entities via JSON schema configurations.
4. **Automated Drift Detection & Shadow Retraining Pipeline**:
   - Implement Population Stability Index (PSI) monitoring that automatically alerts data engineers when borrower feature distributions deviate significantly from the training snapshot.
