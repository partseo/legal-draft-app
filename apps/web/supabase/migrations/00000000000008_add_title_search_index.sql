CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_cases_title_trgm ON cases USING gin (title gin_trgm_ops);
