-- Select the destination catalog and nyc_taxi schema in the dashboard dataset editor.
SELECT
  pickup_hour,
  pickup_borough,
  SUM(trip_count) AS trip_count,
  ROUND(SUM(total_fare_usd) / NULLIF(SUM(trip_count), 0), 2) AS avg_fare_usd
FROM gold_hourly_activity
GROUP BY pickup_hour, pickup_borough
ORDER BY pickup_hour, pickup_borough;
