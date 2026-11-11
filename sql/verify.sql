-- Set the catalog to your writable workspace catalog before running.
USE SCHEMA nyc_taxi;

-- Run after each update. Bronze must equal Silver + Quarantine.
SELECT bronze, silver, quarantined, gold,
       bronze = silver + quarantined AND silver = gold AS reconciled
FROM
  (SELECT count(*) AS bronze FROM bronze_trips)
  CROSS JOIN (SELECT count(*) AS silver FROM silver_trips)
  CROSS JOIN (SELECT count(*) AS quarantined FROM trip_quarantine)
  CROSS JOIN (SELECT coalesce(sum(trip_count), 0) AS gold FROM gold_hourly_activity);

-- The new batch appears once. This result stays stable on a no-op rerun.
SELECT source_file, count(*) AS records
FROM bronze_trips
GROUP BY source_file
ORDER BY source_file;

-- The injected fixture should return exactly one INVALID_TRIP_TIME record.
SELECT source_file, rejection_reason, count(*) AS records
FROM trip_quarantine
WHERE source_file LIKE '%/invalid/%'
GROUP BY source_file, rejection_reason;
