-- Migration: Add missing columns to qa_test_cases
-- The legacy SQLite schema had is_smoke/is_regression/is_integration/is_exploratory + priority
-- The PostgreSQL refactor omitted them, causing 500 errors in startExecution WHERE filters.

ALTER TABLE qa_test_cases
    ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'Media',
    ADD COLUMN IF NOT EXISTS is_smoke BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_regression BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_integration BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_exploratory BOOLEAN DEFAULT FALSE;
