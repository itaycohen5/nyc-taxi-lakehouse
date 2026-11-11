"""Triggered Lakeflow pipeline for NYC taxi trips."""
from pyspark import pipelines as dp
from pyspark.sql import functions as F


@dp.table(comment="Raw taxi records with source-file metadata.")
def bronze_trips():
    return (
        spark.readStream.format("cloudFiles")
        .option("cloudFiles.format", "parquet")
        .option("recursiveFileLookup", "true")
        .schema(
            "pickup_at TIMESTAMP, dropoff_at TIMESTAMP, pickup_zip STRING, "
            "distance_miles DOUBLE, fare_usd DOUBLE"
        )
        .load(f"{spark.conf.get('taxi.volume')}/trips")
        .select("*", F.col("_metadata.file_path").alias("source_file"))
        .withColumn("ingested_at", F.current_timestamp())
    )


@dp.temporary_view
def validated_trips():
    return spark.readStream.table("bronze_trips").withColumn(
        "rejection_reason",
        F.when(F.col("pickup_at").isNull() | F.col("dropoff_at").isNull(), "MISSING_TIME")
        .when(F.col("dropoff_at") <= F.col("pickup_at"), "INVALID_TRIP_TIME")
        .when(F.col("distance_miles").isNull() | F.isnan("distance_miles") |
              (F.col("distance_miles") <= 0), "INVALID_DISTANCE")
        .when(F.col("fare_usd").isNull() | F.isnan("fare_usd") |
              (F.col("fare_usd") < 0), "INVALID_FARE"),
    )


@dp.table(comment="Rejected source records and the first failed validation rule.")
def trip_quarantine():
    return spark.readStream.table("validated_trips").where("rejection_reason IS NOT NULL")


@dp.table(comment="Valid trips enriched with a ZIP-prefix borough lookup.")
def silver_trips():
    reference = spark.read.table(spark.conf.get("taxi.reference"))
    return (
        spark.readStream.table("validated_trips")
        .where("rejection_reason IS NULL")
        .drop("rejection_reason")
        .withColumn("zip_prefix", F.substring("pickup_zip", 1, 3))
        .join(F.broadcast(reference), "zip_prefix", "left")
        .drop("zip_prefix")
        .fillna({"pickup_borough": "Unknown"})
    )


@dp.materialized_view(comment="Taxi activity at the date, pickup-hour, and borough grain.")
def gold_hourly_activity():
    return (
        spark.read.table("silver_trips")
        .withColumn("trip_date", F.to_date("pickup_at"))
        .withColumn("pickup_hour", F.hour("pickup_at"))
        .groupBy("trip_date", "pickup_hour", "pickup_borough")
        .agg(
            F.count("*").alias("trip_count"),
            F.round(F.sum("fare_usd"), 2).alias("total_fare_usd"),
            F.round(F.avg("fare_usd"), 2).alias("avg_fare_usd"),
        )
    )
