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

// ---------- generic RPC helper ----------
async function rpcCall(method, params) {
  const res = await fetch(CONFIG.SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(method + ": " + (j.error.message || JSON.stringify(j.error)));
  return j.result;
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
    const r = await rpcCall("getTokenSupply", [CONFIG.FOMOC_CA]);
    const cur = Number(r.value.uiAmount);
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

// ---------- boot ----------
(async function init() {
  await loadPrice();
  loadSupply();
  loadWallet();
  setInterval(async () => {
    await loadPrice();
    loadSupply();
    loadWallet();
  }, 30000);
})();
})();