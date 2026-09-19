// ---------- mobile nav ----------
const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");
navToggle.addEventListener("click", () => navLinks.classList.toggle("open"));
navLinks.querySelectorAll("a").forEach(a =>
  a.addEventListener("click", () => navLinks.classList.remove("open"))
);

// ---------- tag reveal targets ----------
document.querySelectorAll(
  ".section-head, .b-card, .fee-item, .step, .faq, .buy-card, .live-card"
).forEach(el => el.classList.add("reveal"));
document.querySelectorAll(".bento .b-card:nth-child(2), .steps .step:nth-child(2), .fee-list .fee-item:nth-child(2)").forEach(el => el.classList.add("reveal-d1"));
document.querySelectorAll(".bento .b-card:nth-child(3), .steps .step:nth-child(3), .fee-list .fee-item:nth-child(3)").forEach(el => el.classList.add("reveal-d2"));
document.querySelectorAll(".steps .step:nth-child(4)").forEach(el => el.classList.add("reveal-d3"));

// ---------- reveal on scroll ----------
const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add("in-view");
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach(el => io.observe(el));

// ---------- counters ----------
const cio = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target;
    const target = +el.dataset.count;
    const dur = 900;
    const t0 = performance.now();
    const tick = now => {
      const p = Math.min((now - t0) / dur, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    cio.unobserve(el);
  });
}, { threshold: 0.5 });
document.querySelectorAll(".num[data-count]").forEach(el => cio.observe(el));

// ---------- copy contract ----------
document.querySelectorAll(".copy-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      const old = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = old), 1500);
    } catch {
      btn.textContent = "n/a";
    }
  });
});

// ---------- live stats (DexScreener, no key) ----------
// Free, keyless, no backend. Set the $FOMOC token address (CA) below.
// DexScreener resolves it and returns real price / mcap / volume / liquidity.
const FOMOC_CA = "HtgfqcohJW9Wh3tmTwf7hUpCho5GvzcEs3bvUgxD1REV";

const $ = id => document.getElementById(id);
const fmt = n =>
  n == null ? "$—" :
  n >= 1e9 ? "$" + (n / 1e9).toFixed(2) + "B" :
  n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" :
  n >= 1e3 ? "$" + (n / 1e3).toFixed(2) + "K" :
  "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtPrice = n =>
  n == null ? "$—" :
  n >= 1 ? "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 4 }) :
  "$" + Number(n).toFixed(10);

function setStat(id, text) { const el = $(id); if (el) el.textContent = text; }

function fmtChange(el, pct) {
  if (pct == null) { el.textContent = "24h —"; return; }
  const cls = pct >= 0 ? "up" : "down";
  el.textContent = (pct >= 0 ? "+" : "") + Number(pct).toFixed(2) + "% · 24h";
  el.className = "live-sub mono " + cls;
}

async function loadDex() {
  if (!FOMOC_CA) {
    setStat("stat-price", "add CA");
    setStat("stat-mcap", "add CA");
    setStat("stat-volume", "add CA");
    setStat("stat-liq", "add CA");
    return;
  }
  try {
    const res = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + FOMOC_CA);
    const j = await res.json();
    const p = j.pairs && j.pairs[0];
    if (!p) { setStat("stat-price", "no pair"); return; }

    setStat("stat-price", fmtPrice(p.priceUsd));
    fmtChange($("stat-price-change"), p.priceChange && p.priceChange.h24);

    setStat("stat-mcap", fmt(p.marketCap));
    setStat("stat-mcap-label", "FDV " + (p.fdv ? "$" + (p.fdv / 1e6).toFixed(1) + "M" : "—"));

    setStat("stat-volume", fmt(p.volume && p.volume.h24));
    setStat("stat-volume-label", "24h");

    setStat("stat-liq", fmt(p.liquidity && p.liquidity.usd));
    setStat("stat-liq-label", p.dexId ? "on " + p.dexId : "");
  } catch (e) {
    setStat("stat-price", "unavailable");
    setStat("stat-mcap", "unavailable");
    setStat("stat-volume", "unavailable");
    setStat("stat-liq", "unavailable");
    console.error(e);
  }
}

loadDex();
setInterval(loadDex, 30000);
