/* ════════════════════════════════════
   BENCHRETURN — S&P 500 vs NASDAQ 100
   Uses MARKET_DATA from market-data.js
════════════════════════════════════ */

(function () {
  "use strict";

  const KEYS = ["sp500", "nasdaq100"];

  const COLORS = {
    sp500:     "#C1432A",
    nasdaq100: "#3D5A80",
  };

  const RISK_FREE_RATE = 0.037; // 4-week T-bill yield, ~Aug 2026, source: tradingeconomics.com/united-states/4-week-bill-yield
  const LABELS = MARKET_DATA.meta.labels;
  const SERIES = MARKET_DATA.series;

  let state = {
    range:      "1Y",
    customFrom: null,
    customTo:   null,
  };

  // Most recent date across BOTH series, so "Last updated" is always accurate
  // even if one index (manually updated) lags behind the other (auto-updated).
  const LAST_DATE = KEYS
    .map(k => SERIES[k][SERIES[k].length - 1].date)
    .reduce((max, d) => (d > max ? d : max));

  // ── Helpers (same logic as homepage) ──
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

  function getSlice(key, start, end) {
    const dates = SERIES[key].map(p => p.date);
    const si = findClosestIndex(start, dates);
    const ei = findClosestIndex(end, dates);
    return SERIES[key].slice(si, ei + 1);
  }

  // ── Metrics ──
  function computeMetrics(slice) {
    const n = slice.length;
    if (n < 2) return null;

    const startClose = slice[0].close;
    const endClose    = slice[n - 1].close;
    const returnPct   = ((endClose - startClose) / startClose) * 100;

    const startDate = new Date(slice[0].date + "T00:00:00Z");
    const endDate   = new Date(slice[n - 1].date + "T00:00:00Z");
    const years     = Math.max((endDate - startDate) / (1000 * 60 * 60 * 24 * 365.25), 1 / 365.25);
    const cagrPct   = (Math.pow(endClose / startClose, 1 / years) - 1) * 100;

    let volPct = null, maxDDPct = null, sharpe = null;

    if (n >= 3) {
      const dailyReturns = [];
      for (let i = 1; i < n; i++) {
        dailyReturns.push((slice[i].close - slice[i - 1].close) / slice[i - 1].close);
      }
      const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
      const variance = dailyReturns.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / (dailyReturns.length - 1);
      const stdDev = Math.sqrt(variance);
      volPct = stdDev * Math.sqrt(252) * 100;

      if (volPct > 0) {
        sharpe = (cagrPct / 100 - RISK_FREE_RATE) / (volPct / 100);
      }
    }

    // Max drawdown works with as few as 2 points
    let peak = slice[0].close, maxDD = 0;
    for (let i = 0; i < n; i++) {
      peak = Math.max(peak, slice[i].close);
      const dd = (slice[i].close - peak) / peak;
      maxDD = Math.min(maxDD, dd);
    }
    maxDDPct = maxDD * 100;

    return { returnPct, cagrPct, volPct, maxDDPct, sharpe, days: n };
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

  function fmtPct(v) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
  }

  function fmtPctAbs(v) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return `${v.toFixed(2)}%`;
  }

  function cellClass(v) {
    if (v === null || v === undefined || isNaN(v)) return "muted";
    return v >= 0 ? "gain" : "loss";
  }

  function renderMetricsTable() {
    const { start, end } = getStartEndDates();
    const m = {};
    KEYS.forEach(key => { m[key] = computeMetrics(getSlice(key, start, end)); });

    const rows = [
      { label: "Return",                 get: x => x ? fmtPct(x.returnPct) : "—",       cls: x => x ? cellClass(x.returnPct) : "muted" },
      { label: "CAGR",                   get: x => x ? fmtPct(x.cagrPct) : "—",          cls: x => x ? cellClass(x.cagrPct) : "muted" },
      { label: "Annualized Volatility",  get: x => x ? fmtPctAbs(x.volPct) : "—",        cls: () => "muted" },
      { label: "Maximum Drawdown",       get: x => x ? fmtPctAbs(x.maxDDPct) : "—",      cls: () => "loss" },
      { label: "Sharpe Ratio",           get: x => x && x.sharpe !== null ? x.sharpe.toFixed(2) : "—", cls: x => x && x.sharpe !== null ? cellClass(x.sharpe) : "muted" },
    ];

    const tbody = document.getElementById("riskTableBody");
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.label}</td>
        <td class="metric-value ${r.cls(m.sp500)}">${r.get(m.sp500)}</td>
        <td class="metric-value ${r.cls(m.nasdaq100)}">${r.get(m.nasdaq100)}</td>
      </tr>
    `).join("");

    const daySpan = (new Date(end) - new Date(start)) / 86400000;
    const note = document.querySelector(".compare-metrics-panel .compare-note");
    if (note) {
      note.textContent = daySpan < 30
        ? "Metrics update automatically based on the date range selected above. CAGR is annualized and can look extreme over very short periods — treat it as illustrative only below 1 month."
        : "Metrics update automatically based on the date range selected above.";
    }
  }

  // ── Chart ──
  let chartInstance = null;

  function updateChart() {
    const { start, end } = getStartEndDates();
    const canvas = document.getElementById("compareChart");

    const datasets = KEYS.map(key => {
      const slice = getSlice(key, start, end);
      const base  = slice[0].close;
      return {
        label:            LABELS[key],
        data:             slice.map(p => ({ x: toTS(p.date), y: ((p.close - base) / base) * 100 })),
        borderColor:      COLORS[key],
        backgroundColor:  COLORS[key],
        borderWidth:      2,
        pointRadius:      0,
        pointHoverRadius: 4,
        tension:          0.15,
      };
    });

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
              label: item => ` ${item.dataset.label}: ${item.parsed.y >= 0 ? "+" : ""}${item.parsed.y.toFixed(2)}%`,
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
              callback: v => `${v}%`,
            },
          },
        },
      },
    });
  }

  // ── Master render ──
  function renderAll() {
    renderRangeContext();
    renderMetricsTable();
    updateChart();
  }

  // ── Event wiring (same pattern as homepage) ──
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

  function setDefaultCustomDates() {
    document.getElementById("customFrom").value = addDays(LAST_DATE, -90);
    document.getElementById("customTo").value   = LAST_DATE;
    document.getElementById("customFrom").max   = LAST_DATE;
    document.getElementById("customTo").max     = LAST_DATE;
  }

  // ── Init ──
  function init() {
    wireRangeButtons();
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