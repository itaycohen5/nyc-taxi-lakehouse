// Page transitions and cancellable tween adapted from Frost Desk (MIT).
// See FROST-DESK-LICENSE.txt for the original copyright and permission notice.
const desk = document.querySelector("#desk");
const content = desk.querySelector(".fd-content");
const pages = [...desk.querySelectorAll(".fd-page")];
const nav = desk.querySelector(".fd-nav");
const navs = [...nav.querySelectorAll("a")];
const glint = desk.querySelector(".fd-glint");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const boroughSelect = document.querySelector("#borough");
const format = new Intl.NumberFormat("en-US");
const metrics = ["bronze", "silver", "quarantine"];
const runLabels = {
  first: ["Initial load", "Loaded the first batch of 10,000 records."],
  second: ["New file", "Loaded 10,000 additional records."],
  "no-op": ["Replay", "Processed zero new files. The counts matched the previous run."],
  invalid: ["Invalid trip", "Quarantined the fixture as INVALID_TRIP_TIME."],
};

const ease = {
  in: t => t ** 3,
  out: t => 1 - (1 - t) ** 3,
  io: t => t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2,
};
let generation = 0;
let snapshot;
let current = 0;
let busy = false;
let queued = null;

function tween(ms, draw, easing = ease.io, delay = 0) {
  if (reducedMotion.matches) {
    draw(1);
    return Promise.resolve(true);
  }
  return new Promise(done => {
    const started = performance.now() + delay;
    const token = generation;
    const step = now => {
      if (token !== generation) return done(false);
      const progress = Math.max(0, Math.min(1, (now - started) / ms));
      if (now >= started) draw(easing(progress));
      if (progress < 1) requestAnimationFrame(step);
      else done(true);
    };
    requestAnimationFrame(step);
  });
}

function addCell(row, value) {
  const cell = row.insertCell();
  cell.textContent = value;
  return cell;
}

function renderChart() {
  const counts = Array(24).fill(0);
  for (const { hour, borough, trips } of snapshot.hourly) {
    if (!boroughSelect.value || borough === boroughSelect.value) counts[hour] += trips;
  }
  const maxTrips = Math.max(...counts, 1);
  const totalTrips = counts.reduce((total, count) => total + count, 0);
  const targetStep = Math.max(1, maxTrips / 5);
  const magnitude = 10 ** Math.floor(Math.log10(targetStep));
  const step = [1, 2, 2.5, 5, 10].map(value => value * magnitude)
    .find(value => value >= targetStep && Number.isInteger(value));
  const top = Math.ceil(maxTrips / step) * step;
  const axis = document.querySelector("#axis");
  const guides = document.querySelector("#chart-guides");
  axis.replaceChildren();
  guides.replaceChildren();
  for (let tick = 0; tick <= top; tick += step) {
    const position = `${tick / top * 100}%`;
    const label = document.createElement("span");
    label.style.bottom = position;
    label.textContent = format.format(tick);
    axis.append(label);
    const line = document.createElement("span");
    line.style.bottom = position;
    guides.append(line);
  }
  document.querySelector("#selection-summary").textContent =
    `${format.format(totalTrips)} trips · ${boroughSelect.selectedOptions[0].textContent}`;

  const chart = document.querySelector("#chart");
  const values = document.querySelector("#hourly-values");
  const hours = document.querySelector("#chart-hours");
  const detail = document.querySelector("#hour-detail");
  detail.textContent = "Trips per hour";
  chart.replaceChildren();
  hours.replaceChildren();
  values.replaceChildren();
  counts.forEach((count, hour) => {
    const label = `${String(hour).padStart(2, "0")}:00`;
    const description = `${label} · ${format.format(count)} trips`;
    const column = document.createElement("button");
    column.type = "button";
    column.className = "fd-column";
    column.setAttribute("aria-label", description);
    column.title = description;
    const showCount = () => { detail.textContent = description; };
    column.addEventListener("pointerenter", showCount);
    column.addEventListener("focus", showCount);
    column.addEventListener("click", showCount);
    const bar = document.createElement("i");
    bar.style.height = `${count / top * 100}%`;
    column.append(bar);
    chart.append(column);
    const hourTick = document.createElement("span");
    hourTick.textContent = label.slice(0, 2);
    hours.append(hourTick);
    if (!reducedMotion.matches) bar.animate(
      [{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }],
      { duration: 480, delay: hour * 16, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" },
    );
    const row = values.insertRow();
    addCell(row, label);
    addCell(row, format.format(count));
  });
}

function enter(index) {
  if (!reducedMotion.matches) pages[index].querySelectorAll(".fd-card, #runs tr").forEach((card, order) => {
    card.getAnimations().forEach(animation => animation.cancel());
    card.animate(
      [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }],
      { duration: 420, delay: order * 60, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" },
    );
  });
  if (!snapshot) return;
  const finalRun = snapshot.runs.at(-1);
  if (index === 0) {
    metrics.forEach((metric, order) => {
      const count = document.getElementById(metric);
      count.textContent = "0";
      tween(860, t => { count.textContent = format.format(Math.round(finalRun[metric] * t)); }, ease.out, order * 70);
    });
    renderChart();
  }
  if (index === 1) {
    pages[index].querySelectorAll("[data-stage]").forEach((ring, order) => {
      const count = finalRun[ring.dataset.stage];
      const share = 100 * count / finalRun.bronze;
      ring.setAttribute("aria-label", `${format.format(count)} records, ${share.toFixed(2)}% of Bronze`);
      tween(900, t => {
        ring.querySelector("strong").textContent = format.format(Math.round(count * t));
        ring.style.setProperty("--fill", `${share * t}%`);
      }, ease.out, order * 110);
    });
  }
  if (index === 2) {
    const stroke = document.querySelector("#run-stroke");
    const max = Math.max(...snapshot.runs.map(run => run.bronze));
    const points = snapshot.runs.map((run, position) => [12 + position * 152, 129 - run.bronze / max * 114]);
    const path = points.reduce((line, [x, y], position) => {
      if (!position) return `M${x},${y}`;
      const [previousX, previousY] = points[position - 1];
      const midpoint = (previousX + x) / 2;
      return `${line} C${midpoint},${previousY} ${midpoint},${y} ${x},${y}`;
    }, "");
    stroke.setAttribute("d", path);
    stroke.setAttribute("stroke-dashoffset", "1");
    tween(900, t => stroke.setAttribute("stroke-dashoffset", 1 - t));
    const rate = 100 * finalRun.silver / finalRun.bronze;
    const label = document.querySelector("#pass-rate");
    tween(900, t => {
      const progress = rate * t;
      label.textContent = `${progress.toFixed(2)}%`;
      label.parentElement.style.setProperty("--fill", `${progress}%`);
    }, ease.out);
  }
}

function show(index) {
  pages.forEach((page, position) => {
    page.hidden = position !== index;
    page.classList.toggle("is-on", position === index);
    if (position === index) navs[position].setAttribute("aria-current", "page");
    else navs[position].removeAttribute("aria-current");
  });
  nav.style.setProperty("--page", index);
  current = index;
}

async function go(index) {
  if (busy) {
    queued = index;
    return;
  }
  if (index === current) return;
  busy = true;
  generation++;
  await tween(380, t => {
    content.style.filter = `blur(${26 * t}px)`;
    content.style.opacity = 1 - t;
    content.style.transform = `scale(${1 - .02 * t})`;
  }, ease.in);

  show(index);
  pages[index].querySelector("h1").focus({ preventScroll: true });
  if (window.scrollY > desk.offsetTop) window.scrollTo(0, desk.offsetTop);
  enter(index);

  await tween(380, t => {
    content.style.filter = `blur(${26 * (1 - t)}px)`;
    content.style.opacity = t;
    content.style.transform = `scale(${1.02 - .02 * t})`;
  }, ease.out);
  content.style.filter = content.style.opacity = content.style.transform = "";
  glint.classList.remove("is-on");
  void glint.offsetWidth;
  glint.classList.add("is-on");
  busy = false;
  const next = queued;
  queued = null;
  if (next !== null) go(next);
}

function indexFromHash() {
  const index = pages.findIndex(page => `#${page.id}` === location.hash);
  return index < 0 ? 0 : index;
}

addEventListener("hashchange", () => go(indexFromHash()));
addEventListener("keydown", event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      event.target.matches("input, select, textarea, [contenteditable]")) return;
  if (/^[1-4]$/.test(event.key)) location.hash = pages[Number(event.key) - 1].id;
});
show(indexFromHash());

async function loadSnapshot() {
  const response = await fetch("./snapshot.json");
  if (!response.ok) throw new Error("Snapshot request failed");
  snapshot = await response.json();
  const date = document.querySelector("#snapshot-date");
  date.dateTime = date.textContent = snapshot.snapshotDate;
  const history = document.querySelector("#runs");
  for (const run of snapshot.runs) {
    const row = history.insertRow();
    const [label, description] = runLabels[run.phase];
    const name = addCell(row, label);
    const detail = document.createElement("small");
    detail.textContent = description;
    name.append(detail);
    metrics.forEach(metric => addCell(row, format.format(run[metric])));
  }
  const boroughs = [...new Set(snapshot.hourly.map(entry => entry.borough))].sort();
  for (const borough of boroughs) boroughSelect.add(new Option(borough, borough));
  boroughSelect.addEventListener("change", renderChart);
  enter(current);
}

loadSnapshot().catch(() => {
  document.querySelector("#load-error").hidden = false;
});
