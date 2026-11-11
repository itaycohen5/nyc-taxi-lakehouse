"""Combine a Databricks SQL export and the verification log for the public demo."""
import argparse
import json
from datetime import date
from pathlib import Path


def build_snapshot(hourly_path, runs_path, snapshot_date):
    hourly = [
        {"hour": int(hour), "borough": borough, "trips": int(trips)}
        for hour, borough, trips, *_ in json.loads(hourly_path.read_text(encoding="utf-8-sig"))
    ]
    runs = [
        {key: row[key] for key in ("phase", "bronze", "silver", "quarantine", "gold", "files", "injected")}
        for row in map(json.loads, runs_path.read_text(encoding="utf-8-sig").splitlines())
    ]
    if [run["phase"] for run in runs] != ["first", "second", "no-op", "invalid"]:
        raise ValueError("Expected the four verification runs in order.")
    if any(
        run["bronze"] != run["silver"] + run["quarantine"] or run["silver"] != run["gold"]
        for run in runs
    ):
        raise ValueError("Verification totals do not reconcile.")
    if sum(row["trips"] for row in hourly) != runs[-1]["gold"]:
        raise ValueError("The dashboard export and final Gold count do not reconcile.")
    return {"snapshotDate": snapshot_date.isoformat(), "runs": runs, "hourly": hourly}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("hourly", type=Path, help="Databricks SQL result.data_array as JSON")
    parser.add_argument("runs", type=Path, help="Verification records as JSON Lines")
    parser.add_argument("--date", type=date.fromisoformat, required=True)
    parser.add_argument("--output", type=Path, default=Path("docs/snapshot.json"))
    args = parser.parse_args()
    snapshot = build_snapshot(args.hourly, args.runs, args.date)
    args.output.write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")
