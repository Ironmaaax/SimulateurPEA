"use strict";
/* ============ Données d’origine (reportings Amundi, performances calendaires des VL en EUR, frais déduits) ============ */
const DEFAULT_DATA = {
  version: 1,
  asOf: "Reportings Amundi de mai à septembre 2026",
  etfs: [
    { id: "PUST", name: "Amundi PEA Nasdaq-100", isin: "FR0011871110", zone: "USA, tech",
      ter: 0.30, vol3y: 19.48, it: 58.69, top10: 46.07, aum: 1099.8,
      returns: { "2016": 9.83, "2017": 16.29, "2018": 4.63, "2019": 41.37, "2020": 36.07,
                 "2021": 36.59, "2022": -28.35, "2023": 49.32, "2024": 33.58, "2025": 6.01 },
      ytd: 14.31, ytdDate: "31/07/2026", source: "Reporting Amundi PUST du 31/07/2026" },
    { id: "PSP5", name: "Amundi PEA S&P 500", isin: "FR0011871128", zone: "USA",
      ter: 0.11, vol3y: 14.70, it: 37.37, top10: 36.17, aum: 1327.72,
      returns: { "2016": 15.08, "2017": 6.88, "2018": 0.28, "2019": 33.74, "2020": 8.55,
                 "2021": 38.23, "2022": -13.00, "2023": 21.68, "2024": 32.85, "2025": 3.45 },
      ytd: 12.97, ytdDate: "30/06/2026", source: "Reporting Amundi PSP5 du 30/06/2026" },
    { id: "PCEU", name: "Amundi PEA MSCI Europe", isin: "FR0013412038", zone: "Europe",
      ter: 0.15, vol3y: 12.55, it: 9.72, top10: 21.94, aum: 375.11,
      returns: { "2020": -3.29, "2021": 25.22, "2022": -9.36, "2023": 15.95, "2024": 8.60, "2025": 19.41 },
      ytd: 9.65, ytdDate: "30/09/2026", source: "Factsheet Amundi PCEU du 30/09/2026" },
    { id: "PTPXE", name: "Amundi PEA Japon TOPIX", isin: "FR0013411980", zone: "Japon",
      ter: 0.20, vol3y: 15.96, it: 15.78, top10: 24.09, aum: 202.85,
      returns: { "2020": 3.07, "2021": 8.04, "2022": -9.81, "2023": 15.27, "2024": 14.56, "2025": 10.22 },
      ytd: 26.36, ytdDate: "30/09/2026", source: "Factsheet Amundi PTPXE du 30/09/2026" },
    { id: "PAEEM", name: "Amundi PEA Émergents ESG Transition", isin: "FR0013412020", zone: "Émergents monde",
      ter: 0.30, vol3y: 15.05, it: 43.32, top10: 40.20, aum: 815.27,
      returns: { "2020": 7.93, "2021": 4.45, "2022": -15.01, "2023": 3.66, "2024": 13.39, "2025": 21.04 },
      ytd: 26.02, ytdDate: "29/05/2026", source: "Reporting Amundi PAEEM du 31/05/2026" },
    { id: "PAASI", name: "Amundi PEA Asie Émergente Screened", isin: "FR0013412012", zone: "Asie émergente",
      ter: 0.30, vol3y: 17.52, it: 54.60, top10: 48.88, aum: 746.09,
      returns: { "2020": 17.23, "2021": 1.72, "2022": -16.14, "2023": 1.21, "2024": 16.36, "2025": 21.78 },
      ytd: 33.84, ytdDate: "30/09/2026", source: "Factsheet Amundi PAASI du 30/09/2026" }
  ]
};
const CUR_YEAR = new Date().getFullYear();
const ID_RE = /^[A-Za-z0-9_-]{1,16}$/;

/* ============ Statistiques ============ */
function yearsOf(e) {
  return Object.keys(e.returns || {}).filter(k => /^\d{4}$/.test(k) && Number.isFinite(e.returns[k]))
    .map(Number).sort((a, b) => a - b);
}
function commonYears(etfs) {
  if (!etfs.length) return [];
  let s = yearsOf(etfs[0]);
  for (const e of etfs.slice(1)) { const ys = new Set(yearsOf(e)); s = s.filter(y => ys.has(y)); }
  return s;
}
function series(e, years) { return years.map(y => e.returns[y] / 100); }
function cagr(rs) { if (!rs.length) return NaN; let l = 0; for (const r of rs) l += Math.log(1 + r); return Math.exp(l / rs.length) - 1; }
function mean(a) { if (!a.length) return NaN; let s = 0; for (const x of a) s += x; return s / a.length; }
function stdev(a) { if (a.length < 2) return NaN; const m = mean(a); let s = 0; for (const x of a) s += (x - m) * (x - m); return Math.sqrt(s / (a.length - 1)); }
function corr(a, b) {
  const n = a.length; if (n < 3) return NaN;
  const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
  return (saa > 0 && sbb > 0) ? sab / Math.sqrt(saa * sbb) : NaN;
}
function pairCorr(e1, e2) {
  const ys = yearsOf(e1).filter(y => Number.isFinite(e2.returns[y]));
  return { r: corr(series(e1, ys), series(e2, ys)), n: ys.length };
}
function metrics(e, etfs, windowMode, refId) {
  const yrs = windowMode === "common" ? commonYears(etfs) : yearsOf(e);
  const rs = series(e, yrs);
  let worst = Infinity, worstYear = null, best = -Infinity, bestYear = null;
  rs.forEach((r, i) => { if (r < worst) { worst = r; worstYear = yrs[i]; } if (r > best) { best = r; bestYear = yrs[i]; } });
  const ref = etfs.find(x => x.id === refId);
  const pc = ref && ref !== e ? pairCorr(e, ref) : { r: NaN, n: 0 };
  const g = cagr(rs), vol = e.vol3y / 100;
  return { years: yrs, cagr: g, worst, worstYear, best, bestYear, vol, ratio: g / vol, rho: pc.r, nRho: pc.n, sd: stdev(rs) };
}
function defaultRho(etfs) {
  let s = 0, c = 0;
  for (let i = 0; i < etfs.length; i++) for (let j = i + 1; j < etfs.length; j++) {
    const r = pairCorr(etfs[i], etfs[j]).r; if (Number.isFinite(r)) { s += r; c++; }
  }
  const m = c ? s / c : 0.5;
  return Math.min(0.95, Math.max(0, Math.round(m * 20) / 20));
}
function defaultGrowth(etfs) {
  const cy = commonYears(etfs);
  let gs = cy.length >= 2 ? etfs.map(e => cagr(series(e, cy))) : etfs.map(e => cagr(series(e, yearsOf(e))));
  gs = gs.filter(Number.isFinite);
  const m = gs.length ? mean(gs) : 0.05;
  return Math.round(m * 200) / 200;
}

/* ============ Aléatoire et algèbre ============ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeGauss(rng) {
  let spare = null;
  return function () {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0; while (u <= 1e-300) u = rng();
    const v = rng(), r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}
function cholesky(M) {
  const n = M.length, L = [];
  for (let i = 0; i < n; i++) L.push(new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = M[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    if (i === j) { if (!(s > 1e-14)) return null; L[i][j] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
  }
  return L;
}
/* Valeur en fin d’année de 1 € versé au début de chaque mois, pour un rendement annuel R. */
function annuityFactor(R) {
  const g = 1 + R; if (g <= 0) return 0;
  const m = Math.pow(g, 1 / 12) - 1;
  if (Math.abs(m) < 1e-12) return 12;
  return (1 + m) * R / m;
}
function quantile(sorted, q) {
  const n = sorted.length; if (!n) return NaN;
  const pos = (n - 1) * Math.min(1, Math.max(0, q)), lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/* ============ Modèle ============ */
function scenarioWeights(sc, E) {
  const raw = E.map(e => Math.max(0, Number(sc.weights && sc.weights[e.id]) || 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  return { w: sum > 0 ? Float64Array.from(raw, x => x / sum) : null, sum };
}
function usedMask(E, S) {
  return E.map(e => (S.holdings[e.id] || 0) > 0 || S.scenarios.some(sc => (sc.weights[e.id] || 0) > 0));
}
function buildModel(DATA, S) {
  const E = DATA.etfs, n = E.length, used = usedMask(E, S), warnings = [];
  const usedE = E.filter((e, i) => used[i]);
  let years = commonYears(usedE.length ? usedE : E);
  if (Number.isFinite(S.winFrom)) years = years.filter(y => y >= S.winFrom);
  if (Number.isFinite(S.winTo)) years = years.filter(y => y <= S.winTo);
  const pf = S.platFee || 0;
  const hist = E.map(e => series(e, yearsOf(e)).map(r => r - pf));
  const g = E.map((e, i) => {
    if (S.retMode === "same") return S.gSame - e.ter / 100 - pf;
    if (S.retMode === "histCommon") {
      const ok = years.length >= 1 && years.every(y => Number.isFinite(e.returns[y]));
      return cagr(ok ? series(e, years).map(r => r - pf) : hist[i]);
    }
    if (S.retMode === "custom") { const v = S.gCustom[e.id]; if (Number.isFinite(v)) return v - pf; }
    return cagr(hist[i]);
  });
  const sigma = E.map((e, i) => {
    if (S.volMode === "annual") { const s = stdev(hist[i]); if (Number.isFinite(s) && s > 0) return s; }
    if (S.volMode === "custom") { const v = S.volCustom[e.id]; if (Number.isFinite(v) && v > 0) return v; }
    return e.vol3y / 100;
  });
  const rawCorr = [], rawN = [];
  let sum = 0, cnt = 0;
  for (let i = 0; i < n; i++) { rawCorr.push(new Float64Array(n)); rawN.push(new Int32Array(n)); }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) { rawCorr[i][j] = 1; rawN[i][j] = yearsOf(E[i]).length; continue; }
    if (j < i) { rawCorr[i][j] = rawCorr[j][i]; rawN[i][j] = rawN[j][i]; continue; }
    const pc = pairCorr(E[i], E[j]); rawCorr[i][j] = pc.r; rawN[i][j] = pc.n;
    if (Number.isFinite(pc.r)) { sum += pc.r; cnt++; }
  }
  const rbar = cnt ? sum / cnt : S.rho;
  const build = lam => {
    const C = [];
    for (let i = 0; i < n; i++) {
      C.push(new Float64Array(n));
      for (let j = 0; j < n; j++) {
        if (i === j) { C[i][j] = 1; continue; }
        if (S.corrMode === "uniform") { C[i][j] = S.rho; continue; }
        const r = Number.isFinite(rawCorr[i][j]) ? rawCorr[i][j] : rbar;
        C[i][j] = (1 - lam) * r + lam * rbar;
      }
    }
    return C;
  };
  let lam = S.corrMode === "uniform" ? 1 : S.shrink, C, L = null;
  for (let it = 0; it < 12; it++) {
    C = build(lam);
    const cov = C.map((row, i) => row.map((c, j) => c * sigma[i] * sigma[j]));
    L = cholesky(cov);
    if (L || lam >= 1) break;
    lam = Math.min(1, lam + 0.1);
  }
  if (!L) {
    warnings.push("Matrice de corrélation inutilisable : ETF simulés comme indépendants.");
    C = build(1).map((row, i) => row.map((c, j) => i === j ? 1 : 0));
    L = cholesky(C.map((row, i) => row.map((c, j) => c * sigma[i] * sigma[j])));
  }
  if (S.corrMode === "matrix" && lam > S.shrink + 1e-9) warnings.push("Rétrécissement des corrélations porté à " + Math.round(lam * 100) + " % pour obtenir une matrice valide.");
  const mArith = g.map((x, i) => x + sigma[i] * sigma[i] / 2);
  const bootR = years.map(y => Float64Array.from(E, e => Number.isFinite(e.returns[y]) ? e.returns[y] / 100 - pf : 0));
  return { E, n, used, years, bootR, g, sigma, corr: C, rawCorr, rawN, rbar, lamEff: lam, L, mArith, warnings };
}
function schedule(S, H) {
  const perMonth = new Float64Array(12 * H), perYear = new Float64Array(H + 1), depCum = new Float64Array(H + 1), wdCum = new Float64Array(H + 1);
  let dep = S.deposits, capYear = null, wd = 0;
  depCum[0] = dep;
  for (let t = 1; t <= H; t++) {
    const Ct = S.monthly * Math.pow(1 + S.monthlyGrowth, t - 1);
    const W = S.wdMonthly > 0 && t >= S.wdFrom ? S.wdMonthly * (S.wdIndex ? Math.pow(1 + S.inflation, t - 1) : 1) : 0;
    let ys = 0;
    for (let m = 0; m < 12; m++) {
      let c = W > 0 ? -W : Ct;
      if (W <= 0 && S.stopAtCap) { c = Math.max(0, Math.min(Ct, S.cap - dep)); if (c < Ct - 1e-9 && capYear === null) capYear = t; }
      if (W <= 0 && m === 0 && S.lumpAmount > 0 && t === S.lumpYear) {
        const l = S.stopAtCap ? Math.max(0, Math.min(S.lumpAmount, S.cap - dep - c)) : S.lumpAmount;
        c += l;
      }
      if (c >= 0) dep += c; else wd -= c;
      ys += c; perMonth[(t - 1) * 12 + m] = c;
    }
    perYear[t] = ys; depCum[t] = dep; wdCum[t] = wd;
  }
  return { perMonth, perYear, depCum, wdCum, capYear };
}
function taxRate(S, H) {
  if (S.taxMode === "none") return 0;
  if (S.taxMode === "cto") return S.pfuRate;
  return (CUR_YEAR + H - S.peaOpen) >= 5 ? S.psRate : S.pfuRate;
}
function allocFlows(h, w, c, out) {
  const n = h.length; let tot = c;
  for (let i = 0; i < n; i++) tot += h[i];
  let sd = 0;
  for (let i = 0; i < n; i++) { const d = w[i] * tot - h[i]; out[i] = d > 0 ? d : 0; sd += out[i]; }
  if (sd <= 1e-9) { for (let i = 0; i < n; i++) out[i] = c * w[i]; return; }
  const k = c / sd; for (let i = 0; i < n; i++) out[i] *= k;
}
function rebalance(h, w, fee) {
  const n = h.length; let tot = 0, trades = 0;
  for (let i = 0; i < n; i++) tot += h[i];
  for (let i = 0; i < n; i++) if (Math.abs(w[i] * tot - h[i]) > 0.5) trades++;
  const cost = Math.min(tot, trades * fee);
  tot -= cost;
  for (let i = 0; i < n; i++) h[i] = w[i] * tot;
  return cost;
}
function maxDev(h, w) {
  let tot = 0; for (let i = 0; i < h.length; i++) tot += h[i];
  if (tot <= 0) return 0;
  let m = 0; for (let i = 0; i < h.length; i++) { const d = Math.abs(h[i] / tot - w[i]); if (d > m) m = d; }
  return m;
}
function withdraw(h, amt) {
  const tot = sumArr(h); if (tot <= 0) return 0;
  const f = Math.max(0, 1 - amt / tot);
  for (let i = 0; i < h.length; i++) h[i] *= f;
  return Math.min(amt, tot);
}
function sumArr(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; }

/* o : {scenarios, nPaths, seed, goalNominal} */
function simulateAll(model, S, o) {
  const E = model.E, n = model.n, H = S.horizon, P = o.nPaths, W1 = H + 1;
  const scs = o.scenarios.map(sc => ({ sc, w: scenarioWeights(sc, E).w })).filter(x => x.w);
  const K = scs.length;
  const sch = schedule(S, H);
  const Y = model.years.length;
  const useBoot = S.mode === "boot" && Y >= 1;
  const monthly = !useBoot && S.step === "month";
  const rng = mulberry32(o.seed), gauss = makeGauss(rng);
  const Lb = Math.max(1, Math.min(S.block || 1, Y || 1));
  const mu = model.g.map(x => Math.log(1 + Math.max(x, -0.95)));
  const L = model.L, sq12 = Math.sqrt(12), fee = S.orderFee || 0, badThr = S.badYear;
  const h0 = Float64Array.from(E, e => S.holdings[e.id] || 0), init = sumArr(h0);
  const start = scs.map(x => { const h = Float64Array.from(h0); let cost = 0; if (x.sc.applyNow && init > 0) cost = rebalance(h, x.w, fee); return { h, cost }; });
  const vals = scs.map(() => new Float64Array(P * W1));
  const ddA = scs.map(() => new Float64Array(P)), twrA = scs.map(() => new Float64Array(P)), feeA = scs.map(() => new Float64Array(P));
  const badA = new Float64Array(K);
  const h = scs.map(() => new Float64Array(n)), alloc = new Float64Array(n);
  const R = new Float64Array(n), A = new Float64Array(n), z = new Float64Array(n);
  const I = new Float64Array(K), peak = new Float64Array(K), dd = new Float64Array(K), lsum = new Float64Array(K), Iy = new Float64Array(K), fees = new Float64Array(K);
  const bad = new Uint8Array(K), seq = new Int32Array(H), ruin = new Uint8Array(K), ruinA = new Float64Array(K);
  const df = !useBoot && S.tailDf >= 3 ? Math.round(S.tailDf) : 0;
  const fatten = () => { if (!df) return; let c = 0; for (let j = 0; j < df; j++) { const g = gauss(); c += g * g; } const f = Math.sqrt((df - 2) / Math.max(c, 1e-9)); for (let i = 0; i < n; i++) z[i] *= f; };
  for (let p = 0; p < P; p++) {
    for (let k = 0; k < K; k++) { h[k].set(start[k].h); I[k] = 1; peak[k] = 1; dd[k] = 0; lsum[k] = 0; bad[k] = 0; ruin[k] = 0; fees[k] = start[k].cost; vals[k][p * W1] = sumArr(h[k]); }
    if (useBoot) { let t = 0; while (t < H) { const s0 = Math.floor(rng() * (Y - Lb + 1)); for (let j = 0; j < Lb && t < H; j++, t++) seq[t] = s0 + j; } }
    for (let t = 1; t <= H; t++) {
      if (!monthly) {
        if (useBoot) { const r = model.bootR[seq[t - 1]]; for (let i = 0; i < n; i++) R[i] = r[i]; }
        else {
          for (let i = 0; i < n; i++) z[i] = gauss();
          fatten();
          for (let i = 0; i < n; i++) { let x = mu[i]; const Li = L[i]; for (let j = 0; j <= i; j++) x += Li[j] * z[j]; R[i] = Math.exp(x) - 1; }
        }
        for (let i = 0; i < n; i++) A[i] = annuityFactor(R[i]);
        const cy = sch.perYear[t];
        for (let k = 0; k < K; k++) {
          const hk = h[k], w = scs[k].w, sc = scs[k].sc;
          if (cy < 0 && withdraw(hk, -cy) < -cy - 0.5) ruin[k] = 1;
          let s0 = 0; for (let i = 0; i < n; i++) s0 += hk[i];
          if (cy > 0) { if (sc.rebal === "flows") allocFlows(hk, w, cy, alloc); else for (let i = 0; i < n; i++) alloc[i] = cy * w[i]; }
          let s1 = 0; for (let i = 0; i < n; i++) { hk[i] *= 1 + R[i]; s1 += hk[i]; }
          let r; if (s0 > 0) r = s1 / s0 - 1; else { r = 0; for (let i = 0; i < n; i++) r += w[i] * R[i]; }
          if (cy > 0) for (let i = 0; i < n; i++) hk[i] += alloc[i] / 12 * A[i];
          if (sc.rebal === "annual") fees[k] += rebalance(hk, w, fee);
          else if (sc.rebal === "band" && maxDev(hk, w) > sc.band / 100) fees[k] += rebalance(hk, w, fee);
          I[k] *= 1 + r; if (I[k] > peak[k]) peak[k] = I[k];
          const d = I[k] / peak[k] - 1; if (d < dd[k]) dd[k] = d;
          lsum[k] += Math.log(1 + r); if (r <= badThr) bad[k] = 1;
          vals[k][p * W1 + t] = sumArr(hk);
        }
      } else {
        for (let k = 0; k < K; k++) Iy[k] = I[k];
        for (let m = 0; m < 12; m++) {
          for (let i = 0; i < n; i++) z[i] = gauss();
          fatten();
          for (let i = 0; i < n; i++) { const Li = L[i]; let s = 0; for (let j = 0; j <= i; j++) s += Li[j] * z[j]; R[i] = Math.exp(mu[i] / 12 + s / sq12) - 1; }
          const c = sch.perMonth[(t - 1) * 12 + m];
          for (let k = 0; k < K; k++) {
            const hk = h[k], w = scs[k].w, sc = scs[k].sc;
            if (c > 0) { if (sc.rebal === "flows") { allocFlows(hk, w, c, alloc); for (let i = 0; i < n; i++) hk[i] += alloc[i]; } else for (let i = 0; i < n; i++) hk[i] += c * w[i]; }
            else if (c < 0 && withdraw(hk, -c) < -c - 0.5) ruin[k] = 1;
            let s0 = 0, s1 = 0;
            for (let i = 0; i < n; i++) { s0 += hk[i]; hk[i] *= 1 + R[i]; s1 += hk[i]; }
            let r; if (s0 > 0) r = s1 / s0 - 1; else { r = 0; for (let i = 0; i < n; i++) r += w[i] * R[i]; }
            I[k] *= 1 + r; if (I[k] > peak[k]) peak[k] = I[k];
            const d = I[k] / peak[k] - 1; if (d < dd[k]) dd[k] = d;
            lsum[k] += Math.log(1 + r);
          }
        }
        for (let k = 0; k < K; k++) {
          const hk = h[k], w = scs[k].w, sc = scs[k].sc;
          if (I[k] / Iy[k] - 1 <= badThr) bad[k] = 1;
          if (sc.rebal === "annual") fees[k] += rebalance(hk, w, fee);
          else if (sc.rebal === "band" && maxDev(hk, w) > sc.band / 100) fees[k] += rebalance(hk, w, fee);
          vals[k][p * W1 + t] = sumArr(hk);
        }
      }
    }
    for (let k = 0; k < K; k++) { ddA[k][p] = dd[k]; twrA[k][p] = Math.exp(lsum[k] / H) - 1; feeA[k][p] = fees[k]; if (bad[k]) badA[k]++; if (ruin[k]) ruinA[k]++; }
  }
  const qs = [S.qLow, 0.25, 0.5, 0.75, S.qHigh];
  const rate = taxRate(S, H), depH = sch.depCum[H], wdH = sch.wdCum[H], col = new Float64Array(P);
  const res = scs.map((x, k) => {
    const bands = qs.map(() => new Float64Array(W1));
    for (let t = 0; t < W1; t++) {
      for (let p = 0; p < P; p++) col[p] = vals[k][p * W1 + t];
      col.sort();
      for (let j = 0; j < qs.length; j++) bands[j][t] = quantile(col, qs[j]);
    }
    const fin = new Float64Array(P); for (let p = 0; p < P; p++) fin[p] = vals[k][p * W1 + H]; fin.sort();
    const net = new Float64Array(P); for (let p = 0; p < P; p++) { const gain = fin[p] + wdH - depH; net[p] = fin[p] - (gain > 0 ? gain * rate : 0); }
    let loss = 0; for (let p = 0; p < P; p++) if (fin[p] + wdH < depH) loss++;
    let goal = NaN; if (o.goalNominal > 0) { let c = 0; for (let p = 0; p < P; p++) if (net[p] >= o.goalNominal) c++; goal = c / P; }
    ddA[k].sort(); twrA[k].sort();
    let fm = 0; for (let p = 0; p < P; p++) fm += feeA[k][p];
    return { id: x.sc.id, name: x.sc.name, w: x.w, bands, fin, net, probLoss: loss / P, probGoal: goal, bad: badA[k] / P,
      probRuin: sch.wdCum[H] > 0 ? ruinA[k] / P : NaN, ddMed: quantile(ddA[k], 0.5), ddLow: quantile(ddA[k], S.qLow), twr: quantile(twrA[k], 0.5), feesMean: fm / P };
  });
  return { H, qs, res, sch, rate, useBoot, monthly, years: model.years, P, block: Lb, tailDf: df };
}
/* Rejoue les années réelles dans l’ordre chronologique. */
function backtestAll(model, S, scenarios) {
  const E = model.E, n = model.n, years = model.years, Y = years.length;
  if (!Y) return null;
  const sch = schedule(S, Y), fee = S.orderFee || 0;
  const h0 = Float64Array.from(E, e => S.holdings[e.id] || 0), init = sumArr(h0), alloc = new Float64Array(n);
  const res = scenarios.map(sc => {
    const w = scenarioWeights(sc, E).w; if (!w) return null;
    const h = Float64Array.from(h0); let fees = 0;
    if (sc.applyNow && init > 0) fees += rebalance(h, w, fee);
    const vals = [sumArr(h)], rets = []; let I = 1, peak = 1, dd = 0;
    for (let t = 1; t <= Y; t++) {
      const R = model.bootR[t - 1], cy = sch.perYear[t];
      if (cy < 0) withdraw(h, -cy);
      let s0 = 0; for (let i = 0; i < n; i++) s0 += h[i];
      if (cy > 0) { if (sc.rebal === "flows") allocFlows(h, w, cy, alloc); else for (let i = 0; i < n; i++) alloc[i] = cy * w[i]; }
      let s1 = 0; for (let i = 0; i < n; i++) { h[i] *= 1 + R[i]; s1 += h[i]; }
      let r; if (s0 > 0) r = s1 / s0 - 1; else { r = 0; for (let i = 0; i < n; i++) r += w[i] * R[i]; }
      if (cy > 0) for (let i = 0; i < n; i++) h[i] += alloc[i] / 12 * annuityFactor(R[i]);
      if (sc.rebal === "annual") fees += rebalance(h, w, fee);
      else if (sc.rebal === "band" && maxDev(h, w) > sc.band / 100) fees += rebalance(h, w, fee);
      I *= 1 + r; if (I > peak) peak = I; dd = Math.min(dd, I / peak - 1);
      rets.push(r); vals.push(sumArr(h));
    }
    return { id: sc.id, name: sc.name, vals, rets, dd, fees, cagr: Math.pow(I, 1 / Y) - 1 };
  });
  return { years, res, depCum: sch.depCum, wdCum: sch.wdCum };
}
/* Recherche de la mensualité qui atteint l’objectif avec la confiance voulue (tirages communs : résultat monotone). */
function solveMonthly(model, S, scenario, goalNominal, conf, nPaths, seed) {
  const test = m => {
    const s2 = Object.assign({}, S, { monthly: m });
    const r = simulateAll(model, s2, { scenarios: [scenario], nPaths, seed, goalNominal }).res[0];
    return r ? r.probGoal : 0;
  };
  if (test(0) >= conf) return { monthly: 0, reached: true };
  let lo = 0, hi = Math.max(100, S.monthly * 2 || 500), p = test(hi), guard = 0;
  while (p < conf && hi < 50000 && guard < 12) { lo = hi; hi *= 2; p = test(hi); guard++; }
  if (p < conf) return { monthly: hi, reached: false };
  for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (test(mid) >= conf) hi = mid; else lo = mid; if (hi - lo < 5) break; }
  return { monthly: Math.ceil(hi / 5) * 5, reached: true };
}
/* ============ Optimiseur (grille exhaustive, rendements log-normaux) ============ */
function countCombos(lo, hi, K) {
  let dp = new Float64Array(K + 1); dp[0] = 1;
  for (let i = 0; i < lo.length; i++) {
    const nd = new Float64Array(K + 1);
    for (let s = 0; s <= K; s++) if (dp[s]) for (let v = lo[i]; v <= hi[i] && s + v <= K; v++) nd[s + v] += dp[s];
    dp = nd;
  }
  return dp[K];
}
function optimize(model, S) {
  const E = model.E, n = model.n, o = S.opt, K = Math.round(1 / o.step);
  const lo = E.map(e => Math.max(0, Math.ceil(((Number.isFinite(o.min[e.id]) ? o.min[e.id] : 0) / 100) * K - 1e-9)));
  const hi = E.map(e => Math.min(K, Math.floor(((Number.isFinite(o.max[e.id]) ? o.max[e.id] : 100) / 100) * K + 1e-9)));
  if (lo.some((l, i) => l > hi[i])) return { error: "Un minimum dépasse son maximum." };
  const count = countCombos(lo, hi, K);
  if (count === 0) return { error: "Aucune allocation ne respecte ces bornes : la somme des minimums dépasse 100 % ou celle des maximums n’atteint pas 100 %." };
  if (count > 400000) return { error: "Trop de combinaisons (" + Math.round(count).toLocaleString("fr-FR") + ") : choisis un pas plus grand ou resserre les bornes.", count };
  const m = model.mArith, sg = model.sigma, C = model.corr, rf = o.rf;
  const cov = [];
  for (let i = 0; i < n; i++) { cov.push(new Float64Array(n)); for (let j = 0; j < n; j++) cov[i][j] = C[i][j] * sg[i] * sg[j]; }
  const k = new Int32Array(n), w = new Float64Array(n);
  const CLOUD = 2500, cloudV = new Float64Array(CLOUD), cloudM = new Float64Array(CLOUD);
  let seen = 0; const rng = mulberry32(12345);
  const bins = new Map();
  let bMin = null, bRatio = null, bTarget = null;
  const evalPoint = () => {
    let mean = 0;
    for (let i = 0; i < n; i++) { w[i] = k[i] / K; mean += w[i] * m[i]; }
    let v = 0;
    for (let i = 0; i < n; i++) { if (!w[i]) continue; let s = 0; for (let j = 0; j < n; j++) s += cov[i][j] * w[j]; v += w[i] * s; }
    const vol = Math.sqrt(Math.max(v, 0)), med = mean - Math.max(v, 0) / 2;
    const ratio = vol > 0 ? (mean - rf) / vol : -Infinity;
    if (seen < CLOUD) { cloudV[seen] = vol; cloudM[seen] = med; } else { const r = Math.floor(rng() * (seen + 1)); if (r < CLOUD) { cloudV[r] = vol; cloudM[r] = med; } }
    seen++;
    const key = Math.round(vol * 400), cur = bins.get(key);
    if (!cur || med > cur.med) bins.set(key, { vol, med });
    const pt = () => ({ w: Array.from(w), mean, vol, med, ratio });
    if (!bMin || vol < bMin.vol - 1e-12) bMin = pt();
    if (!bRatio || ratio > bRatio.ratio + 1e-12) bRatio = pt();
    if (vol <= o.targetVol + 1e-12 && (!bTarget || med > bTarget.med + 1e-12)) bTarget = pt();
  };
  const rec = (i, rem) => {
    if (i === n - 1) { if (rem < lo[i] || rem > hi[i]) return; k[i] = rem; evalPoint(); return; }
    const top = Math.min(hi[i], rem);
    for (let v = lo[i]; v <= top; v++) { k[i] = v; rec(i + 1, rem - v); }
  };
  rec(0, K);
  const pts = Array.from(bins.values()).sort((a, b) => a.vol - b.vol);
  const frontier = []; let best = -Infinity;
  const i0 = pts.findIndex(p => bMin && Math.abs(p.vol - bMin.vol) < 1e-9);
  for (let i = Math.max(0, i0); i < pts.length; i++) if (pts[i].med > best) { best = pts[i].med; frontier.push(pts[i]); }
  const nc = Math.min(seen, CLOUD);
  const etfs = E.map((e, i) => ({ vol: sg[i], med: model.g[i] }));
  return { count: seen, cloudV: cloudV.slice(0, nc), cloudM: cloudM.slice(0, nc), frontier, best: { minVar: bMin, maxRatio: bRatio, target: bTarget }, etfs, cov, m };
}
function portfolioPoint(cov, m, w) {
  const n = m.length; let mean = 0, v = 0;
  for (let i = 0; i < n; i++) mean += w[i] * m[i];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) v += w[i] * w[j] * cov[i][j];
  return { vol: Math.sqrt(Math.max(v, 0)), med: mean - Math.max(v, 0) / 2 };
}
function validateData(d) {
  const nb = "\u00a0";
  if (!d || typeof d !== "object" || !Array.isArray(d.etfs) || !d.etfs.length) return "Le JSON doit contenir un tableau «" + nb + "etfs" + nb + "» non vide.";
  if (d.etfs.length > 8) return "8 ETF au maximum.";
  const ids = new Set();
  for (const e of d.etfs) {
    if (!e || typeof e.id !== "string" || !ID_RE.test(e.id)) return "Chaque ETF doit avoir un code de 1 à 16 caractères (lettres, chiffres, tiret ou tiret bas).";
    if (ids.has(e.id)) return "Code en double" + nb + ": " + e.id + ".";
    ids.add(e.id);
    if (!Number.isFinite(e.ter) || e.ter < 0 || e.ter > 5) return e.id + nb + ": les frais doivent être compris entre 0 et 5" + nb + "%.";
    if (!Number.isFinite(e.vol3y) || e.vol3y <= 0 || e.vol3y > 150) return e.id + nb + ": la volatilité doit être comprise entre 0 et 150" + nb + "%.";
    if (!e.returns || typeof e.returns !== "object") return e.id + nb + ": rendements annuels manquants.";
    for (const [y, r] of Object.entries(e.returns)) {
      if (!/^\d{4}$/.test(y) || !Number.isFinite(r) || r <= -100 || r > 1000) return e.id + nb + ": rendement invalide pour " + y + ".";
    }
    if (yearsOf(e).length < 2) return e.id + nb + ": il faut au moins 2 années de rendement.";
  }
  return null;
}
if (typeof module !== "undefined") module.exports = { DEFAULT_DATA, CUR_YEAR, yearsOf, commonYears, series, cagr, mean, stdev, corr, pairCorr, metrics,
  defaultRho, defaultGrowth, mulberry32, cholesky, annuityFactor, quantile, scenarioWeights, usedMask, buildModel, schedule, taxRate,
  allocFlows, rebalance, withdraw, simulateAll, backtestAll, solveMonthly, countCombos, optimize, portfolioPoint, validateData };
