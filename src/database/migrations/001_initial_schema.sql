-- Enable pgcrypto extension for UUID generation if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Import Jobs Table
CREATE TABLE IF NOT EXISTS import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    total_rows INTEGER DEFAULT 0,
    processed_rows INTEGER DEFAULT 0,
    failed_rows INTEGER DEFAULT 0,
    error_log JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- 2. Loans Table
CREATE TABLE IF NOT EXISTS loans (
    loan_no VARCHAR(100) PRIMARY KEY,
    member_name VARCHAR(255),
    mobile_number VARCHAR(50),
    is_valid_mobile BOOLEAN DEFAULT false,
    state VARCHAR(100),
    district VARCHAR(100),
    rural_urban VARCHAR(50),
    product VARCHAR(100),
    disbursement_date DATE,
    tenure INTEGER,
    total_instal INTEGER,
    principal_total NUMERIC(15, 2),
    outstanding_principal NUMERIC(15, 2),
    prin_collected NUMERIC(15, 2),
    int_collected NUMERIC(15, 2),
    last_emi NUMERIC(15, 2),
    total_arrear NUMERIC(15, 2),
    total_emi_paid_count INTEGER,
    last_coll_date DATE,
    last_coll_amount NUMERIC(15, 2),
    od_days INTEGER,
    od_bucket VARCHAR(50),
    status VARCHAR(50),
    total_income NUMERIC(15, 2),
    total_expense NUMERIC(15, 2),
    foir NUMERIC(6, 4),
    age INTEGER,
    cycle INTEGER,
    paid_within_30d INTEGER,
    amount_paid_30d NUMERIC(15, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Scores Table
CREATE TABLE IF NOT EXISTS scores (
    loan_no VARCHAR(100) PRIMARY KEY REFERENCES loans(loan_no) ON DELETE CASCADE,
    ability_score NUMERIC(5, 2) NOT NULL,
    ability_band VARCHAR(20) NOT NULL CHECK (ability_band IN ('HIGH', 'MEDIUM', 'LOW')),
    intent_score NUMERIC(5, 2) NOT NULL,
    intent_band VARCHAR(20) NOT NULL CHECK (intent_band IN ('HIGH', 'MEDIUM', 'LOW')),
    cohort VARCHAR(50) NOT NULL CHECK (cohort IN (
        'WILFUL_DEFAULTER', 'PROCRASTINATOR', 'OOPS',
        'EVASION_RISK', 'FENCE_SITTER', 'CASHFLOW_CRUNCH',
        'LOST_CAUSE', 'STRUGGLER', 'DISTRESSED'
    )),
    model_version VARCHAR(50) NOT NULL,
    factor_breakdown JSONB NOT NULL,
    agent_call_script TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- High-Performance Composite Indexes for Sub-50ms Dashboard Queries
CREATE INDEX IF NOT EXISTS idx_scores_cohort ON scores(cohort);
CREATE INDEX IF NOT EXISTS idx_loans_filtering ON loans(state, product, od_bucket, outstanding_principal);
CREATE INDEX IF NOT EXISTS idx_loans_od_days ON loans(od_days);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);
