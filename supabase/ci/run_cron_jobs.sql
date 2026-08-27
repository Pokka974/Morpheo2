-- CI-only: execute the body of every scheduled pg_cron job exactly once.
--
-- cron.schedule() stores its command as an opaque string and never parses it, so a job
-- referencing a dropped column schedules cleanly and then fails silently every night in
-- production. Migration 007 shipped three such statements. Running the bodies here is the
-- only way the pipeline can see them.
--
-- Everything runs inside a transaction that is rolled back, so this asserts the SQL is
-- valid against the real schema without leaving rows behind.

BEGIN;

DO $ci$
DECLARE
  job       record;
  job_count integer;
BEGIN
  SELECT count(*) INTO job_count FROM cron.job;

  IF job_count = 0 THEN
    RAISE EXCEPTION
      'No pg_cron jobs are scheduled — 007_pg_cron.sql registered nothing, so this check is vacuous';
  END IF;

  RAISE NOTICE 'Executing % scheduled cron job body(ies)', job_count;

  FOR job IN SELECT jobid, jobname, command FROM cron.job ORDER BY jobid LOOP
    RAISE NOTICE '  -> % (jobid %)', job.jobname, job.jobid;
    EXECUTE job.command;
  END LOOP;
END
$ci$;

ROLLBACK;
