/* ════════════════════════════════════
   INDEXWATCH — app logic
   Uses MARKET_DATA from market-data.js
════════════════════════════════════ */

(function () {
  "use strict";

  const COLORS = {
    sp500:    "#C1432A",
    nasdaq:   "#3D5A80",
    stoxx600: "#7F539C",
    hangseng: "#B8860B",
    nifty50:  "#2E86AB",
  };

  const LABELS = MARKET_DATA.meta.labels;
  const SERIES = MARKET_DATA.series;
  const KEYS   = Object.keys(SERIES);

  let state = {
    range:      "1Y",
    customFrom: null,
    customTo:   null,
    selected:   new Set(["sp500", "nasdaq", "stoxx600", "hangseng", "nifty50"]),
    chartMode:  "pct",
  };

  const ALL_DATES = SERIES[KEYS[0]].map(p => p.date);
  const LAST_DATE = ALL_DATES[ALL_DATES.length - 1];

  // ── Helpers ──
  function findClosestIndex(dateStr, dates) {
    let lo = 0, hi = dates.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (dates[mid] <= dateStr) { ans = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return ans;
  }

  function addDays(dateStr, days) {
    const d = new Date(dateStr + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function rangeToStartDate(range) {
    switch (range) {
      case "1D":  return addDays(LAST_DATE, -1);
      case "5D":  return addDays(LAST_DATE, -7);
      case "1M":  return addDays(LAST_DATE, -30);
      case "3M":  return addDays(LAST_DATE, -91);
      case "6M":  return addDays(LAST_DATE, -182);
      case "YTD": return LAST_DATE.slice(0, 4) + "-01-01";
      default:    return addDays(LAST_DATE, -365);
    }
  }

  function getStartEndDates() {
    if (state.range === "CUSTOM" && state.customFrom && state.customTo)
      return { start: state.customFrom, end: state.customTo };
    return { start: rangeToStartDate(state.range), end: LAST_DATE };
  }

  function toTS(dateStr) {
    return new Date(dateStr + "T00:00:00Z").getTime();
  }

  function fmtDate(ts, opts) {
    return new Date(ts).toLocaleDateString("en-IN", Object.assign({ timeZone: "UTC" }, opts));
  }

  // ── Data ──
  function getReturnsForRange() {
    const { start, end } = getStartEndDates();
    const results = {};
    KEYS.forEach(key => {
      const dates = SERIES[key].map(p => p.date);
      const si = findClosestIndex(start, dates);
      const ei = findClosestIndex(end, dates);
      const s  = SERIES[key][si].close;
      const e  = SERIES[key][ei].close;
      results[key] = { pct: ((e - s) / s) * 100, startClose: s, endClose: e, startDate: dates[si], endDate: dates[ei] };
    });
    return results;
  }

  function getSeriesForChart() {
    const { start, end } = getStartEndDates();
    const out = {};
    KEYS.forEach(key => {
      const dates = SERIES[key].map(p => p.date);
      const si    = findClosestIndex(start, dates);
      const ei    = findClosestIndex(end, dates);
      const slice = SERIES[key].slice(si, ei + 1);
      const base  = slice[0].close;
      out[key] = slice.map(p => ({
        x:          toTS(p.date),
        pct:        ((p.close - base) / base) * 100,
        normalized: (p.close / base) * 100,
      }));
    });
    return out;
  }

  // ── Renders ──
  function renderRangeContext() {
    const { start, end } = getStartEndDates();
    const fmt = s => fmtDate(toTS(s), { day: "numeric", month: "short", year: "numeric" });
    const ctx = document.getElementById("rangeContext");
    if (ctx) ctx.innerHTML = `Showing returns from <strong>${fmt(start)}</strong> to <strong>${fmt(end)}</strong>`;
    const asOf = document.getElementById("asOfDate");
    if (asOf) asOf.textContent = fmt(LAST_DATE);
    const upd = document.getElementById("lastUpdatedDate");
    if (upd) upd.textContent = fmt(LAST_DATE);
  }

  function renderTable(returns) {
    const tbody = document.getElementById("returnTableBody");
    tbody.style.opacity = "0";
    const rows = KEYS.map(key => {
      const r = returns[key], cls = r.pct >= 0 ? "gain" : "loss", sgn = r.pct >= 0 ? "+" : "";
      return `<tr><td><div class="rt-market-cell"><span class="rt-dot" style="background:${COLORS[key]}"></span>${LABELS[key]}</div></td><td class="rt-return-cell ${cls}">${sgn}${r.pct.toFixed(2)}%</td></tr>`;
    }).join("");
    requestAnimationFrame(() => { tbody.innerHTML = rows; requestAnimationFrame(() => { tbody.style.opacity = "1"; }); });
  }

  function renderRanking(returns) {
    const list = document.getElementById("bestPerformerList");
    const sorted = KEYS.slice().sort((a, b) => returns[b].pct - returns[a].pct);
    const items = sorted.map((key, i) => {
      const r = returns[key], cls = r.pct >= 0 ? "gain" : "loss", sgn = r.pct >= 0 ? "+" : "";
      return `<li><span class="bp-rank">${i+1}</span><span class="bp-dot" style="background:${COLORS[key]}"></span><span class="bp-name">${LABELS[key]}</span><span class="bp-value ${cls}">${sgn}${r.pct.toFixed(2)}%</span></li>`;
    }).join("");
    list.style.opacity = "0";
    requestAnimationFrame(() => { list.innerHTML = items; requestAnimationFrame(() => { list.style.opacity = "1"; }); });
  }

  function renderIndexPicker() {
    const picker = document.getElementById("indexPicker");
    picker.innerHTML = '<legend>Choose markets to compare (2\u20135)</legend>';
    KEYS.forEach(key => {
      const checked = state.selected.has(key);
      const label = document.createElement("label");
      label.className   = "idx-chip" + (checked ? " checked" : "");
      label.style.color = COLORS[key];
      label.innerHTML   = `<input type="checkbox" value="${key}" ${checked ? "checked" : ""}><span class="idx-dot" style="background:${COLORS[key]}"></span><span style="color:var(--ink)">${LABELS[key]}</span>`;
      const input = label.querySelector("input");
      input.addEventListener("change", () => onToggleIndex(key, input));
      picker.appendChild(label);
    });
  }

  function onToggleIndex(key, input) {
    if (input.checked) {
      if (state.selected.size >= 5) { input.checked = false; return; }
      state.selected.add(key);
    } else {
      if (state.selected.size <= 2) { input.checked = true; return; }
      state.selected.delete(key);
    }
    input.closest(".idx-chip").classList.toggle("checked", input.checked);
    updateChart();
  }

  function renderChartSummary(returns) {
    const el = document.getElementById("chartSummary");
    if (!el) return;
    const sorted = KEYS.slice().sort((a, b) => returns[b].pct - returns[a].pct);
    const bestPct = returns[sorted[0]].pct, worstPct = returns[sorted[sorted.length-1]].pct;
    const leaders = sorted.filter(k => bestPct - returns[k].pct <= 2);
    const others  = sorted.filter(k => !leaders.includes(k));
    const fmtPct  = p => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
    const nm      = k => LABELS[k];
    let lead;
    if (leaders.length === 1) {
      const rest = others.slice(0,2).map(k => `${nm(k)} (${fmtPct(returns[k].pct)})`);
      lead = rest.length ? `${nm(leaders[0])} gained ${fmtPct(bestPct)}, outperforming ${rest.join(" and ")}.` : `${nm(leaders[0])} gained ${fmtPct(bestPct)} over this period.`;
    } else {
      lead = `${leaders.map(k => `${nm(k)} (${fmtPct(returns[k].pct)})`).join(", ")} led with closely matched gains over this period.`;
    }
    const worst = sorted[sorted.length-1];
    const spread = (bestPct - worstPct).toFixed(2);
    const { start, end } = getStartEndDates();
    const daySpan = (new Date(end) - new Date(start)) / 86400000;
    const caveat = daySpan <= 10 ? `<p class="chart-summary-caveat">Note: global markets close at different times, so this short-term comparison reflects each market's most recent available close, not a single simultaneous moment.</p>` : "";
    el.innerHTML = `${caveat}<p>${lead}</p><p>${nm(worst)} delivered ${fmtPct(worstPct)}, the weakest performer among the selected indices.</p><p>The gap between the best and worst performing market was ${spread} percentage points.</p>`;
  }

  // ── Chart ──
  let chartInstance = null;

  function updateChart() {
    const mode   = state.chartMode;
    const canvas = document.getElementById("comparisonChart");
    const series = getSeriesForChart();

    const datasets = Array.from(state.selected).map(key => ({
      label:            LABELS[key],
      data:             series[key].map(p => ({ x: p.x, y: mode === "pct" ? p.pct : p.normalized })),
      borderColor:      COLORS[key],
      backgroundColor:  COLORS[key],
      borderWidth:      2,
      pointRadius:      0,
      pointHoverRadius: 4,
      tension:          0.15,
    }));

    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    chartInstance = new Chart(canvas, {
      type: "line",
      data: { datasets },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        animation:           { duration: 400 },
        interaction:         { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "bottom",
            labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle", font: { family: "Inter", size: 11 } },
          },
          tooltip: {
            callbacks: {
              title: items => items.length ? fmtDate(items[0].parsed.x, { day: "numeric", month: "short", year: "numeric" }) : "",
              label: item => {
                const v = item.parsed.y;
                return mode === "pct" ? ` ${item.dataset.label}: ${v >= 0 ? "+" : ""}${v.toFixed(2)}%` : ` ${item.dataset.label}: ${v.toFixed(2)}`;
              },
            },
          },
        },
        scales: {
          x: {
            type:  "time",
            grid:  { display: false },
            afterBuildTicks: scale => {
              const ticksCount = 6;
              const min  = scale.min;
              const max  = scale.max;
              const step = (max - min) / (ticksCount - 1);
              scale.ticks = Array.from({ length: ticksCount }, (_, i) => ({
                value: Math.round(min + step * i),
              }));
            },
            ticks: {
              font:     { family: "Inter", size: 10 },
              color:    "#6B6459",
              callback: val => fmtDate(val, { month: "short", year: "2-digit" }),
            },
          },
          y: {
            grid:  { color: "#E4DFD3" },
            ticks: {
              font:     { family: "Inter", size: 10 },
              color:    "#6B6459",
              callback: v => mode === "pct" ? `${v}%` : `${v}`,
            },
          },
        },
      },
    });
  }

  // ── Master render ──
  function renderAll() {
    const returns = getReturnsForRange();
    renderRangeContext();
    renderTable(returns);
    renderRanking(returns);
    renderChartSummary(returns);
    updateChart();
  }

  // ── Event wiring ──
  function wireRangeButtons() {
    const buttons = document.querySelectorAll(".range-btn");
    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        buttons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const range = btn.dataset.range, isCustom = range === "CUSTOM";
        document.getElementById("customFrom").disabled       = !isCustom;
        document.getElementById("customTo").disabled         = !isCustom;
        document.getElementById("applyCustomRange").disabled = !isCustom;
        if (isCustom) return;
        state.range = range;
        renderAll();
      });
    });
    document.getElementById("applyCustomRange").addEventListener("click", () => {
      const from = document.getElementById("customFrom").value;
      const to   = document.getElementById("customTo").value;
      buttons.forEach(b => b.classList.remove("active"));
      if (!from || !to || from >= to) { alert("Please choose a valid date range (From must be before To)."); return; }
      state.range = "CUSTOM"; state.customFrom = from; state.customTo = to;
      renderAll();
      document.querySelector('[data-range="CUSTOM"]').classList.add("active");
    });
  }

  function wireChartModeToggle() {
    document.querySelectorAll(".mode-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.chartMode = btn.dataset.mode;
        updateChart();
      });
    });
  }

  function setDefaultCustomDates() {
    document.getElementById("customFrom").value = addDays(LAST_DATE, -90);
    document.getElementById("customTo").value   = LAST_DATE;
    document.getElementById("customFrom").max   = LAST_DATE;
    document.getElementById("customTo").max     = LAST_DATE;
  }

  // ── Init ──
  function init() {
    renderIndexPicker();
    wireRangeButtons();
    wireChartModeToggle();
    setDefaultCustomDates();
    renderAll();
    setTimeout(() => { if (chartInstance) chartInstance.resize(); }, 200);
  }

  window.addEventListener("resize", () => {
    if (chartInstance) {
        chartInstance.resize();
        chartInstance.update();
    }
});

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();