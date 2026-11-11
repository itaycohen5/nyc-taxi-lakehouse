const format = new Intl.NumberFormat("en-US");
const hours = Array.from({ length: 24 }, (_, hour) => hour);
const boroughSelect = document.getElementById("borough");
const runLabels = {
  first: ["Initial load", "Ingested the first 10,000 records."],
  second: ["New file", "Ingested 10,000 additional records."],
  "no-op": ["Replay", "Reconciled all layer counts without a new file."],
  invalid: ["Invalid trip", "Quarantined the fixture as INVALID_TRIP_TIME."],
};

const hourLabel = (hour) => `${String(hour).padStart(2, "0")}:00`;

function addCell(row, value) {
  const cell = row.insertCell();
  cell.textContent = value;
  return cell;
}

function renderChart(rows) {
  const counts = Array(24).fill(0);
  for (const { hour, borough, trips } of rows) {
    if (!boroughSelect.value || borough === boroughSelect.value) counts[hour] += trips;
  }

  const maxTrips = Math.max(...counts, 1);
  const totalTrips = counts.reduce((total, count) => total + count, 0);
  document.getElementById("axis").textContent = `${format.format(maxTrips)} trips`;
  document.getElementById("selection-summary").textContent =
    `${format.format(totalTrips)} trips · ${boroughSelect.value || "All boroughs"}`;

  const bars = document.createDocumentFragment();
  const values = document.createElement("tbody");
  values.id = "hourly-values";
  for (const hour of hours) {
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${(counts[hour] / maxTrips) * 100}%`;
    bar.style.visibility = counts[hour] === 0 ? "hidden" : "visible";
    bar.title = `${hourLabel(hour)} · ${format.format(counts[hour])} trips`;
    bar.setAttribute("aria-hidden", "true");
    bars.append(bar);
    const row = values.insertRow();
    addCell(row, hourLabel(hour));
    addCell(row, format.format(counts[hour]));
  }
  document.getElementById("chart").replaceChildren(bars);
  document.getElementById("hourly-values").replaceWith(values);
}

async function loadSnapshot() {
  const response = await fetch("./snapshot.json");
  if (!response.ok) throw new Error("Snapshot request failed");
  const { snapshotDate, hourly, runs } = await response.json();
  const finalRun = runs.at(-1);
  for (const metric of ["bronze", "silver", "quarantine"]) {
    document.getElementById(metric).textContent = format.format(finalRun[metric]);
  }
  const date = document.getElementById("snapshot-date");
  date.dateTime = snapshotDate;
  date.textContent = snapshotDate;

  const history = document.getElementById("runs");
  for (const run of runs) {
    const row = history.insertRow();
    const [label, description] = runLabels[run.phase];
    const name = addCell(row, label);
    const detail = document.createElement("small");
    detail.textContent = description;
    name.append(detail);
    for (const metric of ["bronze", "silver", "quarantine"]) {
      addCell(row, format.format(run[metric]));
    }
  }

  const boroughs = [...new Set(hourly.map((entry) => entry.borough))].sort();
  for (const borough of boroughs) boroughSelect.add(new Option(borough, borough));
  boroughSelect.addEventListener("change", () => renderChart(hourly));
  renderChart(hourly);
}

loadSnapshot().catch(() => {
  document.getElementById("load-error").hidden = false;
});
