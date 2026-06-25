/* ════════════════════════════════════
   INDEXWATCH — app logic
   Uses MARKET_DATA from market-data.js
════════════════════════════════════ */

(function () {
  "use strict";

    const COLORS = {
    sp500:     "#C1432A",
    nasdaq:    "#3D5A80",
    stoxx600:  "#7F539C",
    hangseng:  "#B8860B",
    nifty50:   "#2E86AB",
  };

  const LABELS = MARKET_DATA.meta.labels;
  const SERIES = MARKET_DATA.series; // { key: [{date, close}, ...] }
  const KEYS = Object.keys(SERIES);

  // ── State ──
  let state = {
    range: "1Y",
    customFrom: null,
    customTo: null,
    selected: new Set(["sp500", "nasdaq", "stoxx600", "hangseng", "nifty50"]),
    chartMode: "pct", // 'pct' | 'normalized'
  };

  const ALL_DATES = SERIES[KEYS[0]].map(p => p.date);
  const LAST_DATE = ALL_DATES[ALL_DATES.length - 1];

  // ── Helpers ──
  function findClosestIndex(dateStr, dates) {
    // returns index of the closest date <= dateStr, or 0 if none
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
    const last = LAST_DATE;
    switch (range) {
      case "1D": return addDays(last, -1);
      case "5D": return addDays(last, -7); // calendar days to cover 5 trading days
      case "1M": return addDays(last, -30);
      case "3M": return addDays(last, -91);
      case "6M": return addDays(last, -182);
      case "YTD": return last.slice(0, 4) + "-01-01";
      case "1Y": return addDays(last, -365);
      default: return addDays(last, -365);
    }
  }

  function getStartEndDates() {
    if (state.range === "CUSTOM" && state.customFrom && state.customTo) {
      return { start: state.customFrom, end: state.customTo };
    }
    return { start: rangeToStartDate(state.range), end: LAST_DATE };
  }

  function getReturnsForRange() {
    const { start, end } = getStartEndDates();
    const results = {};
    KEYS.forEach(key => {
      const dates = SERIES[key].map(p => p.date);
      const startIdx = findClosestIndex(start, dates);
      const endIdx = findClosestIndex(end, dates);
      const startClose = SERIES[key][startIdx].close;
      const endClose = SERIES[key][endIdx].close;
      const pct = ((endClose - startClose) / startClose) * 100;
      results[key] = { pct, startClose, endClose, startDate: dates[startIdx], endDate: dates[endIdx] };
    });
    return results;
  }

  function getSeriesForChart() {
    const { start, end } = getStartEndDates();
    const out = {};
    KEYS.forEach(key => {
      const dates = SERIES[key].map(p => p.date);
      const startIdx = findClosestIndex(start, dates);
      const endIdx = findClosestIndex(end, dates);
      const slice = SERIES[key].slice(startIdx, endIdx + 1);
      const baseClose = slice[0].close;
      out[key] = slice.map(p => ({
        date: p.date,
        pct: ((p.close - baseClose) / baseClose) * 100,
        normalized: (p.close / baseClose) * 100,
      }));
    });
    return out;
  }

  // ── Render: range bar context text ──
  function renderRangeContext() {
    const { start, end } = getStartEndDates();
    const fmt = (s) => new Date(s + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const contextEl = document.getElementById("rangeContext");
    if (contextEl) {
      contextEl.innerHTML = `Showing returns from <strong>${fmt(start)}</strong> to <strong>${fmt(end)}</strong>`;
    }
    const asOfEl = document.getElementById("asOfDate");
    if (asOfEl) {
      asOfEl.textContent = fmt(LAST_DATE);
    }

const lastUpdatedEl = document.getElementById("lastUpdatedDate");
    if (lastUpdatedEl) {
      lastUpdatedEl.textContent = fmt(LAST_DATE);
    }

  }

  // ── Render: return table ──
  function renderTable(returns) {
    const tbody = document.getElementById("returnTableBody");
    tbody.style.opacity = "0";

    const rows = KEYS.map(key => {
      const r = returns[key];
      const cls = r.pct >= 0 ? "gain" : "loss";
      const sign = r.pct >= 0 ? "+" : "";
      return `
        <tr>
          <td>
            <div class="rt-market-cell">
              <span class="rt-dot" style="background:${COLORS[key]}"></span>
              ${LABELS[key]}
            </div>
          </td>
          <td class="rt-return-cell ${cls}">${sign}${r.pct.toFixed(2)}%</td>
        </tr>`;
    }).join("");

    requestAnimationFrame(() => {
      tbody.innerHTML = rows;
      requestAnimationFrame(() => { tbody.style.opacity = "1"; });
    });
  }

  // ── Render: best performers ranking ──
  function renderRanking(returns) {
    const list = document.getElementById("bestPerformerList");
    const sorted = KEYS.slice().sort((a, b) => returns[b].pct - returns[a].pct);

    const items = sorted.map((key, i) => {
      const r = returns[key];
      const cls = r.pct >= 0 ? "gain" : "loss";
      const sign = r.pct >= 0 ? "+" : "";
      return `
        <li>
          <span class="bp-rank">${i + 1}</span>
          <span class="bp-dot" style="background:${COLORS[key]}"></span>
          <span class="bp-name">${LABELS[key]}</span>
          <span class="bp-value ${cls}">${sign}${r.pct.toFixed(2)}%</span>
        </li>`;
    }).join("");

    list.style.opacity = "0";
    requestAnimationFrame(() => {
      list.innerHTML = items;
      requestAnimationFrame(() => { list.style.opacity = "1"; });
    });
  }

  // ── Render: index picker chips ──
  function renderIndexPicker() {
    const picker = document.getElementById("indexPicker");
    picker.innerHTML = '<legend>Choose markets to compare (2–5)</legend>';

    KEYS.forEach(key => {
      const checked = state.selected.has(key);
      const label = document.createElement("label");
      label.className = "idx-chip" + (checked ? " checked" : "");
      label.style.color = COLORS[key];
      label.innerHTML = `
        <input type="checkbox" value="${key}" ${checked ? "checked" : ""}>
        <span class="idx-dot" style="background:${COLORS[key]}"></span>
        <span style="color:var(--ink)">${LABELS[key]}</span>
      `;
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

  // ── Chart (Chart.js) ──
  let chartInstance = null;

  function buildDatasets() {
    const seriesData = getSeriesForChart();
    const mode = state.chartMode;
    return Array.from(state.selected).map(key => {

const pts = seriesData[key].map(p => ({
  x: new Date(p.date + "T00:00:00Z").getTime(),
  y: mode === "pct" ? p.pct : p.normalized,
}));
      return {
        label: LABELS[key],
        data: pts,
        borderColor: COLORS[key],
        backgroundColor: COLORS[key],
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.15,
      };
    });
  }

  function updateChart() {
    const datasets = buildDatasets();
    const mode = state.chartMode;

    if (!chartInstance) {
      const ctx = document.getElementById("comparisonChart").getContext("2d");
      chartInstance = new Chart(ctx, {
        type: "line",
        data: { datasets },
        options: chartOptions(mode),
      });
    } else {
      chartInstance.data.datasets = datasets;
      chartInstance.options = chartOptions(mode);
      chartInstance.update();
    }
  }

  function chartOptions(mode) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 450, easing: "easeOutCubic" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle", font: { family: "Inter", size: 11 } },
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              if (!items.length) return "";
              const ts = items[0].parsed.x;
              return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
            },
            label: (item) => {
              const v = item.parsed.y;
              if (mode === "pct") return ` ${item.dataset.label}: ${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
              return ` ${item.dataset.label}: ${v.toFixed(2)}`;
            },
          },
        },
      },
      scales: {

x: {
  type: "linear",
  grid: { display: false },
  ticks: {
    font: { family: "Inter", size: 10 },
    color: "#6B6459",
    maxTicksLimit: 6,
    callback: (val) => {
      const d = new Date(val);
      return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
    },
  },
},
        y: {
          grid: { color: "#E4DFD3" },
          ticks: {
            font: { family: "Inter", size: 10 },
            color: "#6B6459",
            callback: (v) => mode === "pct" ? `${v}%` : `${v}`,
          },
        },
      },
    };
  }

  // ── Master update: called on any range change ──
  // ── Render: auto-generated performance summary ──

  function renderChartSummary(returns) {
    const el = document.getElementById("chartSummary");
    if (!el) return;

    const sorted = KEYS.slice().sort((a, b) => returns[b].pct - returns[a].pct);
    const bestPct = returns[sorted[0]].pct;
    const worstPct = returns[sorted[sorted.length - 1]].pct;
    const CLOSE_THRESHOLD = 2; // percentage points

    const leaders = sorted.filter(key => bestPct - returns[key].pct <= CLOSE_THRESHOLD);
    const others = sorted.filter(key => !leaders.includes(key));

    const fmtPct = (p) => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
    const nameOf = (key) => LABELS[key];

    let leadSentence;
    if (leaders.length === 1) {
      const rest = others.slice(0, 2).map(k => `${nameOf(k)} (${fmtPct(returns[k].pct)})`);
      leadSentence = rest.length
        ? `${nameOf(leaders[0])} gained ${fmtPct(bestPct)}, outperforming ${rest.join(" and ")}.`
        : `${nameOf(leaders[0])} gained ${fmtPct(bestPct)} over this period.`;
    } else {
      const names = leaders.map(k => `${nameOf(k)} (${fmtPct(returns[k].pct)})`);
      leadSentence = `${names.join(", ")} led with closely matched gains over this period.`;
    }

    const worstKey = sorted[sorted.length - 1];
    const worstSentence = `${nameOf(worstKey)} delivered ${fmtPct(worstPct)}, the weakest performer among the selected indices.`;

    const spread = (bestPct - worstPct).toFixed(2);
    const spreadSentence = `The gap between the best and worst performing market was ${spread} percentage points.`;

const { start, end } = getStartEndDates();
    const daySpan = (new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24);
    const isShortRange = daySpan <= 10;

    const caveat = isShortRange
      ? `<p class="chart-summary-caveat">Note: global markets close at different times, so this short-term comparison reflects each market's most recent available close, not a single simultaneous moment.</p>`
      : "";

    el.innerHTML = `${caveat}<p>${leadSentence}</p><p>${worstSentence}</p><p>${spreadSentence}</p>`;
  }

  // ── Master update: called on any range change ──
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
    const customPanel = document.getElementById("customRangePanel");

    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        buttons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const range = btn.dataset.range;

        const isCustom = range === "CUSTOM";
        document.getElementById("customFrom").disabled = !isCustom;
        document.getElementById("customTo").disabled = !isCustom;
        document.getElementById("applyCustomRange").disabled = !isCustom;

        if (isCustom) {
          return; // wait for Apply
        }
        state.range = range;
        renderAll();
      });
    });

    document.getElementById("applyCustomRange").addEventListener("click", () => {
      const from = document.getElementById("customFrom").value;
      const to = document.getElementById("customTo").value;

      buttons.forEach(b => b.classList.remove("active"));

      if (!from || !to || from >= to) {
        alert("Please choose a valid date range (From must be before To).");
        return;
      }
      state.range = "CUSTOM";
      state.customFrom = from;
      state.customTo = to;
      renderAll();


      document.querySelector('[data-range="CUSTOM"]').classList.add("active");

    });
  }

  function wireChartModeToggle() {
    const buttons = document.querySelectorAll(".mode-btn");
    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        buttons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.chartMode = btn.dataset.mode;
        updateChart();
      });
    });
  }

  function setDefaultCustomDates() {
    document.getElementById("customFrom").value = addDays(LAST_DATE, -90);
    document.getElementById("customTo").value = LAST_DATE;
    document.getElementById("customFrom").max = LAST_DATE;
    document.getElementById("customTo").max = LAST_DATE;
  }

  // ── Init ──

  function init() {
  renderIndexPicker();
  wireRangeButtons();
  wireChartModeToggle();
  setDefaultCustomDates();
  renderAll();

  // Force Chart.js to recalculate canvas size after mobile layout settles
  setTimeout(() => {
    if (chartInstance) {
      chartInstance.resize();
    }
  }, 150);
}

  window.addEventListener('resize', () => {
  if (chartInstance) {
    chartInstance.resize();
  }
});

  document.addEventListener("DOMContentLoaded", init);
})();