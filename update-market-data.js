/* ════════════════════════════════════════════
   UPDATE-MARKET-DATA.JS
   Fetches the latest daily close for each index and
   appends it into assets/js/market-data.js.

   Run manually:   node update-market-data.js
   Or let GitHub Actions run it daily (see update-data.yml).

   Requires an FMP API key in the FMP_API_KEY environment
   variable (set as a GitHub secret when using Actions,
   or `set FMP_API_KEY=yourkey` locally before running).
════════════════════════════════════════════ */

const fs   = require("fs");
const path = require("path");

const FMP_API_KEY = process.env.FMP_API_KEY;

// Adjust this path if your repo structure differs.Btw this is my current github repo structure.
const DATA_FILE = path.join(__dirname, "assets", "js", "market-data.js");

// ── Indices covered by FMP (adjust symbol/key if you rename stoxx600 -> ftse) ──
const FMP_SYMBOLS = {
  sp500:    "%5EGSPC",
  nasdaq:   "%5EIXIC",
  hangseng: "%5EHSI",
};

// ── Indices fetched from Yahoo Finance (FMP free tier doesn't cover these) ──
const YAHOO_SYMBOLS = {
  nifty50: "%5ENSEI",
  stoxx600: "%5ESTOXX",
};

async function fetchFmpLatestClose(symbol) {
  const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&apikey=${FMP_API_KEY}`;
  const res  = await fetch(url);
  const json = await res.json();
  const arr  = Array.isArray(json) ? json : json.historical;
  if (!arr || !arr.length) throw new Error(`FMP: no data returned for ${symbol}`);
  const latest = arr[0]; // FMP returns newest-first
  return { date: latest.date, close: latest.close };
}

async function fetchYahooLatestClose(symbol) {
  const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=1d`;
  const res  = await fetch(url);
  const json = await res.json();
  const result     = json.chart.result[0];
  const timestamps = result.timestamp;
  const closes     = result.indicators.quote[0].close;

  // Walk backward until we find a real close — Yahoo sometimes appends
  // a placeholder entry for the current/incomplete session with close: null.
  for (let i = closes.length - 1; i >= 0; i--) {
    if (closes[i] !== null && closes[i] !== undefined) {
      const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
      return { date, close: closes[i] };
    }
  }

  throw new Error(`No valid close found for ${symbol}`);
}
// Finds `key: [ ...entries... ]` in the file text and appends a new
// { date, close } entry before the closing bracket, if not already present.
function appendEntry(fileText, key, entry) {
  const regex = new RegExp(`(${key}:\\s*\\[)([\\s\\S]*?)(\\n(\\s*)\\])`);
  const match = fileText.match(regex);

  if (!match) {
    console.warn(`⚠ Could not find series "${key}" in market-data.js — skipping.`);
    return fileText;
  }

  const body   = match[2];
  const indent = match[4];

  if (body.includes(`"${entry.date}"`)) {
    console.log(`${key}: ${entry.date} already present, skipping.`);
    return fileText;
  }

  const newLine     = `      { date: "${entry.date}", close: ${entry.close} }`;
  const updatedBody = body.replace(/\s*$/, "") + `,\n${newLine}`;
  const replacement = match[1] + updatedBody + `\n${indent}]`;

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
      const entry = await fetchFmpLatestClose(symbol);
      fileText = appendEntry(fileText, key, entry);
      console.log(`✔ ${key}: ${entry.date} = ${entry.close}`);
    } catch (err) {
      console.error(`✘ ${key}: FAILED — ${err.message}`);
    }
  }

  for (const [key, symbol] of Object.entries(YAHOO_SYMBOLS)) {
    try {
      const entry = await fetchYahooLatestClose(symbol);
      fileText = appendEntry(fileText, key, entry);
      console.log(`✔ ${key}: ${entry.date} = ${entry.close}`);
    } catch (err) {
      console.error(`✘ ${key}: FAILED — ${err.message}`);
    }
  }

  fs.writeFileSync(DATA_FILE, fileText, "utf8");
  console.log("market-data.js updated.");
}

main();
