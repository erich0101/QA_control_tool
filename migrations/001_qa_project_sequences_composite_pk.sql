-- Migration: Fix qa_project_sequences PK to be composite (project_id, prefix)
-- This enables ON CONFLICT (project_id, prefix) used by keyGenerator.
-- Idempotent: only acts if PK is not yet composite.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'qa_project_sequences_pkey'
          AND table_name = 'qa_project_sequences'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.key_column_usage
            WHERE constraint_name = 'qa_project_sequences_pkey'
              AND column_name = 'prefix'
        ) THEN
            ALTER TABLE qa_project_sequences DROP CONSTRAINT qa_project_sequences_pkey;
            ALTER TABLE qa_project_sequences ADD PRIMARY KEY (project_id, prefix);
            RAISE NOTICE 'Migrated qa_project_sequences PK to composite (project_id, prefix)';
        ELSE
            RAISE NOTICE 'qa_project_sequences already has composite PK, skipping';
        END IF;
    ELSE
        RAISE NOTICE 'qa_project_sequences has no PK named qa_project_sequences_pkey, skipping';
    END IF;
END $$;
