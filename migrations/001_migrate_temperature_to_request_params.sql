-- Migration 001: Migrate temperature column to request_params
--
-- This migration moves temperature data from the independent column to the request_params JSON field.
-- After this migration, the temperature column can be safely removed.

-- Step 1: Migrate existing temperature data to request_params
-- For each log that has a temperature value but no request_params, create the JSON structure
UPDATE request_logs
SET request_params = JSON_OBJECT('temperature', CAST(temperature AS REAL))
WHERE temperature IS NOT NULL
  AND temperature != ''
  AND (request_params IS NULL OR request_params = 'null' OR request_params = '');

-- Step 2: For logs that already have request_params, merge temperature into it
UPDATE request_logs
SET request_params = json_patch(
  COALESCE(request_params, '{}'),
  JSON_OBJECT('temperature', CAST(temperature AS REAL))
)
WHERE temperature IS NOT NULL
  AND temperature != ''
  AND request_params IS NOT NULL
  AND request_params != 'null'
  AND request_params != ''
  AND json_extract(request_params, '$.temperature') IS NULL;

-- Step 3: Verify the migration
-- Run this query to check the results:
-- SELECT
--   COUNT(*) as total_logs,
--   SUM(CASE WHEN temperature IS NOT NULL AND temperature != '' THEN 1 ELSE 0 END) as logs_with_temperature,
--   SUM(CASE WHEN request_params IS NOT NULL AND request_params != 'null' AND request_params != '' THEN 1 ELSE 0 END) as logs_with_request_params,
--   SUM(CASE WHEN json_extract(request_params, '$.temperature') IS NOT NULL THEN 1 ELSE 0 END) as logs_with_temperature_in_params
-- FROM request_logs;
