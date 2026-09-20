// ============================================================
// $FOMOC ANALYTICS
// Data sources: DexScreener (live stats/price) + Solana public
// RPC (burns from total supply, wallet holdings). No backend,
// no API keys — safe to host on a static GitHub site.
//
// BURNS ARE TRACKED FROM TOTAL SUPPLY:
//   The mint authority is revoked, so total supply can ONLY
//   decrease — every unit that disappears is a burn.
//   burned = INITIAL_SUPPLY - currentSupply
//
// >>> CONFIG — review these <<<
//   WALLET_ADDRESS : FOMO.FAMILY (FMCapital) Solana wallet.
//   INITIAL_SUPPLY : exact supply minted at launch (found on-chain).
//                    Do not edit unless the token relaunches.
//   DECIMALS       : $FOMOC token decimals (9 on-chain).
// ============================================================
(() => {
const CONFIG = {
  FOMOC_CA: "BQ12haucCzhBqyYfuxhcovysh85WeB6ZFQTdrFwKmREV",
  DEXSCREENER_URL: "https://dexscreener.com/solana/BQ12haucCzhBqyYfuxhcovysh85WeB6ZFQTdrFwKmREV",
  FOMO_PROFILE_URL: "https://fomo.family/profile/FMCapital",
  WALLET_ADDRESS: "Hp133dtw7F9oSVaNCeA1uckLN7eNaAepDHt41Yz5o76Z", // FMCapital Solana wallet
  INITIAL_SUPPLY: 1000000000, // 1,000,000,000 $FOMOC minted at launch (pump.fun, verified on-chain)
  DECIMALS: 9,
  SOLANA_RPC: "https://api.mainnet-beta.solana.com",
};

const $ = id => document.getElementById(id);

// Public Solana RPCs, tried in order. The free endpoints are IP-rate-limited
// ("Access forbidden"), so we rotate + retry across several.
const RPC_ENDPOINTS = [
  "https://api.mainnet-beta.solana.com",
  "https://api.mainnet-beta.solana.com",
  "https://rpc.ankr.com/solana",
  "https://solana-mainnet.g.alchemy.com/v2/demo",
  "https://solana.publicnode.com",
  "https://solana.drpc.org",
];

// ---------- generic RPC helper (multi-endpoint, retries) ----------
async function rpcCall(method, params, tries = 3) {
  let lastErr;
  for (let t = 0; t < tries; t++) {
    for (const rpc of RPC_ENDPOINTS) {
      try {
        const res = await fetch(rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const j = await res.json();
        if (j.error) throw new Error(j.error.message || "RPC error");
        return j.result;
      } catch (e) { lastErr = e; /* try next endpoint */ }
    }
    await new Promise(r => setTimeout(r, 700 * (t + 1)));
  }
  throw lastErr || new Error("RPC unavailable");
}

function setText(id, text) { const el = $(id); if (el) el.textContent = text; }

const fmtAmount = n =>
  n == null ? "—" :
  n >= 1e6 ? (n / 1e6).toFixed(2) + "M" :
  n >= 1e3 ? (n / 1e3).toFixed(2) + "K" :
  Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const fmtUsd = n =>
  n == null ? "—" :
  n >= 1e9 ? "$" + (n / 1e9).toFixed(2) + "B" :
  n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" :
  n >= 1e3 ? "$" + (n / 1e3).toFixed(2) + "K" :
  "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
const shortAddr = a => a ? a.slice(0, 4) + "…" + a.slice(-4) : "—";

// ---------- current price (DexScreener) ----------
let PRICE = null;
async function loadPrice() {
  try {
    const res = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + CONFIG.FOMOC_CA);
    const j = await res.json();
    const p = j.pairs && j.pairs[0];
    if (p && p.priceUsd) PRICE = Number(p.priceUsd);
  } catch (e) { /* price stays null */ }
}

// ---------- burns from total supply ----------
// We keep the earliest supply seen each day in localStorage and
// measure the drop between days. Headline totals are exact because
// the mint authority is revoked (supply can only go down).
const SNAP_KEY = "fomocSupplySnap";
const todayKey = () => new Date().toISOString().slice(0, 10);

function loadSnaps() {
  try { return JSON.parse(localStorage.getItem(SNAP_KEY) || "{}"); }
  catch { return {}; }
}
function saveSnaps(s) { localStorage.setItem(SNAP_KEY, JSON.stringify(s)); }

async function loadSupply() {
  const note = $("burn-note");
  try {
    const r = await rpcCall("getAccountInfo", [CONFIG.FOMOC_CA, { encoding: "jsonParsed" }]);
    const info = r.value && r.value.data && r.value.data.parsed && r.value.data.parsed.info;
    if (!info) throw new Error("mint not found");
    const cur = Number(info.supply) / 10 ** CONFIG.DECIMALS;
    const burned = CONFIG.INITIAL_SUPPLY - cur;

    // persist today's EARLIEST supply as the day baseline
    const today = todayKey();
    const snaps = loadSnaps();
    if (snaps[today] == null) { snaps[today] = cur; saveSnaps(snaps); }

    // build a time-ordered list of day baselines
    const days = Object.keys(snaps).sort();
    const rows = [];
    for (let i = 0; i < days.length; i++) {
      if (i === days.length - 1 && days[i] === today) {
        // today: burn so far = today's baseline - current supply
        rows.push({ date: today, burned: Math.max(0, snaps[today] - cur) });
      } else if (days[i + 1]) {
        rows.push({ date: days[i], burned: Math.max(0, snaps[days[i]] - snaps[days[i + 1]]) });
      }
    }
    rows.reverse();

    const tbl = $("burn-rows");
    if (rows.length) {
      tbl.innerHTML = rows.map(row =>
        "<tr><td>" + row.date + "</td><td class='num mono'>" + fmtAmount(row.burned) + " $FOMOC</td>" +
        "<td class='num'>≈ " + (PRICE ? fmtUsd(row.burned * PRICE) : "—") + "</td></tr>"
      ).join("");
    } else {
      tbl.innerHTML = "<tr><td colspan='3' class='empty'>Daily tracking starts on the first visit. Total burned is live below.</td></tr>";
    }

    const last24 = rows.filter(r => Date.now() - new Date(r.date).getTime() < 864e5)
      .reduce((a, r) => a + r.burned, 0);
    const last7 = rows.filter(r => Date.now() - new Date(r.date).getTime() < 7 * 864e5)
      .reduce((a, r) => a + r.burned, 0);

    setText("burn-total", fmtAmount(burned) + " $FOMOC");
    setText("burn-7d", fmtAmount(last7) + " $FOMOC");
    setText("burn-24h", fmtAmount(last24) + " $FOMOC");
    note.textContent = "Source: total supply · initial " + fmtAmount(CONFIG.INITIAL_SUPPLY) + " · current " + fmtAmount(cur) + " · mint authority revoked";
  } catch (e) {
    note.textContent = "Couldn't read supply: " + e.message;
    $("burn-rows").innerHTML = "<tr><td colspan='3' class='empty'>Supply read failed.</td></tr>";
  }
}

// ---------- FOMO.FAMILY wallet holdings ----------
async function loadWallet() {
  const note = $("wl-note");
  if (!CONFIG.WALLET_ADDRESS) { note.textContent = "Source: Solana RPC · add WALLET_ADDRESS in analytics.js to enable"; setText("wl-address", "—"); return; }
  setText("wl-address", shortAddr(CONFIG.WALLET_ADDRESS));
  try {
    const res = await rpcCall("getTokenAccountsByOwner",
      [CONFIG.WALLET_ADDRESS, { mint: CONFIG.FOMOC_CA }, { encoding: "jsonParsed" }]);
    const acc = res.value && res.value[0];
    if (!acc || !acc.account || !acc.account.data) { setText("wl-amount", "0"); setText("wl-value", "$0"); return; }
    const info = acc.account.data.parsed && acc.account.data.parsed.info;
    const amount = info && info.tokenAmount ? Number(info.tokenAmount.uiAmount) : 0;
    setText("wl-amount", fmtAmount(amount) + " $FOMOC");
    setText("wl-value", PRICE ? fmtUsd(amount * PRICE) : "$—");
  } catch (e) {
    note.textContent = "Wallet lookup failed: " + e.message;
  }
}

// ---------- custom price chart (keyless OHLC via GeckoTerminal) ----------
const fmtAxis = v => v >= 1 ? "$" + Number(v).toFixed(4) : "$" + Number(v).toPrecision(4);

function renderChart(ohlcv) {
  const el = $("chart-plot");
  const empty = $("chart-empty");
  const closes = ohlcv.map(c => Number(c[4]));
  const times = ohlcv.map(c => Number(c[0]));

  const W = 1000, H = 420, PL = 14, PR = 14, PT = 22, PB = 26;
  const iw = W - PL - PR, ih = H - PT - PB;
  const min = Math.min(...closes), max = Math.max(...closes);
  const range = (max - min) || 1;
  const lo = min - range * 0.08, hi = max + range * 0.08;
  const X = i => PL + (i / (closes.length - 1 || 1)) * iw;
  const Y = v => PT + (1 - (v - lo) / (hi - lo)) * ih;

  const line = closes.map((c, i) => (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(c).toFixed(1)).join(" ");
  const area = line +
    " L" + X(closes.length - 1).toFixed(1) + "," + (PT + ih).toFixed(1) +
    " L" + X(0).toFixed(1) + "," + (PT + ih).toFixed(1) + " Z";

  let grid = "", ylab = "";
  for (let g = 0; g <= 4; g++) {
    const yy = PT + (g / 4) * ih;
    const val = hi - (g / 4) * (hi - lo);
    grid += `<line class="chart-grid" x1="${PL}" y1="${yy}" x2="${W - PR}" y2="${yy}"/>`;
    ylab += `<text class="chart-axis" x="${W - PR - 4}" y="${yy - 4}" text-anchor="end">${fmtAxis(val)}</text>`;
  }
  let xlab = "";
  for (let g = 0; g <= 4; g++) {
    const i = Math.round((g / 4) * (closes.length - 1));
    const xx = X(i);
    const d = new Date(times[i] * 1000);
    xlab += `<text class="chart-axis" x="${xx}" y="${H - 8}" text-anchor="middle">${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</text>`;
  }

  const last = closes[closes.length - 1];
  const lx = X(closes.length - 1), ly = Y(last);
  const pill = `<text class="chart-last" x="${Math.min(lx, W - PR - 60)}" y="${Math.max(ly - 10, 16)}" text-anchor="end">$${fmtAxis(last)}</text>`;

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">
    <defs><linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#E0F0F0" stop-opacity=".5"/>
      <stop offset="100%" stop-color="#E0F0F0" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}
    <path class="chart-area" d="${area}"/>
    <path class="chart-line" d="${line}"/>
    ${ylab}${xlab}${pill}
  </svg>`;
  if (empty) empty.style.display = "none";
}

async function loadChart() {
  const empty = $("chart-empty");
  if (!empty) return;
  const gt = "https://api.geckoterminal.com/api/v2/networks/solana";
  try {
    const poolsRes = await fetch(gt + "/tokens/" + CONFIG.FOMOC_CA + "/pools?page=1");
    const poolsJson = await poolsRes.json();
    const pool = poolsJson.data && poolsJson.data[0];
    if (!pool) throw new Error("no pool");
    const pid = pool.attributes.address;
    for (const tf of ["day", "hour"]) {
      const res = await fetch(gt + "/pools/" + pid + "/ohlcv/" + tf + "?aggregate=1&limit=60");
      const j = await res.json();
      const list = j.data && j.data.attributes && j.data.attributes.ohlcv_list;
      if (list && list.length) { renderChart(list); return; }
    }
    throw new Error("no history");
  } catch (e) {
    empty.textContent = "Chart needs trading history on a price feed (GeckoTerminal) to render.\nIt will appear as trades accumulate.";
  }
}

// ---------- boot ----------
(async function init() {
  await loadPrice();
  loadSupply();
  loadWallet();
  loadChart();
  setInterval(async () => {
    await loadPrice();
    loadSupply();
    loadWallet();
  }, 30000);
})();
})();