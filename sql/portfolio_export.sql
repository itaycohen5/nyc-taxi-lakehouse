-- Run in the pipeline's catalog and nyc_taxi schema.
SELECT pickup_hour, pickup_borough, SUM(trip_count) AS trip_count
FROM gold_hourly_activity
GROUP BY pickup_hour, pickup_borough
ORDER BY pickup_hour, pickup_borough;
