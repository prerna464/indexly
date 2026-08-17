/* ════════════════════════════════════════════
   BACKFILL-MARKET-DATA.JS
   ONE-TIME SCRIPT — replaces each index's ENTIRE series
   with real daily closing data for the given date range
   (default: 5 years back through today).

   Run once via GitHub Actions ("Backfill Market Data" workflow,
   manually triggered), or locally: node backfill-market-data.js

   After running this once, your existing update-market-data.js
   script continues appending new days as normal — this script
   does not need to run again unless you want to re-pull history.
════════════════════════════════════════════ */

const fs   = require("fs");
const path = require("path");

const FMP_API_KEY = process.env.FMP_API_KEY;

const DATA_FILE = path.join(__dirname, "assets", "js", "market-data.js");

const START_DATE = "2016-08-15";
const END_DATE    = new Date().toISOString().slice(0, 10); // today

// Same source split as the daily update script, so history and future
// daily entries stay consistent (no seam mismatch between providers).
const FMP_SYMBOLS = {
  sp500:    "%5EGSPC",
  nasdaq:   "%5EIXIC",
  hangseng: "%5EHSI",
};

const YAHOO_SYMBOLS = {
  stoxx600: "%5ESTOXX",
  nifty50:  "%5ENSEI",
};

function toUnix(dateStr) {
  return Math.floor(new Date(dateStr + "T00:00:00Z").getTime() / 1000);
}

async function fetchFmpFullHistory(symbol) {
  const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&from=${START_DATE}&to=${END_DATE}&apikey=${FMP_API_KEY}`;
  const res  = await fetch(url);
  const json = await res.json();
  const arr  = Array.isArray(json) ? json : json.historical;
  if (!arr || !arr.length) throw new Error(`FMP: no data for ${symbol}`);

  // FMP returns newest-first — filter to range, drop nulls, reverse to oldest-first
  return arr
    .filter(row => row.date >= START_DATE && row.date <= END_DATE)
    .filter(row => row.close !== null && row.close !== undefined)
    .map(row => ({ date: row.date, close: row.close }))
    .reverse();
}

async function fetchYahooFullHistory(symbol) {
  const period1 = toUnix(START_DATE);
  const period2 = toUnix(END_DATE) + 86400; // include today fully
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;
  const res  = await fetch(url);
  const json = await res.json();
  const result     = json.chart.result[0];
  const timestamps = result.timestamp;
  const closes     = result.indicators.quote[0].close;

  const out = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] === null || closes[i] === undefined) continue;
    const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
    if (date < START_DATE || date > END_DATE) continue;
    out.push({ date, close: closes[i] });
  }
  return out;
}

// Replaces the ENTIRE `key: [ ... ]` array in the file with fresh entries.
function replaceSeries(fileText, key, entries) {
  const regex = new RegExp(`(${key}:\\s*\\[)([\\s\\S]*?)(\\n(\\s*)\\])`);
  const match = fileText.match(regex);
  if (!match) {
    console.warn(`⚠ Could not find series "${key}" in market-data.js — skipping.`);
    return fileText;
  }
  const indent = match[4] + "  ";
  const lines  = entries.map(e => `${indent}{ date: "${e.date}", close: ${e.close} }`).join(",\n");
  const replacement = match[1] + "\n" + lines + `\n${match[4]}]`;
  return fileText.replace(regex, replacement);
}

async function main() {
  if (!FMP_API_KEY) {
    console.error("Missing FMP_API_KEY environment variable.");
    process.exit(1);
  }

  let fileText = fs.readFileSync(DATA_FILE, "utf8");

  for (const [key, symbol] of Object.entries(FMP_SYMBOLS)) {
    try {
      const entries = await fetchFmpFullHistory(symbol);
      fileText = replaceSeries(fileText, key, entries);
      console.log(`✔ ${key}: ${entries.length} days loaded (${entries[0].date} → ${entries[entries.length - 1].date})`);
    } catch (err) {
      console.error(`✘ ${key}: FAILED — ${err.message}`);
    }
  }

  for (const [key, symbol] of Object.entries(YAHOO_SYMBOLS)) {
    try {
      const entries = await fetchYahooFullHistory(symbol);
      fileText = replaceSeries(fileText, key, entries);
      console.log(`✔ ${key}: ${entries.length} days loaded (${entries[0].date} → ${entries[entries.length - 1].date})`);
    } catch (err) {
      console.error(`✘ ${key}: FAILED — ${err.message}`);
    }
  }

  fs.writeFileSync(DATA_FILE, fileText, "utf8");
  console.log("market-data.js fully backfilled with real historical data.");
}

main();
