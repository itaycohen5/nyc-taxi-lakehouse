# Databricks notebook source
"""Stage small, repeatable Parquet batches from the Databricks NYC taxi sample."""
import re
from datetime import datetime

from pyspark.sql import functions as F

dbutils.widgets.text("catalog", spark.catalog.currentCatalog())
dbutils.widgets.dropdown("batch", "first", ["first", "second", "invalid"])

catalog = dbutils.widgets.get("catalog")
if not re.fullmatch(r"[A-Za-z0-9_-]+", catalog) or catalog in {"samples", "system"}:
    raise ValueError("Set catalog to a writable Unity Catalog catalog.")

schema = f"`{catalog}`.nyc_taxi"
volume = f"/Volumes/{catalog}/nyc_taxi/landing"
batch = dbutils.widgets.get("batch")

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {schema}")
spark.sql(f"CREATE VOLUME IF NOT EXISTS {schema}.landing")
spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {schema}.pickup_prefix_reference
    USING DELTA AS
    SELECT * FROM VALUES
      ('100', 'Manhattan'), ('101', 'Manhattan'), ('102', 'Manhattan'),
      ('103', 'Staten Island'), ('104', 'Bronx'), ('112', 'Brooklyn'),
      ('111', 'Queens'), ('113', 'Queens'), ('114', 'Queens'), ('116', 'Queens')
    AS lookup(zip_prefix, pickup_borough)
""")

sample = spark.table("samples.nyctaxi.trips").select(
    F.col("tpep_pickup_datetime").alias("pickup_at"),
    F.col("tpep_dropoff_datetime").alias("dropoff_at"),
    F.col("pickup_zip").cast("string"),
    F.col("trip_distance").cast("double").alias("distance_miles"),
    F.col("fare_amount").cast("double").alias("fare_usd"),
)

if batch == "invalid":
    trips = spark.createDataFrame(
        [(datetime(2016, 2, 1, 13), datetime(2016, 2, 1, 12), "10001", 2.0, 10.0)],
        sample.schema,
    )
else:
    trip_month = F.trunc(F.to_date("pickup_at"), "month")
    months = (
        sample.where(F.year("pickup_at") == 2016)
        .groupBy(trip_month.alias("month")).count()
        .where("count >= 10000").orderBy("month").limit(2).collect()
    )
    if len(months) != 2:
        raise ValueError("Expected two months with at least 10,000 trips in the sample.")
    month = months[0 if batch == "first" else 1]["month"]
    trips = (
        sample.where(trip_month == F.lit(month))
        .orderBy("pickup_at", "dropoff_at", "pickup_zip", "distance_miles", "fare_usd")
        .limit(10000)
    )

destination = f"{volume}/trips/{batch}"
trips.coalesce(1).write.mode("ignore").parquet(destination)
print(f"Batch available at {destination}")
print(f"Configure taxi.volume = {volume} and taxi.reference = {schema}.pickup_prefix_reference")
