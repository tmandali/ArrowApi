-- Arrow.Jobs.Postgres — `arrow_jobs` tablosu DDL (Postgres / PGlite uyumlu)
-- Tüm request tipleri tek tablodadır; `job_type` sütunu (tam AssemblyName.FullName)
-- TRequest ayrımını yapar (Redis'teki TypeKey benzeri).

CREATE TABLE IF NOT EXISTS arrow_jobs
(
    id             uuid         PRIMARY KEY,
    job_type       text         NOT NULL,
    name           text,
    request        jsonb        NOT NULL,
    state          smallint     NOT NULL DEFAULT 0, -- ArrowJobState enum (0=Queued ... 4=Cancelled)
    result_path    text,
    error_message  text,
    batch_count    integer      NOT NULL DEFAULT 0,
    total_rows     bigint       NOT NULL DEFAULT 0,
    trace_id       text,
    parent_span_id text,
    trace_flags    smallint,
    request_hash   text,
    root_job_id    uuid         NOT NULL,
    parent_job_id  uuid,
    created_at     timestamptz  NOT NULL DEFAULT now(),
    completed_at   timestamptz
);

-- FindDuplicateAsync / ListAsync yolları
CREATE INDEX IF NOT EXISTS ix_arrow_jobs_type_hash_state
    ON arrow_jobs (job_type, request_hash, state);

CREATE INDEX IF NOT EXISTS ix_arrow_jobs_type_created
    ON arrow_jobs (job_type, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_arrow_jobs_root_job
    ON arrow_jobs (root_job_id);
