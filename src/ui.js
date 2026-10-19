(function () {
  "use strict";
  const NB = "\u00a0", LS_STATE = "etfsim:state:v2", LS_V1 = "etfsim:inputs:v1", LS_DATA = "etfsim:data:v1", SC_MAX = 4;
  const TABS = ["sim", "compare", "opt", "data", "settings"];
  const LS_QUOTES = "etfsim:quotes:v1";

  /* =================== utilitaires =================== */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* idem */ } }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c])); }
  function clampNum(v, lo, hi, def) { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; }
  function debounce(fn, ms) { let t = null; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
  const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  function fixMinus(s) { return String(s).replace(/^-/, "\u2212"); }
  function eur(v) { return Number.isFinite(v) ? fixMinus(nf0.format(Math.round(v))) + NB + "€" : "—"; }
  function keur(v) {
    if (!Number.isFinite(v)) return "—";
    const a = Math.abs(v);
    if (a >= 1e6) return fixMinus((v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: a >= 1e8 ? 0 : 1 })) + NB + "M€";
    if (a >= 1e4) return fixMinus(nf0.format(Math.round(v / 1000))) + NB + "k€";
    if (a >= 1000) return fixMinus((v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })) + NB + "k€";
    return eur(v);
  }
  function pct(v, d, sign) {
    if (!Number.isFinite(v)) return "—";
    d = d == null ? 1 : d;
    const s = (v * 100).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
    return fixMinus((sign && v > 0 ? "+" : "") + s) + NB + "%";
  }
  function dec(v, d) { return Number.isFinite(v) ? fixMinus(v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d })) : "—"; }
  function amax(a) { let m = -Infinity; for (const v of a) if (v > m) m = v; return m; }
  function amin(a) { let m = Infinity; for (const v of a) if (v < m) m = v; return m; }
  function niceMax(v) {
    if (!(v > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e;
    return (f <= 1 ? 1 : f <= 1.5 ? 1.5 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 3 ? 3 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 6 ? 6 : f <= 8 ? 8 : 10) * e;
  }
  function niceTicks(min, max, n) {
    const span = (max - min) || 1, raw = span / n, e = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / e;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, t = [];
    for (let v = lo; v <= hi + step * 1e-6; v += step) t.push(Math.round(v / step) * step);
    return { lo, hi, t };
  }
  const $ = id => document.getElementById(id);
  const qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  function yearsLabel(n) { return n + NB + (n > 1 ? "ans" : "an"); }
  function period(yrs) { return yrs.length ? (yrs.length === 1 ? String(yrs[0]) : yrs[0] + "–" + yrs[yrs.length - 1]) : "—"; }
  function chartW(el) { const w = el ? el.clientWidth - 12 : 0; return w > 120 ? Math.round(w) : 340; }
  function roundTo100(ws) {
    const tot = ws.reduce((a, b) => a + b, 0); if (!(tot > 0)) return ws.map(() => 0);
    const raw = ws.map(w => w / tot * 100), fl = raw.map(Math.floor);
    let rest = 100 - fl.reduce((a, b) => a + b, 0);
    raw.map((r, i) => ({ i, f: r - fl[i] })).sort((a, b) => b.f - a.f).forEach(o => { if (rest > 0 && raw[o.i] > 0) { fl[o.i]++; rest--; } });
    return fl;
  }
  function placeLabels(labs, top, bottom, gap) {
    gap = gap || 15;
    labs.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < gap) labs[i].y = labs[i - 1].y + gap;
    const over = labs.length ? labs[labs.length - 1].y - bottom : 0;
    if (over > 0) labs.forEach(l => { l.y -= over; });
    if (labs.length && labs[0].y < top) { const d = top - labs[0].y; labs.forEach(l => { l.y += d; }); }
    return labs;
  }

  /* =================== état =================== */
  function loadData() {
    const s = lsGet(LS_DATA);
    if (s) { try { const d = JSON.parse(s); if (!validateData(d)) return d; } catch (e) { /* illisible */ } }
    return clone(DEFAULT_DATA);
  }
  let DATA = loadData();
  const SORTS = {
    ratio: { label: "Rendement par unité de risque", key: m => m.ratio, dir: -1 },
    cagr: { label: "Rendement annualisé", key: m => m.cagr, dir: -1 },
    vol: { label: "Volatilité la plus faible", key: m => m.vol, dir: 1 },
    worst: { label: "Pire année la moins sévère", key: m => m.worst, dir: -1 },
    ter: { label: "Frais les plus bas", key: (m, e) => e.ter, dir: 1 },
    rho: { label: "Meilleur diversifiant du Nasdaq", key: m => m.rho, dir: 1 }
  };
  const REBAL = [["none", "Aucun"], ["flows", "Par les versements, sans vendre"], ["annual", "Chaque année"], ["band", "Quand un écart dépasse le seuil"]];
  const REBAL_SHORT = { none: "sans rééquilibrage", flows: "rééquilibré par les versements", annual: "rééquilibré chaque année", band: "rééquilibré au-delà du seuil" };
  function defaultState() {
    const E = DATA.etfs;
    return { v: 2, tab: "sim", holdings: { PUST: 18000 }, deposits: 18000, monthly: 300, monthlyGrowth: 0, horizon: 10,
      scenarios: [
        { id: "s1", name: "Actuel", weights: { PUST: 100 }, applyNow: false, rebal: "none", band: 5 },
        { id: "s2", name: "Plan A", weights: { PUST: 60, PCEU: 20, PTPXE: 10, PAASI: 10 }, applyNow: false, rebal: "flows", band: 5 },
        { id: "s3", name: "Plan C+", weights: { PUST: 30, PSP5: 30, PCEU: 20, PTPXE: 10, PAASI: 10 }, applyNow: true, rebal: "annual", band: 5 }],
      focus: "s2", ref: "s1",
      mode: "boot", block: 1, winFrom: null, winTo: null, step: "month",
      retMode: "same", gSame: defaultGrowth(E), gCustom: {}, volMode: "factsheet", volCustom: {},
      corrMode: "matrix", rho: defaultRho(E), shrink: 0.5,
      nPaths: 2000, seed: 20261018, qLow: 0.1, qHigh: 0.9, badYear: -0.2,
      real: false, inflation: 0.02,
      taxMode: "pea", psRate: 0.186, pfuRate: 0.314, peaOpen: CUR_YEAR, orderFee: 1, cap: 150000, stopAtCap: true,
      units: {}, quotesUrl: "https://raw.githubusercontent.com/Ironmaaax/SimulateurPEA/main/data/cours.json", platFee: 0, tailDf: 0, lumpAmount: 0, lumpYear: 1, wdMonthly: 0, wdFrom: 11, wdIndex: true,
      goal: 0, goalConf: 0.8, sort: "ratio", window: "common",
      opt: { step: 0.05, targetVol: 0.15, rf: 0, min: {}, max: {}, target: "s2" }, theme: "auto" };
  }
  function objNums(o, lo, hi) {
    const r = {};
    if (o && typeof o === "object") for (const k of Object.keys(o)) {
      if (!ID_RE.test(k) || o[k] === null || o[k] === "" || o[k] === undefined) continue;
      const v = Number(o[k]); if (!Number.isFinite(v)) continue;
      r[k] = Math.min(hi, Math.max(lo, v));
    }
    return r;
  }
  function en(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }
  function sanitizeState(raw) {
    const d = defaultState();
    const s = Object.assign({}, d, raw && typeof raw === "object" ? raw : {});
    s.tab = en(s.tab, TABS, "sim");
    s.holdings = objNums(s.holdings, 0, 1e9);
    s.deposits = clampNum(s.deposits, 0, 1e9, d.deposits);
    s.monthly = clampNum(s.monthly, 0, 1e6, d.monthly);
    s.monthlyGrowth = clampNum(s.monthlyGrowth, -0.5, 0.5, 0);
    s.horizon = Math.round(clampNum(s.horizon, 1, 40, 10));
    let scs = Array.isArray(s.scenarios) ? s.scenarios.filter(x => x && typeof x === "object").slice(0, SC_MAX) : [];
    const seen = new Set();
    scs = scs.map((x, i) => {
      let id = typeof x.id === "string" && /^s\d{1,6}$/.test(x.id) ? x.id : "s" + (i + 1);
      while (seen.has(id)) id = "s" + (Number(id.slice(1)) + 1);
      seen.add(id);
      return { id, name: String(x.name == null ? "Scénario " + (i + 1) : x.name).slice(0, 24), weights: objNums(x.weights, 0, 100),
        applyNow: !!x.applyNow, rebal: en(x.rebal, ["none", "flows", "annual", "band"], "none"), band: Math.round(clampNum(x.band, 1, 50, 5)) };
    });
    if (!scs.length) scs = d.scenarios;
    s.scenarios = scs;
    if (!scs.some(x => x.id === s.focus)) s.focus = scs[0].id;
    if (!scs.some(x => x.id === s.ref)) s.ref = scs[0].id;
    s.mode = en(s.mode, ["boot", "param"], "boot");
    s.block = Math.round(clampNum(s.block, 1, 5, 1));
    s.winFrom = (s.winFrom === null || s.winFrom === "" || s.winFrom === undefined) ? null : Math.round(clampNum(s.winFrom, 1900, 2100, 2000));
    s.winTo = (s.winTo === null || s.winTo === "" || s.winTo === undefined) ? null : Math.round(clampNum(s.winTo, 1900, 2100, 2100));
    s.step = en(s.step, ["year", "month"], "month");
    s.retMode = en(s.retMode, ["same", "histCommon", "histMax", "custom"], "same");
    s.gSame = clampNum(s.gSame, -0.2, 0.3, d.gSame);
    s.gCustom = objNums(s.gCustom, -0.5, 1);
    s.volMode = en(s.volMode, ["factsheet", "annual", "custom"], "factsheet");
    s.volCustom = objNums(s.volCustom, 0.001, 1.5);
    s.corrMode = en(s.corrMode, ["matrix", "uniform"], "matrix");
    s.rho = clampNum(s.rho, 0, 0.95, d.rho);
    s.shrink = clampNum(s.shrink, 0, 1, 0.5);
    s.nPaths = en(Number(s.nPaths), [500, 1000, 2000, 5000, 10000], 2000);
    s.seed = Math.round(clampNum(s.seed, 1, 4294967295, d.seed));
    s.qLow = en(Number(s.qLow), [0.05, 0.1, 0.25], 0.1);
    s.qHigh = en(Number(s.qHigh), [0.75, 0.9, 0.95], 0.9);
    s.badYear = clampNum(s.badYear, -0.9, 0, -0.2);
    s.real = !!s.real; s.inflation = clampNum(s.inflation, -0.05, 0.2, 0.02);
    s.taxMode = en(s.taxMode, ["pea", "cto", "none"], "pea");
    s.psRate = clampNum(s.psRate, 0, 0.6, 0.186); s.pfuRate = clampNum(s.pfuRate, 0, 0.8, 0.314);
    s.peaOpen = Math.round(clampNum(s.peaOpen, 1990, 2100, CUR_YEAR));
    s.orderFee = clampNum(s.orderFee, 0, 100, 1); s.cap = clampNum(s.cap, 0, 1e9, 150000); s.stopAtCap = !!s.stopAtCap;
    s.units = objNums(s.units, 0, 1e9);
    s.quotesUrl = typeof s.quotesUrl === "string" && /^https:\/\/\S+$/.test(s.quotesUrl.trim()) ? s.quotesUrl.trim().slice(0, 300) : "";
    for (const id of Object.keys(s.units)) { const q = quoteOf(id); if (q && s.units[id] > 0) s.holdings[id] = Math.round(s.units[id] * q.price); }
    s.platFee = clampNum(s.platFee, 0, 0.05, 0);
    s.tailDf = en(Number(s.tailDf), [0, 3, 4, 5, 8, 15], 0);
    s.lumpAmount = clampNum(s.lumpAmount, 0, 1e9, 0); s.lumpYear = Math.round(clampNum(s.lumpYear, 1, 40, 1));
    s.wdMonthly = clampNum(s.wdMonthly, 0, 1e6, 0); s.wdFrom = Math.round(clampNum(s.wdFrom, 1, 40, 11)); s.wdIndex = !!s.wdIndex;
    s.goal = clampNum(s.goal, 0, 1e10, 0); s.goalConf = en(Number(s.goalConf), [0.5, 0.7, 0.8, 0.9, 0.95], 0.8);
    s.sort = SORTS[s.sort] ? s.sort : "ratio"; s.window = en(s.window, ["common", "max"], "common");
    const o = Object.assign({}, d.opt, s.opt && typeof s.opt === "object" ? s.opt : {});
    o.step = en(Number(o.step), [0.025, 0.05, 0.1, 0.2], 0.05);
    o.targetVol = clampNum(o.targetVol, 0.01, 1, 0.15); o.rf = clampNum(o.rf, -0.05, 0.2, 0);
    o.min = objNums(o.min, 0, 100); o.max = objNums(o.max, 0, 100);
    o.target = scs.some(x => x.id === o.target) ? o.target : s.focus;
    s.opt = { step: o.step, targetVol: o.targetVol, rf: o.rf, min: o.min, max: o.max, target: o.target };
    s.theme = en(s.theme, ["auto", "light", "dark"], "auto");
    s.v = 2;
    return s;
  }
  function migrateV1() {
    const raw = lsGet(LS_V1); if (!raw) return null;
    try {
      const o = JSON.parse(raw), d = defaultState(), r = Object.assign({}, d);
      if (o.holdings && typeof o.holdings === "object") r.holdings = o.holdings;
      ["monthly", "horizon", "mode", "rho"].forEach(k => { if (o[k] !== undefined) r[k] = o[k]; });
      if (Number.isFinite(o.gCommon)) r.gSame = o.gCommon;
      r.deposits = Object.values(r.holdings).reduce((a, b) => a + (Number(b) || 0), 0);
      if (o.weights && typeof o.weights === "object") {
        r.scenarios = [d.scenarios[0], { id: "s2", name: "Mon allocation", weights: o.weights, applyNow: !!o.applyNow, rebal: o.rebalance ? "annual" : "none", band: 5 }, d.scenarios[2]];
        r.focus = "s2";
      }
      return r;
    } catch (e) { return null; }
  }
  function loadState() {
    const s = lsGet(LS_STATE);
    if (s) { try { return sanitizeState(JSON.parse(s)); } catch (e) { /* illisible */ } }
    return sanitizeState(migrateV1() || defaultState());
  }
  /* =================== cours en ligne =================== */
  function validQuotes(q) { return !!(q && typeof q === "object" && q.etfs && typeof q.etfs === "object" && typeof q.updated === "string"); }
  function cachedQuotes() { try { const q = JSON.parse(lsGet(LS_QUOTES)); return validQuotes(q) ? q : null; } catch (e) { return null; } }
  let QUOTES = cachedQuotes(), QUOTES_LIVE = false, QUOTES_TRIED = false;
  function quoteOf(id) { const q = QUOTES && QUOTES.etfs[id]; return q && Number.isFinite(q.price) && q.price > 0 ? q : null; }
  function frDate(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : ""; }
  let S = loadState();
  const saveSoon = debounce(() => lsSet(LS_STATE, JSON.stringify(S)), 250);
  function getPath(o, p) { return p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o); }
  function setPath(o, p, v) {
    const ks = p.split("."); let a = o;
    for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null || typeof a[ks[i]] !== "object") a[ks[i]] = {}; a = a[ks[i]]; }
    a[ks[ks.length - 1]] = v;
  }
  function scById(id) { return S.scenarios.find(x => x.id === id); }
  function scIdx(id) { return Math.max(0, S.scenarios.findIndex(x => x.id === id)); }
  function nasdaqId() { const e = DATA.etfs.find(x => x.id === "PUST"); return e ? e.id : DATA.etfs[0].id; }

  /* =================== calcul =================== */
  let MODEL = null, SIM = null, BT = null, OPT = null, FAN = null, lastMs = 80, timer = null, DOWNLOADS = null, DRAFT = null, optMsg = "";
  function goalNominal() { return S.goal > 0 ? (S.real ? S.goal * Math.pow(1 + S.inflation, S.horizon) : S.goal) : 0; }
  function defl(t) { return S.real ? Math.pow(1 + S.inflation, t) : 1; }
  function resOf(id) { return SIM ? SIM.res.find(r => r.id === id) : null; }
  let timerFull = null;
  function now() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }
  /* preview = calcul rapide sur 400 scénarios pendant qu’un curseur bouge ; le calcul complet suit à l’arrêt. */
  function recompute(preview) {
    if (!preview) { clearTimeout(timer); clearTimeout(timerFull); }
    const t0 = now();
    MODEL = buildModel(DATA, S);
    SIM = simulateAll(MODEL, S, { scenarios: S.scenarios, nPaths: preview ? Math.min(400, S.nPaths) : S.nPaths, seed: S.seed, goalNominal: goalNominal() });
    BT = backtestAll(MODEL, S, S.scenarios);
    if (!preview) { lastMs = now() - t0; document.body.classList.remove("busy"); }
    OPT = null;
    renderSimAll();
    if (S.tab === "compare") renderCompare();
    if (S.tab === "opt" && !preview) runOpt();
  }
  function queueCompute() {
    document.body.classList.add("busy");
    clearTimeout(timer); clearTimeout(timerFull);
    if (lastMs > 160) { timer = setTimeout(() => recompute(true), 50); timerFull = setTimeout(() => recompute(false), 650); }
    else timerFull = setTimeout(() => recompute(false), Math.max(90, lastMs * 1.3));
  }

  /* =================== thème, en-tête, onglets =================== */
  function applyTheme() {
    if (S.theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", S.theme);
  }
  function updateHdr() { const h = $("top"); if (h) document.documentElement.style.setProperty("--hdr", h.offsetHeight + "px"); }
  function setTab(t) {
    S.tab = en(t, TABS, "sim"); saveSoon();
    qsa(".tabs button").forEach(b => { const on = b.dataset.tab === S.tab; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
    TABS.forEach(p => { $("p-" + p).hidden = p !== S.tab; });
    const ro = S.tab === "sim";
    document.body.classList.toggle("readout-on", ro);
    $("readout").hidden = !ro;
    if (S.tab === "sim") renderSimCharts();
    if (S.tab === "compare") renderCompare();
    if (S.tab === "opt") runOpt();
    if (S.tab === "data") renderDataTab();
    if (S.tab === "settings") renderSettings();
    updateHdr();
  }

  /* =================== liaisons génériques =================== */
  function readEl(el) {
    if (el.type === "checkbox") return el.checked;
    const raw = el.value;
    if ((el.tagName === "SELECT" && !el.dataset.num) || el.dataset.text) return raw;
    if (raw === "" || raw == null) return el.dataset.nullable ? null : 0;
    const v = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(v)) return undefined;
    return v / (Number(el.dataset.scale) || 1);
  }
  function writeEl(el, v) {
    if (el.type === "checkbox") { el.checked = !!v; return; }
    if (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))) { el.value = ""; return; }
    if (el.tagName === "SELECT" || el.dataset.text) { el.value = String(v); return; }
    const sc = Number(el.dataset.scale) || 1;
    el.value = String(Math.round(v * sc * 1e6) / 1e6);
  }
  function syncBindings(root) {
    qsa("[data-bind]", root).forEach(el => {
      if (el === document.activeElement && (el.type === "number" || el.type === "text")) return;
      writeEl(el, getPath(S, el.dataset.bind));
    });
    qsa("[data-set]", root).forEach(b => b.setAttribute("aria-checked", String(String(getPath(S, b.dataset.set)) === b.dataset.val)));
  }
  function onBound(ev) {
    const el = ev.target; const v = readEl(el);
    if (v === undefined) return;
    setPath(S, el.dataset.bind, v);
    S = sanitizeState(S);
    if (ev.type === "change") writeEl(el, getPath(S, el.dataset.bind));
    afterChange(el.dataset.bind);
  }
  function afterChange(key) {
    saveSoon();
    if (key && key.indexOf("opt.") !== 0) optMsg = "";
    if (key === "theme") { applyTheme(); return; }
    if (key && (key.indexOf("units.") === 0 || key.indexOf("holdings.") === 0)) { syncBindings($("hold-rows")); refreshHoldings(); }
    if (key === "quotesUrl") { QUOTES_LIVE = false; loadQuotes(); }
    updateSettingsVisibility();
    syncStatic();
    if (key === "window" || key === "sort") { renderCompare(); return; }
    if (key && key.indexOf("opt.") === 0) { if (key === "opt.target") return; OPT = null; if (S.tab === "opt") runOpt(); return; }
    if (key === "goal" || key === "goalConf") $("goal-out").textContent = "";
    queueCompute();
  }
  function syncStatic() {
    $("horizon-out").textContent = yearsLabel(S.horizon);
    $("h-label").textContent = yearsLabel(S.horizon);
    $("goal-label").textContent = "Montant visé (" + (S.real ? "€ d’aujourd’hui" : "€") + (S.taxMode !== "none" ? ", après impôt" : "") + ")";
    qsa("[data-set]").forEach(b => b.setAttribute("aria-checked", String(String(getPath(S, b.dataset.set)) === b.dataset.val)));
    $("step-seg").hidden = S.mode !== "param";
    const sch = schedule(S, S.horizon), cap = $("cap-note");
    if (S.stopAtCap && sch.capYear) cap.textContent = "Plafond de " + eur(S.cap) + " atteint en " + (CUR_YEAR + sch.capYear) + " : versements arrêtés ensuite.";
    else cap.textContent = "Versé à l’horizon : " + eur(sch.depCum[S.horizon]) + (S.stopAtCap ? " (plafond " + eur(S.cap) + ")." : ".");
    const extra = [];
    if (S.lumpAmount > 0 && S.lumpYear <= S.horizon) extra.push("versement ponctuel de " + eur(S.lumpAmount) + " en " + (CUR_YEAR + S.lumpYear - 1));
    if (sch.wdCum[S.horizon] > 0) extra.push("retraits de " + eur(S.wdMonthly) + " par mois dès " + (CUR_YEAR + S.wdFrom - 1) + ", soit " + eur(sch.wdCum[S.horizon]) + " retirés");
    if (extra.length) cap.textContent += " Avec " + extra.join(" et ") + ".";
  }

  /* =================== Simuler : éditeurs =================== */
  function buildHoldings() {
    $("hold-rows").innerHTML = DATA.etfs.map((e, i) =>
      "<div class=\"hold k" + (i % 8) + "\"><label class=\"hrow\"><span class=\"tick\">" + esc(e.id) + "</span>" +
      "<input type=\"number\" inputmode=\"decimal\" min=\"0\" step=\"100\" data-bind=\"holdings." + esc(e.id) + "\" aria-label=\"Valeur actuelle de " + esc(e.id) + " en euros\">" +
      "<span class=\"unit\">€</span></label>" +
      "<label class=\"hunits\"><input type=\"number\" inputmode=\"decimal\" min=\"0\" step=\"1\" data-bind=\"units." + esc(e.id) + "\" data-nullable=\"1\" placeholder=\"—\" aria-label=\"Nombre de parts de " + esc(e.id) + "\">" +
      "<span>parts <span data-qhint=\"" + esc(e.id) + "\"></span></span></label></div>").join("");
    syncBindings($("hold-rows")); refreshHoldings();
  }
  function refreshHoldings() {
    const box = $("hold-rows");
    DATA.etfs.forEach(e => {
      const q = quoteOf(e.id), u = S.units[e.id] || 0;
      const hint = box.querySelector("[data-qhint=\"" + e.id + "\"]"), inp = box.querySelector("[data-bind=\"holdings." + e.id + "\"]");
      if (hint) hint.textContent = q ? "× " + dec(q.price, 2) + NB + "€" + (u > 0 ? " = " + eur(u * q.price) : "") : (u > 0 ? " : cours indisponible, montant saisi utilisé" : "");
      if (inp) { inp.readOnly = !!(q && u > 0); inp.title = inp.readOnly ? "Calculé à partir du nombre de parts et du dernier cours" : ""; }
    });
    const note = $("quotes-note"); if (!note) return;
    if (QUOTES) {
      const dates = Object.values(QUOTES.etfs).map(q => q && q.date).filter(Boolean).sort();
      note.textContent = "Cours du " + frDate(dates[dates.length - 1]) + " (" + String(QUOTES.source || "en ligne").replace(/ \(.*\)$/, "") + ")" +
        (QUOTES_LIVE || !QUOTES_TRIED ? "." : " : dernière version enregistrée, cours en ligne injoignables.") +
        " Saisis un nombre de parts pour valoriser une ligne au dernier cours.";
    } else note.textContent = QUOTES_TRIED ? "Cours en ligne injoignables : saisis les montants à la main." : "";
  }
  async function loadQuotes() {
    const urls = [];
    if (/^https?:$/.test(location.protocol)) urls.push("cours.json");
    if (S.quotesUrl) urls.push(S.quotesUrl);
    if (typeof fetch !== "function" || !urls.length) { refreshHoldings(); return; }
    for (const u of urls) {
      try {
        const ctl = typeof AbortController === "function" ? new AbortController() : null;
        const t = setTimeout(() => { if (ctl) ctl.abort(); }, 8000);
        const r = await fetch(u, { cache: "no-cache", signal: ctl ? ctl.signal : undefined }); clearTimeout(t);
        if (!r.ok) continue;
        const q = await r.json(); if (!validQuotes(q)) continue;
        QUOTES = q; QUOTES_LIVE = true; lsSet(LS_QUOTES, JSON.stringify(q)); break;
      } catch (e) { /* source suivante */ }
    }
    QUOTES_TRIED = true;
    S = sanitizeState(S); syncBindings($("hold-rows")); refreshHoldings(); saveSoon();
    if (S.tab === "compare") renderCompare();
    queueCompute();
  }
  function wSummary(sc) {
    const E = DATA.etfs, w = scenarioWeights(sc, E).w;
    if (!w) return "Aucune part définie : scénario ignoré.";
    return E.map((e, i) => w[i] > 0.0005 ? e.id + NB + Math.round(w[i] * 100) + NB + "%" : null).filter(Boolean).join(", ") +
      " ; " + REBAL_SHORT[sc.rebal] + (sc.applyNow ? ", arbitré au départ" : "") + ".";
  }
  function buildScenarioEditors() {
    const E = DATA.etfs;
    $("sc-editors").innerHTML = S.scenarios.map((sc, si) =>
      "<details class=\"sc c" + si + "\" data-sc=\"" + sc.id + "\"" + (sc.id === S.focus ? " open" : "") + ">" +
      "<summary><span class=\"dot-s\"></span><span class=\"sc-title\" data-title></span><span class=\"badge\" data-badge></span></summary>" +
      "<p class=\"sc-sum\" data-sum></p><div class=\"sc-body\">" +
      "<label class=\"field\"><span>Nom</span><input type=\"text\" maxlength=\"24\" data-scf=\"name\" value=\"" + esc(sc.name) + "\"></label>" +
      "<div class=\"allocbar\" data-bar aria-hidden=\"true\"></div>" +
      E.map((e, i) => "<div class=\"wrow k" + (i % 8) + "\"><span class=\"tick\">" + esc(e.id) + "</span>" +
        "<input type=\"range\" min=\"0\" max=\"100\" step=\"1\" data-scf=\"w\" data-etf=\"" + esc(e.id) + "\" value=\"" + (sc.weights[e.id] || 0) + "\" aria-label=\"Part de " + esc(e.id) + "\">" +
        "<output data-wo=\"" + esc(e.id) + "\"></output></div>").join("") +
      "<p class=\"note\" data-total></p>" +
      "<label class=\"field\"><span>Rééquilibrage</span><select data-scf=\"rebal\">" + REBAL.map(r => "<option value=\"" + r[0] + "\"" + (sc.rebal === r[0] ? " selected" : "") + ">" + r[1] + "</option>").join("") + "</select></label>" +
      "<label class=\"field\" data-bandrow><span>Seuil d’écart (points de pourcentage)</span><input type=\"number\" inputmode=\"decimal\" min=\"1\" max=\"50\" step=\"1\" data-scf=\"band\" value=\"" + sc.band + "\"></label>" +
      "<label class=\"switch\"><input type=\"checkbox\" data-scf=\"applyNow\"" + (sc.applyNow ? " checked" : "") + "><span>Arbitrer tout le capital au départ<small>Ventes et achats internes au PEA : pas d’impôt tant que l’argent reste dans le plan.</small></span></label>" +
      "<div class=\"actions\">" +
      "<button class=\"btn small\" type=\"button\" data-act=\"focus\">Afficher</button>" +
      "<button class=\"btn ghost small\" type=\"button\" data-act=\"ref\">Prendre comme référence</button>" +
      "<button class=\"btn ghost small\" type=\"button\" data-act=\"equal\">Parts égales</button>" +
      "<button class=\"btn ghost small\" type=\"button\" data-act=\"dup\">Dupliquer</button>" +
      "<button class=\"btn danger small\" type=\"button\" data-act=\"del\">Supprimer</button>" +
      "</div></div></details>").join("");
    syncScenarioEditors();
  }
  function syncScenarioEditors() {
    const E = DATA.etfs;
    qsa("details.sc", $("sc-editors")).forEach(det => {
      const sc = scById(det.dataset.sc); if (!sc) return;
      const wv = scenarioWeights(sc, E), sum = wv.sum;
      det.querySelector("[data-title]").textContent = sc.name;
      const badges = []; if (sc.id === S.focus) badges.push("affiché"); if (sc.id === S.ref) badges.push("référence");
      const b = det.querySelector("[data-badge]"); b.textContent = badges.join(", "); b.hidden = !badges.length;
      det.querySelector("[data-sum]").textContent = wSummary(sc);
      qsa("[data-wo]", det).forEach(o => { o.textContent = Math.round(sc.weights[o.dataset.wo] || 0) + NB + "%"; });
      det.querySelector("[data-bar]").innerHTML = wv.w ? E.map((e, i) => wv.w[i] > 0 ? "<span class=\"k" + (i % 8) + "\" style=\"width:" + (wv.w[i] * 100).toFixed(2) + "%\"></span>" : "").join("") : "";
      const tot = det.querySelector("[data-total]");
      tot.className = Math.round(sum) === 100 ? "note" : "warn";
      tot.textContent = sum === 0 ? "Aucune part : ce scénario est ignoré." : Math.round(sum) === 100 ? "Total 100" + NB + "%." : "Total " + Math.round(sum) + NB + "% : ramené à 100" + NB + "% pour le calcul.";
      det.querySelector("[data-bandrow]").hidden = sc.rebal !== "band";
      det.querySelector("[data-act=\"focus\"]").disabled = sc.id === S.focus;
      det.querySelector("[data-act=\"ref\"]").disabled = sc.id === S.ref;
      det.querySelector("[data-act=\"dup\"]").disabled = S.scenarios.length >= SC_MAX;
      det.querySelector("[data-act=\"del\"]").disabled = S.scenarios.length <= 1;
    });
    $("sc-add").disabled = S.scenarios.length >= SC_MAX;
  }
  function newScId() { let n = 1; while (S.scenarios.some(x => x.id === "s" + n)) n++; return "s" + n; }
  function equalWeights(ids) { const r = roundTo100(ids.map(() => 1)), w = {}; ids.forEach((id, i) => { w[id] = r[i]; }); return w; }
  function scenarioStructChanged() { S = sanitizeState(S); saveSoon(); buildScenarioEditors(); renderChips(); fillOptTarget(); queueCompute(); }
  function wireScenarioEditors() {
    const box = $("sc-editors");
    box.addEventListener("input", ev => {
      const el = ev.target, det = el.closest("details.sc"); if (!det || !el.dataset.scf) return;
      const sc = scById(det.dataset.sc); if (!sc) return;
      const f = el.dataset.scf;
      if (f === "name") { sc.name = el.value.slice(0, 24) || "Sans nom"; saveSoon(); syncScenarioEditors(); renderChips(); fillOptTarget(); renderSimAll(); return; }
      if (f === "w") sc.weights[el.dataset.etf] = clampNum(el.value, 0, 100, 0);
      else if (f === "band") sc.band = Math.round(clampNum(el.value, 1, 50, 5));
      else return;
      saveSoon(); syncScenarioEditors(); queueCompute();
    });
    box.addEventListener("change", ev => {
      const el = ev.target, det = el.closest("details.sc"); if (!det || !el.dataset.scf) return;
      const sc = scById(det.dataset.sc); if (!sc) return;
      if (el.dataset.scf === "rebal") sc.rebal = en(el.value, ["none", "flows", "annual", "band"], "none");
      else if (el.dataset.scf === "applyNow") sc.applyNow = el.checked;
      else if (el.dataset.scf === "band") { sc.band = Math.round(clampNum(el.value, 1, 50, 5)); el.value = sc.band; }
      else return;
      saveSoon(); syncScenarioEditors(); queueCompute();
    });
    box.addEventListener("click", ev => {
      const btn = ev.target.closest("button[data-act]"); if (!btn) return;
      const det = btn.closest("details.sc"), sc = scById(det.dataset.sc); if (!sc) return;
      const act = btn.dataset.act;
      if (act === "focus") { S.focus = sc.id; saveSoon(); syncScenarioEditors(); renderSimAll(); }
      else if (act === "ref") { S.ref = sc.id; saveSoon(); syncScenarioEditors(); renderSimAll(); }
      else if (act === "equal") {
        let ids = DATA.etfs.map(e => e.id).filter(id => (sc.weights[id] || 0) > 0);
        if (!ids.length) ids = DATA.etfs.map(e => e.id);
        sc.weights = equalWeights(ids);
        qsa("[data-scf=\"w\"]", det).forEach(inp => { inp.value = sc.weights[inp.dataset.etf] || 0; });
        saveSoon(); syncScenarioEditors(); queueCompute();
      } else if (act === "dup" && S.scenarios.length < SC_MAX) {
        const c = clone(sc); c.id = newScId(); c.name = (sc.name + " (copie)").slice(0, 24);
        S.scenarios.push(c); S.focus = c.id; scenarioStructChanged();
      } else if (act === "del" && S.scenarios.length > 1) {
        S.scenarios = S.scenarios.filter(x => x.id !== sc.id); scenarioStructChanged();
      }
    });
    $("sc-add").addEventListener("click", () => {
      if (S.scenarios.length >= SC_MAX) return;
      const id = newScId();
      S.scenarios.push({ id, name: "Scénario " + id.slice(1), weights: equalWeights(DATA.etfs.map(e => e.id)), applyNow: false, rebal: "annual", band: 5 });
      S.focus = id; scenarioStructChanged();
    });
    $("sc-chips").addEventListener("click", ev => {
      const b = ev.target.closest("[data-chip]"); if (!b) return;
      S.focus = b.dataset.chip; saveSoon();
      qsa("details.sc", $("sc-editors")).forEach(d => { if (d.dataset.sc === S.focus) d.open = true; });
      syncScenarioEditors(); renderSimAll();
    });
  }

  /* =================== Simuler : rendu =================== */
  function renderChips() {
    $("sc-chips").innerHTML = S.scenarios.map((sc, si) =>
      "<button type=\"button\" class=\"chip c" + si + "\" data-chip=\"" + sc.id + "\" aria-pressed=\"" + (sc.id === S.focus) + "\"><span class=\"dot\"></span>" +
      esc(sc.name) + (sc.id === S.ref ? " <small>référence</small>" : "") + "</button>").join("");
  }
  function describeModel() {
    if (!SIM) return "";
    const unit = S.real ? "Montants en euros d’aujourd’hui (inflation " + pct(S.inflation, 1) + " par an)." : "Montants en euros courants.";
    if (SIM.useBoot) {
      const u = DATA.etfs.filter((e, i) => MODEL.used[i]), p = u.find(e => e.id === "PUST");
      let t = "Chaque année simulée reprend une année réelle tirée au hasard parmi " + period(SIM.years) + " (" + SIM.years.length + NB + "années communes aux ETF utilisés)";
      t += SIM.block > 1 ? ", par blocs de " + SIM.block + " années consécutives. " : ". ";
      if (p) { const g = cagr(series(p, SIM.years)); t += "Sur cette période, PUST a fait " + pct(g, 1, true) + " par an : le cône prolonge ce passé. "; }
      return t + unit;
    }
    const rm = { same: "le même pour tous (" + pct(S.gSame, 1) + ", frais déduits)", histCommon: "historique sur les années communes", histMax: "historique complet de chaque ETF", custom: "saisi par ETF" }[S.retMode];
    const vm = { factsheet: "sur 3 ans des reportings", annual: "écart-type des rendements annuels", custom: "saisie par ETF" }[S.volMode];
    const cm = S.corrMode === "uniform" ? "identique (" + dec(S.rho, 2) + ")" : "estimée par paire, rapprochée à " + Math.round(MODEL.lamEff * 100) + NB + "% de la moyenne";
    return "Modèle paramétrique au pas " + (SIM.monthly ? "mensuel" : "annuel") + ". Rendement médian " + rm + ", volatilité " + vm + ", corrélation " + cm + ". " + unit;
  }
  function renderSimNotes() {
    $("sim-note").textContent = describeModel();
    const w = MODEL ? MODEL.warnings.slice() : [];
    if (S.mode === "boot" && SIM && !SIM.useBoot) w.push("Aucune année commune aux ETF utilisés : modèle paramétrique appliqué à la place.");
    else if (S.mode === "boot" && SIM && SIM.years.length < 4) w.push("Seulement " + SIM.years.length + NB + "années communes : élargis la fenêtre dans les réglages ou retire un ETF récent.");
    S.scenarios.forEach(sc => { if (!scenarioWeights(sc, DATA.etfs).w) w.push("« " + sc.name + " » n’a aucune part : il est ignoré."); });
    const tot = DATA.etfs.reduce((s, e) => s + (S.holdings[e.id] || 0), 0);
    if (tot === 0 && S.monthly === 0) w.push("Ajoute un capital ou un versement mensuel pour lancer la simulation.");
    const el = $("sim-warn"); el.hidden = !w.length; el.textContent = w.join(" ");
    $("model-note").textContent = S.mode === "boot"
      ? "Rejoue des années réellement vécues. Simple et fidèle aux krachs passés, mais limité aux années communes."
      : "Tire des rendements selon des hypothèses que tu règles. Le mode le plus neutre : le même rendement pour tous.";
  }
  function renderSimAll() {
    renderChips(); syncScenarioEditors(); renderSimNotes(); renderKpis(); renderReadout(); syncStatic();
    if (S.tab === "sim") renderSimCharts();
  }
  function renderSimCharts() { renderFan(); renderFanLegend(); renderHist(); renderBacktest(); }
  function gridY(W, pl, pr, ymax, nT, y, fmt) {
    let g = "";
    for (let k = 1; k <= nT; k++) {
      const v = ymax * k / nT, yy = y(v).toFixed(1);
      g += "<line class=\"grid\" x1=\"" + pl + "\" x2=\"" + (W - pr) + "\" y1=\"" + yy + "\" y2=\"" + yy + "\"/><text class=\"ylab\" x=\"" + (pl + 2) + "\" y=\"" + (y(v) - 4).toFixed(1) + "\">" + fmt(v) + "</text>";
    }
    return g + "<line class=\"axis\" x1=\"" + pl + "\" x2=\"" + (W - pr) + "\" y1=\"" + y(0).toFixed(1) + "\" y2=\"" + y(0).toFixed(1) + "\"/>";
  }
  function renderFan() {
    const box = $("fan"); if (!box || !SIM) return;
    const focus = resOf(S.focus) || SIM.res[0];
    if (!focus) { box.innerHTML = "<p class=\"note\">Aucun scénario valide à afficher.</p>"; FAN = null; return; }
    const W = chartW(box), narrow = W < 560, Hh = narrow ? 280 : 340, pl = 4, pr = narrow ? 104 : 128, pt = 14, pb = 26, T = SIM.H;
    const fi = scIdx(focus.id), dz = a => Array.from(a, (v, t) => v / defl(t));
    const B = focus.bands.map(dz), dep = dz(SIM.sch.depCum);
    const others = SIM.res.filter(r => r.id !== focus.id).map(r => ({ r, med: dz(r.bands[2]), idx: scIdx(r.id) }));
    const ymax = niceMax(Math.max(amax(B[4]), amax(dep), ...others.map(o => amax(o.med))) * 1.03);
    const x = t => pl + (W - pl - pr) * t / T, y = v => pt + (Hh - pt - pb) * (1 - v / ymax);
    const pts = a => a.map((v, t) => x(t).toFixed(1) + "," + y(v).toFixed(1));
    const area = (lo, hi) => "M" + pts(hi).join(" L") + " L" + pts(lo).reverse().join(" L") + " Z";
    const line = a => "M" + pts(a).join(" L");
    let g = gridY(W, pl, pr, ymax, 4, y, keur);
    const ticks = T <= 4 ? Array.from({ length: T + 1 }, (_, i) => i) : [0, Math.round(T / 2), T];
    ticks.forEach(t => { g += "<text class=\"xlab\" x=\"" + x(t).toFixed(1) + "\" y=\"" + (Hh - 8) + "\" text-anchor=\"" + (t === 0 ? "start" : t === T ? "end" : "middle") + "\">" + (CUR_YEAR + t) + "</text>"; });
    let s = "<path class=\"band-o c" + fi + "\" d=\"" + area(B[0], B[4]) + "\"/><path class=\"band-i c" + fi + "\" d=\"" + area(B[1], B[3]) + "\"/>" +
      "<path class=\"contrib\" d=\"" + line(dep) + "\"/>";
    others.forEach(o => { s += "<path class=\"ln other c" + o.idx + "\" d=\"" + line(o.med) + "\"/>"; });
    s += "<path class=\"ln c" + fi + "\" d=\"" + line(B[2]) + "\"/>";
    const ql = Math.round(S.qLow * 100), qh = Math.round(S.qHigh * 100);
    const labs = [
      { y: y(B[4][T]), t: "P" + qh + " " + keur(B[4][T]), c: "lab" },
      { y: y(B[2][T]), t: "Médiane " + keur(B[2][T]), c: "lab sc c" + fi },
      { y: y(B[0][T]), t: "P" + ql + " " + keur(B[0][T]), c: "lab" }
    ].concat(others.map(o => ({ y: y(o.med[T]), t: o.r.name.slice(0, 12) + " " + keur(o.med[T]), c: "lab sc c" + o.idx })));
    placeLabels(labs, pt + 4, Hh - pb, 15).forEach(l => { s += "<text class=\"" + l.c + "\" x=\"" + (W - pr + 6) + "\" y=\"" + (l.y + 4).toFixed(1) + "\">" + esc(l.t) + "</text>"; });
    s += "<line class=\"xline\" x1=\"0\" x2=\"0\" y1=\"" + pt + "\" y2=\"" + (Hh - pb) + "\" visibility=\"hidden\"/>";
    s += "<rect class=\"hit\" x=\"" + pl + "\" y=\"" + pt + "\" width=\"" + (W - pl - pr) + "\" height=\"" + (Hh - pt - pb) + "\"/>";
    box.innerHTML = "<svg viewBox=\"0 0 " + W + " " + Hh + "\" width=\"" + W + "\" height=\"" + Hh + "\" role=\"img\" aria-label=\"Cône des possibles de " + esc(focus.name) +
      " : médiane " + esc(eur(B[2][T])) + " à l’horizon\">" + g + s + "</svg><div class=\"tip\" id=\"fan-tip\" hidden></div>";
    FAN = { W, pl, pr, T, x, B, dep, others, focus, ql, qh };
  }
  function fanPointer(ev) {
    if (!FAN || !Number.isFinite(ev.clientX)) return;
    const svg = $("fan").querySelector("svg"); if (!svg) return;
    const rect = svg.getBoundingClientRect(), sx = FAN.W / (rect.width || FAN.W);
    const xs = (ev.clientX - rect.left) * sx;
    const t = Math.max(0, Math.min(FAN.T, Math.round((xs - FAN.pl) / (FAN.W - FAN.pl - FAN.pr) * FAN.T)));
    const ln = svg.querySelector(".xline");
    ln.setAttribute("x1", FAN.x(t)); ln.setAttribute("x2", FAN.x(t)); ln.setAttribute("visibility", "visible");
    const row = (a, b) => "<div class=\"r\"><span>" + a + "</span><span>" + b + "</span></div>";
    let h = "<b>" + (CUR_YEAR + t) + "</b>" + row("P" + FAN.qh, keur(FAN.B[4][t])) + row("Médiane", keur(FAN.B[2][t])) + row("P" + FAN.ql, keur(FAN.B[0][t]));
    FAN.others.forEach(o => { h += row(esc(o.r.name), keur(o.med[t])); });
    h += row("Versé", keur(FAN.dep[t]));
    const tip = $("fan-tip"); tip.innerHTML = h; tip.hidden = false;
    const bw = $("fan").clientWidth || FAN.W, px = FAN.x(t) / sx, tw = tip.offsetWidth || 170;
    let left = px + 14; if (left + tw > bw - 6) left = px - tw - 14;
    tip.style.left = Math.max(6, left) + "px";
  }
  function fanLeave(ev) {
    if (ev.pointerType === "touch") return;
    const tip = $("fan-tip"); if (tip) tip.hidden = true;
    const ln = $("fan").querySelector(".xline"); if (ln) ln.setAttribute("visibility", "hidden");
  }
  function renderFanLegend() {
    const focus = resOf(S.focus) || (SIM && SIM.res[0]); if (!focus) { $("fan-legend").innerHTML = ""; return; }
    const fi = scIdx(focus.id), spread = Math.round((S.qHigh - S.qLow) * 100);
    let h = "<li class=\"c" + fi + "\"><i class=\"o\"></i>" + spread + NB + "% des cas</li><li class=\"c" + fi + "\"><i></i>Médiane " + esc(focus.name) + "</li>";
    SIM.res.filter(r => r.id !== focus.id).forEach(r => { h += "<li class=\"c" + scIdx(r.id) + "\"><i class=\"d\"></i>Médiane " + esc(r.name) + "</li>"; });
    h += "<li><i class=\"p\"></i>Total versé</li>";
    $("fan-legend").innerHTML = h;
  }
  function wavg(w, vals) {
    let s = 0; for (let i = 0; i < w.length; i++) { if (w[i] > 0) { if (!Number.isFinite(vals[i])) return NaN; s += w[i] * vals[i]; } }
    return s;
  }
  function renderKpis() {
    if (!SIM) return;
    const list = S.scenarios.map(sc => ({ sc, r: resOf(sc.id), i: scIdx(sc.id) })).filter(x => x.r);
    if (!list.length) { $("kpis").innerHTML = ""; return; }
    const H = SIM.H, d = defl(H), E = DATA.etfs, ql = Math.round(S.qLow * 100), qh = Math.round(S.qHigh * 100);
    const rows = [
      ["Médiane", x => keur(x.r.bands[2][H] / d)],
      ["Défavorable (P" + ql + ")", x => keur(x.r.bands[0][H] / d)],
      ["Favorable (P" + qh + ")", x => keur(x.r.bands[4][H] / d)]
    ];
    if (S.taxMode !== "none") rows.push(["Médiane après impôt (" + pct(SIM.rate, 1) + " sur le gain)", x => keur(quantile(x.r.net, 0.5) / d)]);
    if (S.goal > 0) rows.push(["Objectif de " + keur(S.goal) + " atteint", x => pct(x.r.probGoal, 0)]);
    if (SIM.sch.wdCum[H] > 0) {
      rows.push(["Retiré au total", () => keur(SIM.sch.wdCum[H] / d)]);
      rows.push(["Capital épuisé avant l’horizon", x => pct(x.r.probRuin, 0)]);
    }
    rows.push([SIM.sch.wdCum[H] > 0 ? "Retiré + restant sous le total versé" : "Finir sous le total versé", x => pct(x.r.probLoss, 0)]);
    rows.push(["Perte maximale médiane", x => pct(x.r.ddMed, 0)]);
    rows.push(["Perte maximale défavorable (P" + ql + ")", x => pct(x.r.ddLow, 0)]);
    rows.push(["Au moins une année à " + pct(S.badYear, 0) + " ou pire", x => pct(x.r.bad, 0)]);
    rows.push(["Rendement annualisé médian", x => pct(x.r.twr, 1)]);
    rows.push(["Frais annuels des ETF", x => pct(wavg(x.r.w, E.map(e => e.ter / 100)), 2)]);
    rows.push(["Part tech (IT)", x => pct(wavg(x.r.w, E.map(e => Number.isFinite(e.it) ? e.it / 100 : NaN)), 0)]);
    rows.push(["Frais d’ordres cumulés", x => eur(x.r.feesMean)]);
    $("kpis").innerHTML = "<table class=\"kpi\"><thead><tr><th scope=\"col\">À " + yearsLabel(H) + "</th>" +
      list.map(x => "<th scope=\"col\" class=\"c" + x.i + "\">" + esc(x.sc.name) + (x.sc.id === S.ref ? "<br><small>référence</small>" : "") + "</th>").join("") + "</tr></thead><tbody>" +
      rows.map((rw, ri) => "<tr" + (ri === 2 ? " class=\"sep\"" : "") + "><td>" + esc(rw[0]) + "</td>" + list.map(x => "<td" + (x.sc.id === S.focus ? " class=\"f\"" : "") + ">" + rw[1](x) + "</td>").join("") + "</tr>").join("") +
      "</tbody></table>";
  }
  function renderHist() {
    const box = $("hist"); if (!box || !SIM) return;
    const focus = resOf(S.focus) || SIM.res[0]; if (!focus) { box.innerHTML = ""; return; }
    const ref = resOf(S.ref), showRef = ref && ref.id !== focus.id, d = defl(SIM.H);
    const F = focus.fin, R = showRef ? ref.fin : null;
    let lo = quantile(F, 0.01) / d, hi = quantile(F, 0.99) / d;
    if (R) { lo = Math.min(lo, quantile(R, 0.01) / d); hi = Math.max(hi, quantile(R, 0.99) / d); }
    if (S.goal > 0) hi = Math.max(hi, S.goal * 1.05);
    if (!(hi > lo)) hi = lo + 1;
    const W = chartW(box), Hh = W < 560 ? 170 : 200, pl = 6, pr = 8, pt = 10, pb = 24, NBINS = 32, bw = (hi - lo) / NBINS;
    const cnt = arr => { const c = new Float64Array(NBINS); for (let i = 0; i < arr.length; i++) { const v = arr[i] / d; if (v < lo || v > hi) continue; c[Math.min(NBINS - 1, Math.floor((v - lo) / bw))]++; } return c; };
    const cF = cnt(F), cR = R ? cnt(R) : null, cmax = Math.max(amax(cF), cR ? amax(cR) : 0) || 1;
    const x = v => pl + (W - pl - pr) * (v - lo) / (hi - lo), y = c => pt + (Hh - pt - pb) * (1 - c / cmax);
    const fi = scIdx(focus.id);
    let s = "<line class=\"axis\" x1=\"" + pl + "\" x2=\"" + (W - pr) + "\" y1=\"" + y(0) + "\" y2=\"" + y(0) + "\"/>";
    for (let i = 0; i < NBINS; i++) if (cF[i] > 0) { const x0 = x(lo + i * bw), x1 = x(lo + (i + 1) * bw); s += "<rect class=\"hbar c" + fi + "\" x=\"" + (x0 + 0.5).toFixed(1) + "\" y=\"" + y(cF[i]).toFixed(1) + "\" width=\"" + Math.max(0.5, x1 - x0 - 1).toFixed(1) + "\" height=\"" + (y(0) - y(cF[i])).toFixed(1) + "\"/>"; }
    if (cR) {
      let p = "M" + x(lo).toFixed(1) + "," + y(0).toFixed(1);
      for (let i = 0; i < NBINS; i++) p += " L" + x(lo + i * bw).toFixed(1) + "," + y(cR[i]).toFixed(1) + " L" + x(lo + (i + 1) * bw).toFixed(1) + "," + y(cR[i]).toFixed(1);
      p += " L" + x(hi).toFixed(1) + "," + y(0).toFixed(1);
      s += "<path class=\"hstep c" + scIdx(ref.id) + "\" d=\"" + p + "\"/>";
    }
    const mk = (v, cls) => "<line class=\"" + cls + "\" x1=\"" + x(v).toFixed(1) + "\" x2=\"" + x(v).toFixed(1) + "\" y1=\"" + pt + "\" y2=\"" + y(0).toFixed(1) + "\"/>";
    s += mk(quantile(F, 0.5) / d, "mk c" + fi);
    if (S.goal > 0 && S.goal >= lo && S.goal <= hi) s += mk(S.goal, "mk goal");
    s += "<text class=\"xlab\" x=\"" + pl + "\" y=\"" + (Hh - 7) + "\">" + keur(lo) + "</text><text class=\"xlab\" x=\"" + ((W - pr + pl) / 2).toFixed(1) + "\" y=\"" + (Hh - 7) + "\" text-anchor=\"middle\">" + keur((lo + hi) / 2) + "</text><text class=\"xlab\" x=\"" + (W - pr) + "\" y=\"" + (Hh - 7) + "\" text-anchor=\"end\">" + keur(hi) + "</text>";
    box.innerHTML = "<svg viewBox=\"0 0 " + W + " " + Hh + "\" width=\"" + W + "\" height=\"" + Hh + "\" role=\"img\" aria-label=\"Distribution des valeurs finales\">" + s + "</svg>";
    $("hist-note").textContent = "Répartition des " + nf0.format(SIM.P) + " scénarios selon la valeur finale (1" + NB + "% des cas extrêmes de chaque côté hors cadre). Barres : " + focus.name + (showRef ? ". Contour : " + ref.name : "") + ". Trait vertical : médiane" + (S.goal > 0 ? ", pointillé : objectif." : ".");
  }
  function renderBacktest() {
    const box = $("bt-chart"); if (!box) return;
    if (!BT || !BT.years.length) { box.innerHTML = "<p class=\"note\">Aucune année commune aux ETF utilisés : rejeu impossible.</p>"; $("bt-table").innerHTML = ""; $("bt-note").textContent = ""; return; }
    const ys = BT.years, Y = ys.length, list = BT.res.map((r, k) => r ? { r, i: k } : null).filter(Boolean);
    $("bt-title").textContent = "Rejoué sur " + period(ys);
    const W = chartW(box), narrow = W < 560, Hh = narrow ? 200 : 240, pl = 4, pr = narrow ? 104 : 128, pt = 12, pb = 24;
    const dep = Array.from(BT.depCum);
    const ymax = niceMax(Math.max(amax(dep), ...list.map(o => amax(o.r.vals))) * 1.03);
    const x = i => pl + (W - pl - pr) * i / Y, y = v => pt + (Hh - pt - pb) * (1 - v / ymax);
    const line = a => "M" + a.map((v, i) => x(i).toFixed(1) + "," + y(v).toFixed(1)).join(" L");
    let s = gridY(W, pl, pr, ymax, 3, y, keur) +
      "<text class=\"xlab\" x=\"" + x(0).toFixed(1) + "\" y=\"" + (Hh - 7) + "\">janv. " + ys[0] + "</text><text class=\"xlab\" x=\"" + x(Y).toFixed(1) + "\" y=\"" + (Hh - 7) + "\" text-anchor=\"end\">déc. " + ys[Y - 1] + "</text>" +
      "<path class=\"contrib\" d=\"" + line(dep) + "\"/>";
    list.forEach(o => { s += "<path class=\"ln" + (o.r.id === S.focus ? "" : " other") + " c" + o.i + "\" d=\"" + line(o.r.vals) + "\"/>"; });
    placeLabels(list.map(o => ({ y: y(o.r.vals[Y]), t: o.r.name.slice(0, 12) + " " + keur(o.r.vals[Y]), c: "lab sc c" + o.i })), pt + 4, Hh - pb, 15)
      .forEach(l => { s += "<text class=\"" + l.c + "\" x=\"" + (W - pr + 6) + "\" y=\"" + (l.y + 4).toFixed(1) + "\">" + esc(l.t) + "</text>"; });
    box.innerHTML = "<svg viewBox=\"0 0 " + W + " " + Hh + "\" width=\"" + W + "\" height=\"" + Hh + "\" role=\"img\" aria-label=\"Rejeu des années réelles\">" + s + "</svg>";
    let t = "<table class=\"kpi\"><thead><tr><th scope=\"col\">Année</th>" + list.map(o => "<th scope=\"col\" class=\"c" + o.i + "\">" + esc(o.r.name) + "</th>").join("") + "</tr></thead><tbody>";
    ys.forEach((yr, k) => { t += "<tr><td>" + yr + "</td>" + list.map(o => "<td" + (o.r.id === S.focus ? " class=\"f\"" : "") + ">" + pct(o.r.rets[k], 1, true) + "</td>").join("") + "</tr>"; });
    t += "<tr class=\"sep\"><td></td>" + list.map(() => "<td></td>").join("") + "</tr>";
    t += "<tr><td>Valeur fin " + ys[Y - 1] + "</td>" + list.map(o => "<td>" + keur(o.r.vals[Y]) + "</td>").join("") + "</tr>";
    t += "<tr><td>Rendement annualisé</td>" + list.map(o => "<td>" + pct(o.r.cagr, 1, true) + "</td>").join("") + "</tr>";
    t += "<tr><td>Pire baisse (fins d’année)</td>" + list.map(o => "<td>" + pct(o.r.dd, 1) + "</td>").join("") + "</tr>";
    t += "<tr><td>Frais d’ordres</td>" + list.map(o => "<td>" + eur(o.r.fees) + "</td>").join("") + "</tr></tbody></table>";
    $("bt-table").innerHTML = t;
    $("bt-note").textContent = "Départ avec la valeur actuelle de tes lignes en janvier " + ys[0] + ", puis tes versements. Euros courants. Un seul chemin réel : il ne dit rien des " + Y + " prochaines années.";
  }
  function renderReadout() {
    if (!SIM) return;
    const focus = resOf(S.focus) || SIM.res[0], ref = resOf(S.ref), H = SIM.H, d = defl(H);
    if (!focus) return;
    const fi = scIdx(focus.id), ql = Math.round(S.qLow * 100);
    $("ro-a").className = "c" + fi;
    $("ro-a-l").textContent = focus.name + ", médiane à " + yearsLabel(H);
    $("ro-a-v").textContent = keur(focus.bands[2][H] / d);
    $("ro-b").className = "c" + fi;
    $("ro-b-l").textContent = "Défavorable (P" + ql + ")";
    $("ro-b-v").textContent = keur(focus.bands[0][H] / d);
    const showRef = ref && ref.id !== focus.id;
    $("ro-c").hidden = !showRef;
    if (showRef) { $("ro-c").className = "c" + scIdx(ref.id); $("ro-c-l").textContent = ref.name + ", médiane"; $("ro-c-v").textContent = keur(ref.bands[2][H] / d); }
  }

  /* =================== objectif et exports =================== */
  function solveGoal() {
    const out = $("goal-out");
    if (!(S.goal > 0)) { out.textContent = "Saisis d’abord un montant visé."; return; }
    const sc = scById(S.focus);
    if (!sc || !scenarioWeights(sc, DATA.etfs).w) { out.textContent = "Le scénario affiché n’a aucune part."; return; }
    out.textContent = "Calcul en cours…";
    setTimeout(() => {
      const r = solveMonthly(MODEL, S, sc, goalNominal(), S.goalConf, Math.min(S.nPaths, 800), S.seed);
      const what = eur(S.goal) + (S.real ? " d’aujourd’hui" : "") + (S.taxMode !== "none" ? " après impôt" : "");
      if (!r.reached) out.textContent = "Même avec " + eur(r.monthly) + " par mois, « " + sc.name + " » n’atteint pas " + what + " dans " + pct(S.goalConf, 0) + " des cas" + (S.stopAtCap ? " : le plafond du PEA bloque les versements." : ".");
      else if (r.monthly === 0) out.textContent = "« " + sc.name + " » atteint déjà " + what + " dans " + pct(S.goalConf, 0) + " des cas, sans versement.";
      else out.textContent = "« " + sc.name + " » : environ " + eur(r.monthly) + " par mois pour atteindre " + what + " dans " + pct(S.goalConf, 0) + " des cas, avec les autres réglages inchangés.";
    }, 30);
  }
  function csvq(s) { return "\"" + String(s).replace(/"/g, "\"\"") + "\""; }
  function cnum(v, d) { return Number.isFinite(v) ? v.toFixed(d || 0).replace(".", ",") : ""; }
  function buildCsv() {
    const H = SIM.H, ql = Math.round(S.qLow * 100), qh = Math.round(S.qHigh * 100), unit = S.real ? "euros d’aujourd’hui" : "euros courants";
    const L = [["scenario", "annee", "p" + ql, "p25", "mediane", "p75", "p" + qh, "verse_cumule", "unite"].join(";")];
    SIM.res.forEach(r => { for (let t = 0; t <= H; t++) { const d = defl(t); L.push([csvq(r.name), CUR_YEAR + t].concat([0, 1, 2, 3, 4].map(j => cnum(r.bands[j][t] / d)), [cnum(SIM.sch.depCum[t] / d), csvq(unit)]).join(";")); } });
    if (BT && BT.years.length) {
      const list = BT.res.filter(Boolean);
      L.push(""); L.push(["rejeu_annee"].concat(list.map(r => csvq(r.name + " rendement %"))).join(";"));
      BT.years.forEach((y, i) => L.push([y].concat(list.map(r => cnum(r.rets[i] * 100, 2))).join(";")));
    }
    return "\ufeff" + L.join("\r\n");
  }
  async function saveFile(filename, text, title) {
    if (DOWNLOADS) {
      try { await DOWNLOADS.save({ filename, data: text }); return; }
      catch (e) { if (e && e.code === "declined") return; }
    }
    openSheet(title, "Copie ce contenu et enregistre-le dans un fichier " + filename.split(".").pop().toUpperCase() + ".", text);
  }
  function openSheet(title, note, text) {
    $("sheet-title").textContent = title; $("sheet-note").textContent = note; $("sheet-text").value = text;
    $("sheet").hidden = false; $("sheet-copy").focus();
  }
  function closeSheet() { $("sheet").hidden = true; }
  function copyText(ta, msgEl) {
    const fallback = () => { ta.removeAttribute("readonly"); ta.focus(); ta.select(); if (msgEl) msgEl.textContent = "Copie bloquée : le texte est sélectionné, copie-le à la main."; };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(() => { if (msgEl) msgEl.textContent = "Copié."; }, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }

  /* =================== Comparer =================== */
  function fillSortOptions() { $("cmp-sort").innerHTML = Object.keys(SORTS).map(k => "<option value=\"" + k + "\">" + SORTS[k].label + "</option>").join(""); }
  function spark(e, i, allYears, maxAbs) {
    const W = 300, H = 54, mid = H / 2, n = allYears.length, bw = W / n;
    let s = "<line class=\"axis\" x1=\"0\" x2=\"" + W + "\" y1=\"" + mid + "\" y2=\"" + mid + "\" vector-effect=\"non-scaling-stroke\"/>";
    allYears.forEach((y, j) => {
      const r = e.returns[y]; if (!Number.isFinite(r)) return;
      const h = Math.max(1, Math.abs(r) / maxAbs * (mid - 2));
      s += "<rect class=\"bar" + (r < 0 ? " neg" : "") + "\" x=\"" + (j * bw + bw * 0.2).toFixed(2) + "\" y=\"" + (r >= 0 ? mid - h : mid).toFixed(2) + "\" width=\"" + (bw * 0.6).toFixed(2) + "\" height=\"" + h.toFixed(2) + "\"><title>" + y + NB + ": " + pct(r / 100, 1, true) + "</title></rect>";
    });
    return "<svg class=\"spark k" + (i % 8) + "\" viewBox=\"0 0 " + W + " " + H + "\" preserveAspectRatio=\"none\" role=\"img\" aria-label=\"Rendements annuels de " + esc(e.id) + "\">" + s + "</svg><div class=\"spark-x\"><span>" + allYears[0] + "</span><span>" + allYears[n - 1] + "</span></div>";
  }
  function renderCompare() {
    if (!MODEL) return;
    const E = DATA.etfs, ref = nasdaqId();
    const rows = E.map((e, i) => ({ e, i, m: metrics(e, E, S.window, ref) }));
    const sd = SORTS[S.sort];
    rows.sort((a, b) => { const ka = sd.key(a.m, a.e), kb = sd.key(b.m, b.e), fa = Number.isFinite(ka), fb = Number.isFinite(kb); if (!fa && !fb) return 0; if (!fa) return 1; if (!fb) return -1; return sd.dir * (ka - kb); });
    const cy = commonYears(E);
    $("cmp-note").textContent = S.window === "common"
      ? (cy.length ? "Les " + E.length + " ETF n’existent ensemble que sur " + period(cy) + " : " + cy.length + NB + "années, marquées par le rallye de la tech US. Ce classement décrit ce passé, il ne prédit rien." : "Aucune année commune à tous les ETF : choisis « Tout l’historique de chacun ».")
      : "Chaque ETF est mesuré sur tout son historique : les périodes diffèrent, les rendements ne se comparent donc pas directement.";
    // nuage rendement / risque
    const box = $("cmp-scatter"), W = chartW(box), Hh = W < 560 ? 250 : 300, pl = 44, pr = 18, pt = 14, pb = 34;
    const pts = rows.filter(r => Number.isFinite(r.m.cagr)).map(r => ({ x: r.m.vol, y: r.m.cagr, e: r.e, i: r.i }));
    if (pts.length) {
      const xt = niceTicks(0, amax(pts.map(p => p.x)) * 1.12, 4), yt = niceTicks(Math.min(0, amin(pts.map(p => p.y))), amax(pts.map(p => p.y)) * 1.12, 4);
      const x = v => pl + (W - pl - pr) * (v - xt.lo) / (xt.hi - xt.lo), y = v => pt + (Hh - pt - pb) * (1 - (v - yt.lo) / (yt.hi - yt.lo));
      let s = "";
      yt.t.forEach(v => { s += "<line class=\"grid\" x1=\"" + pl + "\" x2=\"" + (W - pr) + "\" y1=\"" + y(v).toFixed(1) + "\" y2=\"" + y(v).toFixed(1) + "\"/><text class=\"ylab\" x=\"" + (pl - 6) + "\" y=\"" + (y(v) + 4).toFixed(1) + "\" text-anchor=\"end\">" + pct(v, 0) + "</text>"; });
      xt.t.forEach(v => { s += "<text class=\"xlab\" x=\"" + x(v).toFixed(1) + "\" y=\"" + (Hh - 16) + "\" text-anchor=\"middle\">" + pct(v, 0) + "</text>"; });
      s += "<text class=\"xlab\" x=\"" + (W - pr) + "\" y=\"" + (Hh - 2) + "\" text-anchor=\"end\">Volatilité sur 3 ans</text>";
      pts.forEach(p => { const cx = x(p.x), cy2 = y(p.y), right = cx < W - pr - 60; s += "<circle class=\"pt-k k" + (p.i % 8) + "\" cx=\"" + cx.toFixed(1) + "\" cy=\"" + cy2.toFixed(1) + "\" r=\"6\"/><text class=\"lab k k" + (p.i % 8) + "\" x=\"" + (right ? cx + 9 : cx - 9).toFixed(1) + "\" y=\"" + (cy2 - 7).toFixed(1) + "\" text-anchor=\"" + (right ? "start" : "end") + "\">" + esc(p.e.id) + "</text>"; });
      box.innerHTML = "<svg viewBox=\"0 0 " + W + " " + Hh + "\" width=\"" + W + "\" height=\"" + Hh + "\" role=\"img\" aria-label=\"Rendement annualisé selon la volatilité\">" + s + "</svg>";
    } else box.innerHTML = "<p class=\"note\">Pas de données sur cette période.</p>";
    $("cmp-scatter-note").textContent = "Vertical : rendement annualisé " + (S.window === "common" ? "sur " + period(cy) : "sur tout l’historique") + ". En haut à gauche : plus de rendement pour moins de risque, sur le passé.";
    // corrélations
    const n = E.length;
    let h = "<table><thead><tr><th></th>" + E.map((e, i) => "<th class=\"k" + (i % 8) + "\" scope=\"col\">" + esc(e.id) + "</th>").join("") + "</tr></thead><tbody>";
    for (let i = 0; i < n; i++) {
      h += "<tr><th class=\"k" + (i % 8) + "\" scope=\"row\">" + esc(E[i].id) + "</th>";
      for (let j = 0; j < n; j++) {
        const r = MODEL.rawCorr[i][j], nn = MODEL.rawN[i][j];
        if (i === j) { h += "<td class=\"dark\" style=\"--a:.85\"><span>1</span></td>"; continue; }
        if (!Number.isFinite(r)) { h += "<td><span>—</span></td>"; continue; }
        const a = Math.min(0.85, Math.abs(r) * 0.85);
        h += "<td class=\"" + (r < 0 ? "neg" : "") + (a > 0.5 ? " dark" : "") + "\" style=\"--a:" + a.toFixed(2) + "\" title=\"" + nn + " années communes\"><span>" + dec(r, 2) + "<small>" + nn + NB + "ans</small></span></td>";
      }
      h += "</tr>";
    }
    $("cmp-heat").innerHTML = h + "</tbody></table>";
    $("cmp-heat-note").textContent = "Corrélation des rendements annuels sur les années communes à chaque paire. 1 : ils montent et baissent ensemble ; proche de 0 : ils se diversifient. Moyenne : " + dec(MODEL.rbar, 2) + ". Avec si peu d’années, ces chiffres sont très incertains.";
    // fiches
    let y0 = Infinity, y1 = -Infinity, maxAbs = 1;
    for (const e of E) for (const yy of yearsOf(e)) { y0 = Math.min(y0, yy); y1 = Math.max(y1, yy); maxAbs = Math.max(maxAbs, Math.abs(e.returns[yy])); }
    const allYears = []; for (let yy = y0; yy <= y1; yy++) allYears.push(yy);
    $("cmp-list").innerHTML = rows.map((r, idx) => {
      const e = r.e, m = r.m, hl = k => S.sort === k ? " class=\"hl\"" : "";
      const lq = quoteOf(e.id);
      const ytd = lq && Number.isFinite(lq.ytd) ? pct(lq.ytd, 1, true) + " au " + esc(frDate(lq.date)) + " (cours)"
        : Number.isFinite(e.ytd) ? pct(e.ytd / 100, 1, true) + (e.ytdDate ? " au " + esc(e.ytdDate) : "") : "—";
      return "<article class=\"etf k" + (r.i % 8) + "\"><div class=\"etf-head\"><span class=\"rank\">" + (idx + 1) + "</span><span class=\"tick\">" + esc(e.id) + "</span><span class=\"zone\">" + esc(e.zone || "") + "</span></div>" +
        "<p class=\"etf-name\">" + esc(e.name || "") + (e.isin ? ", " + esc(e.isin) : "") + "</p><dl class=\"metrics\">" +
        "<div" + hl("cagr") + "><dt>Rendement annualisé " + period(m.years) + "</dt><dd>" + pct(m.cagr, 1, true) + "</dd></div>" +
        "<div" + hl("ratio") + "><dt>Rendement par unité de risque</dt><dd>" + dec(m.ratio, 2) + "</dd></div>" +
        "<div" + hl("vol") + "><dt>Volatilité sur 3 ans</dt><dd>" + pct(m.vol) + "</dd></div>" +
        "<div" + hl("worst") + "><dt>Pire année</dt><dd>" + pct(m.worst, 1, true) + (m.worstYear ? " en " + m.worstYear : "") + "</dd></div>" +
        "<div" + hl("ter") + "><dt>Frais annuels</dt><dd>" + pct(e.ter / 100, 2) + "</dd></div>" +
        "<div" + hl("rho") + "><dt>Corrélation avec " + esc(ref) + "</dt><dd>" + (e.id === ref ? "référence" : dec(m.rho, 2) + (m.nRho ? " sur " + m.nRho + NB + "ans" : "")) + "</dd></div>" +
        "<div><dt>Part tech (IT)</dt><dd>" + (Number.isFinite(e.it) ? pct(e.it / 100) : "—") + "</dd></div>" +
        "<div><dt>Poids des 10 premières lignes</dt><dd>" + (Number.isFinite(e.top10) ? pct(e.top10 / 100) : "—") + "</dd></div>" +
        "<div><dt>Année en cours</dt><dd>" + ytd + "</dd></div></dl>" + spark(e, r.i, allYears, maxAbs) + "</article>";
    }).join("");
  }

  /* =================== Optimiser =================== */
  function buildOptBounds() {
    $("opt-bounds").innerHTML = "<span></span><span class=\"h\">Minimum</span><span class=\"h\">Maximum</span>" + DATA.etfs.map((e, i) =>
      "<span class=\"tick k" + (i % 8) + "\">" + esc(e.id) + "</span>" +
      "<input type=\"number\" inputmode=\"decimal\" min=\"0\" max=\"100\" step=\"5\" placeholder=\"0\" data-bind=\"opt.min." + esc(e.id) + "\" data-nullable=\"1\" aria-label=\"Part minimale de " + esc(e.id) + "\">" +
      "<input type=\"number\" inputmode=\"decimal\" min=\"0\" max=\"100\" step=\"5\" placeholder=\"100\" data-bind=\"opt.max." + esc(e.id) + "\" data-nullable=\"1\" aria-label=\"Part maximale de " + esc(e.id) + "\">").join("");
    syncBindings($("opt-bounds"));
  }
  function fillOptTarget() {
    $("opt-target").innerHTML = S.scenarios.map(sc => "<option value=\"" + sc.id + "\">" + esc(sc.name) + "</option>").join("");
    $("opt-target").value = S.opt.target;
  }
  function runOpt() { if (!MODEL) return; if (!OPT) OPT = optimize(MODEL, S); renderOpt(); }
  function tickDec(t) { const st = t.length > 1 ? Math.abs(t[1] - t[0]) : 0.01; return st < 0.001 ? 2 : st < 0.01 ? 1 : 0; }
  function renderOpt() {
    const box = $("opt-chart"), warn = $("opt-warn"), E = DATA.etfs;
    const rm = { same: "rendement médian identique pour tous (" + pct(S.gSame, 1) + ", frais déduits)", histCommon: "rendements historiques sur les années communes", histMax: "rendements historiques complets", custom: "rendements saisis" }[S.retMode];
    $("opt-note").textContent = "Chaque point est une allocation de la grille (pas de " + pct(S.opt.step, S.opt.step < 0.05 ? 1 : 0) + "), évaluée avec les hypothèses paramétriques : " + rm + ". Le trait relie les allocations au meilleur rendement pour chaque niveau de risque. Rendement médian estimé pour un portefeuille rééquilibré chaque année.";
    if (!OPT || OPT.error) { warn.hidden = false; warn.textContent = OPT ? OPT.error : ""; box.innerHTML = ""; $("opt-results").innerHTML = ""; $("opt-legend").innerHTML = ""; return; }
    warn.hidden = true;
    const W = chartW(box), Hh = W < 560 ? 300 : 380, pl = 44, pr = 18, pt = 14, pb = 34;
    const scPts = S.scenarios.map((sc, si) => { const w = scenarioWeights(sc, E).w; return w ? Object.assign({ name: sc.name, si }, portfolioPoint(OPT.cov, OPT.m, w)) : null; }).filter(Boolean);
    const allX = Array.from(OPT.cloudV).concat(OPT.etfs.map(p => p.vol), scPts.map(p => p.vol));
    const allY = Array.from(OPT.cloudM).concat(OPT.etfs.map(p => p.med), scPts.map(p => p.med));
    const xt = niceTicks(Math.max(0, amin(allX) * 0.9), amax(allX) * 1.05, 4), ylo = amin(allY), yhi = amax(allY), pad = Math.max(0.002, (yhi - ylo) * 0.08);
    const yt = niceTicks(ylo - pad, yhi + pad, 4);
    const x = v => pl + (W - pl - pr) * (v - xt.lo) / (xt.hi - xt.lo), y = v => pt + (Hh - pt - pb) * (1 - (v - yt.lo) / (yt.hi - yt.lo));
    let s = "";
    yt.t.forEach(v => { s += "<line class=\"grid\" x1=\"" + pl + "\" x2=\"" + (W - pr) + "\" y1=\"" + y(v).toFixed(1) + "\" y2=\"" + y(v).toFixed(1) + "\"/><text class=\"ylab\" x=\"" + (pl - 6) + "\" y=\"" + (y(v) + 4).toFixed(1) + "\" text-anchor=\"end\">" + pct(v, tickDec(yt.t)) + "</text>"; });
    xt.t.forEach(v => { s += "<text class=\"xlab\" x=\"" + x(v).toFixed(1) + "\" y=\"" + (Hh - 16) + "\" text-anchor=\"middle\">" + pct(v, 0) + "</text>"; });
    s += "<text class=\"xlab\" x=\"" + (W - pr) + "\" y=\"" + (Hh - 2) + "\" text-anchor=\"end\">Volatilité annuelle estimée</text>";
    let cp = ""; for (let i = 0; i < OPT.cloudV.length; i++) cp += "M" + x(OPT.cloudV[i]).toFixed(1) + "," + y(OPT.cloudM[i]).toFixed(1) + "l0,0";
    s += "<path class=\"cloud\" d=\"" + cp + "\"/>";
    if (OPT.frontier.length > 1) s += "<path class=\"front\" d=\"M" + OPT.frontier.map(p => x(p.vol).toFixed(1) + "," + y(p.med).toFixed(1)).join(" L") + "\"/>";
    const labs = [];
    OPT.etfs.forEach((p, i) => { s += "<circle class=\"pt-k k" + (i % 8) + "\" cx=\"" + x(p.vol).toFixed(1) + "\" cy=\"" + y(p.med).toFixed(1) + "\" r=\"5\"/>"; labs.push({ x: x(p.vol), y: y(p.med), t: E[i].id, c: "lab k k" + (i % 8) }); });
    const BEST = [["minVar", "Variance min."], ["maxRatio", "Meilleur ratio"], ["target", "Cible"]];
    BEST.forEach(([k, l]) => { const b = OPT.best[k]; if (!b) return; const bx = x(b.vol), by = y(b.med); s += "<rect class=\"pt-best\" x=\"" + (bx - 5).toFixed(1) + "\" y=\"" + (by - 5).toFixed(1) + "\" width=\"10\" height=\"10\" transform=\"rotate(45 " + bx.toFixed(1) + " " + by.toFixed(1) + ")\"/>"; labs.push({ x: bx, y: by, t: l, c: "lab" }); });
    scPts.forEach(p => { s += "<circle class=\"pt-sc c" + p.si + "\" cx=\"" + x(p.vol).toFixed(1) + "\" cy=\"" + y(p.med).toFixed(1) + "\" r=\"6.5\"/>"; labs.push({ x: x(p.vol), y: y(p.med), t: p.name.slice(0, 14), c: "lab sc c" + p.si }); });
    labs.sort((a, b) => a.y - b.y);
    const placed = [];
    labs.forEach(l => {
      let ly = l.y - 9, right = l.x < W - pr - 80;
      for (let k = 0; k < 6; k++) { if (placed.some(p => Math.abs(p.y - ly) < 13 && Math.abs(p.x - l.x) < 70)) ly += 13; else break; }
      placed.push({ x: l.x, y: ly });
      s += "<text class=\"" + l.c + "\" x=\"" + (right ? l.x + 8 : l.x - 8).toFixed(1) + "\" y=\"" + ly.toFixed(1) + "\" text-anchor=\"" + (right ? "start" : "end") + "\">" + esc(l.t) + "</text>";
    });
    box.innerHTML = "<svg viewBox=\"0 0 " + W + " " + Hh + "\" width=\"" + W + "\" height=\"" + Hh + "\" role=\"img\" aria-label=\"Allocations possibles selon le rendement et le risque\">" + s + "</svg>";
    $("opt-legend").innerHTML = "<li><i class=\"o\" style=\"--sc:var(--muted)\"></i>" + nf0.format(OPT.count) + " allocations testées</li><li><i></i>Meilleur rendement par niveau de risque</li><li><i class=\"k\" style=\"--k:var(--muted)\"></i>ETF seul</li><li>Losanges : optimums ; ronds colorés : tes scénarios</li>";
    const cols = BEST.filter(([k]) => OPT.best[k]);
    let t = "<table class=\"opt\"><thead><tr><th></th>" + cols.map(([k, l]) => "<th scope=\"col\">" + (k === "target" ? "Meilleur rendement, volatilité ≤ " + pct(S.opt.targetVol, 0) : k === "minVar" ? "Volatilité minimale" : "Meilleur rendement par unité de risque") + "</th>").join("") + "</tr></thead><tbody>";
    E.forEach((e, i) => { t += "<tr><td><span class=\"tick k" + (i % 8) + "\">" + esc(e.id) + "</span></td>" + cols.map(([k]) => "<td>" + Math.round(OPT.best[k].w[i] * 1000) / 10 + NB + "%</td>").join("") + "</tr>"; });
    t += "<tr><td>Rendement médian estimé</td>" + cols.map(([k]) => "<td>" + pct(OPT.best[k].med, 1) + "</td>").join("") + "</tr>";
    t += "<tr><td>Volatilité estimée</td>" + cols.map(([k]) => "<td>" + pct(OPT.best[k].vol, 1) + "</td>").join("") + "</tr>";
    t += "<tr><td></td>" + cols.map(([k]) => "<td><button class=\"btn ghost small\" type=\"button\" data-apply=\"" + k + "\">Appliquer</button></td>").join("") + "</tr></tbody></table>";
    if (!OPT.best.target) t += "<p class=\"warn\">Aucune allocation sous " + pct(S.opt.targetVol, 0) + " de volatilité avec ces bornes.</p>";
    t += "<p class=\"note\" id=\"opt-msg\" role=\"status\">" + esc(optMsg) + "</p>";
    $("opt-results").innerHTML = t;
  }
  function applyOpt(k) {
    if (!OPT || !OPT.best[k]) return;
    const sc = scById(S.opt.target); if (!sc) return;
    const r = roundTo100(OPT.best[k].w.map(v => v * 100)), w = {};
    DATA.etfs.forEach((e, i) => { if (r[i] > 0) w[e.id] = r[i]; });
    sc.weights = w; S.focus = sc.id;
    optMsg = "Allocation appliquée à « " + sc.name + " ». Ouvre « Simuler » pour voir le résultat.";
    saveSoon(); buildScenarioEditors(); queueCompute();
    const m = $("opt-msg"); if (m) m.textContent = optMsg;
  }

  /* =================== Données =================== */
  function draftFrom(D) { const d = clone(D); d.etfs.forEach(e => { e._orig = e.id; }); return d; }
  function fld(label, key, val, type, wide) {
    return "<label class=\"field\"" + (wide ? " style=\"grid-column:1/-1\"" : "") + "><span>" + label + "</span><input type=\"" + type + "\"" + (type === "number" ? " inputmode=\"decimal\" step=\"any\"" : "") + " data-k=\"" + key + "\" value=\"" + (val == null || (typeof val === "number" && !Number.isFinite(val)) ? "" : esc(val)) + "\"></label>";
  }
  function renderEditor() {
    if (!DRAFT) DRAFT = draftFrom(DATA);
    $("ed-list").innerHTML = DRAFT.etfs.map((e, i) => {
      const ys = Object.keys(e.returns || {}).filter(k => /^\d{4}$/.test(k)).sort();
      return "<details class=\"ed k" + (i % 8) + "\" data-i=\"" + i + "\"" + (e._open ? " open" : "") + "><summary><span class=\"tick\" data-tk>" + esc(e.id || "?") + "</span>" + esc(e.name || "") + "</summary>" +
        "<div class=\"ed-grid\">" + fld("Code (1 à 16 caractères)", "id", e.id, "text") + fld("ISIN", "isin", e.isin, "text") + fld("Nom", "name", e.name, "text", true) + fld("Zone", "zone", e.zone, "text") +
        fld("Frais annuels (%)", "ter", e.ter, "number") + fld("Volatilité sur 3 ans (%)", "vol3y", e.vol3y, "number") + fld("Part tech IT (%)", "it", e.it, "number") +
        fld("Poids du top 10 (%)", "top10", e.top10, "number") + fld("Année en cours (%)", "ytd", e.ytd, "number") + fld("Date de l’année en cours", "ytdDate", e.ytdDate, "text") + fld("Source", "source", e.source, "text", true) + "</div>" +
        "<h3>Rendements annuels (%)</h3><div class=\"yrs\">" + ys.map(y => "<div class=\"yr\"><b>" + y + "</b><input type=\"number\" inputmode=\"decimal\" step=\"any\" data-y=\"" + y + "\" value=\"" + (Number.isFinite(e.returns[y]) ? e.returns[y] : "") + "\" aria-label=\"Rendement " + y + "\"><button type=\"button\" class=\"x\" data-act=\"dely\" data-y=\"" + y + "\" aria-label=\"Supprimer " + y + "\">×</button></div>").join("") + "</div>" +
        "<div class=\"yr-add\"><input type=\"number\" inputmode=\"numeric\" min=\"1950\" max=\"2100\" placeholder=\"Année\" data-newy aria-label=\"Année à ajouter\"><button type=\"button\" class=\"btn ghost small\" data-act=\"addy\">Ajouter l’année</button></div>" +
        "<button type=\"button\" class=\"btn danger small\" data-act=\"dele\"" + (DRAFT.etfs.length <= 1 ? " disabled" : "") + ">Supprimer cet ETF</button><p></p></details>";
    }).join("");
  }
  function wireEditor() {
    const box = $("ed-list");
    box.addEventListener("toggle", ev => { const d = ev.target.closest && ev.target.closest("details.ed"); if (d && DRAFT) DRAFT.etfs[+d.dataset.i]._open = d.open; }, true);
    box.addEventListener("input", ev => {
      const el = ev.target, d = el.closest("details.ed"); if (!d || !DRAFT) return;
      const e = DRAFT.etfs[+d.dataset.i];
      if (el.dataset.k) {
        const k = el.dataset.k;
        if (["ter", "vol3y", "it", "top10", "ytd"].indexOf(k) >= 0) { const v = Number(String(el.value).replace(",", ".")); e[k] = el.value === "" || !Number.isFinite(v) ? null : v; }
        else e[k] = el.value;
        if (k === "id") d.querySelector("[data-tk]").textContent = el.value || "?";
      } else if (el.dataset.y) { const v = Number(String(el.value).replace(",", ".")); e.returns[el.dataset.y] = el.value === "" || !Number.isFinite(v) ? null : v; }
      $("ed-msg").textContent = "Modifications non enregistrées.";
    });
    box.addEventListener("click", ev => {
      const b = ev.target.closest("[data-act]"); if (!b || !DRAFT) return;
      const d = b.closest("details.ed"), e = DRAFT.etfs[+d.dataset.i];
      if (b.dataset.act === "dely") { delete e.returns[b.dataset.y]; e._open = true; renderEditor(); $("ed-msg").textContent = "Année supprimée, à enregistrer."; }
      else if (b.dataset.act === "addy") {
        const y = Math.round(Number(d.querySelector("[data-newy]").value));
        if (!(y >= 1950 && y <= 2100)) { $("ed-msg").textContent = "Saisis une année entre 1950 et 2100."; return; }
        if (e.returns[String(y)] !== undefined) { $("ed-msg").textContent = "L’année " + y + " existe déjà."; return; }
        e.returns[String(y)] = null; e._open = true; renderEditor(); $("ed-msg").textContent = "Année " + y + " ajoutée : saisis son rendement puis enregistre.";
      } else if (b.dataset.act === "dele" && DRAFT.etfs.length > 1) { DRAFT.etfs.splice(+d.dataset.i, 1); renderEditor(); $("ed-msg").textContent = "ETF retiré, à enregistrer."; }
    });
    $("ed-add").addEventListener("click", () => {
      if (!DRAFT) DRAFT = draftFrom(DATA);
      if (DRAFT.etfs.length >= 8) { $("ed-msg").textContent = "8 ETF au maximum."; return; }
      let n = 1; while (DRAFT.etfs.some(e => e.id === "NOUVEAU" + n)) n++;
      DRAFT.etfs.push({ id: "NOUVEAU" + n, name: "Nouvel ETF", isin: "", zone: "", ter: 0.2, vol3y: 15, it: null, top10: null, returns: {}, ytd: null, ytdDate: "", source: "", _orig: null, _open: true });
      renderEditor(); $("ed-msg").textContent = "Renseigne au moins deux années de rendement, puis enregistre.";
    });
    $("ed-cancel").addEventListener("click", () => { DRAFT = null; renderEditor(); $("ed-msg").textContent = "Modifications annulées."; });
    $("ed-save").addEventListener("click", () => {
      if (!DRAFT) { $("ed-msg").textContent = "Rien à enregistrer."; return; }
      const clean = { version: 1, asOf: DATA.asOf || "", etfs: DRAFT.etfs.map(e => {
        const o = { id: String(e.id || "").trim(), name: e.name || "", isin: e.isin || "", zone: e.zone || "", ter: e.ter, vol3y: e.vol3y, returns: {} };
        ["it", "top10", "aum", "ytd"].forEach(k => { if (Number.isFinite(e[k])) o[k] = e[k]; });
        if (e.ytdDate) o.ytdDate = e.ytdDate; if (e.source) o.source = e.source;
        for (const [y, r] of Object.entries(e.returns || {})) { if (r === null || r === "") return Object.assign(o, { _bad: y }); o.returns[y] = r; }
        return o;
      }) };
      const bad = clean.etfs.find(e => e._bad);
      if (bad) { $("ed-msg").textContent = bad.id + NB + ": le rendement de " + bad._bad + " est vide."; return; }
      const err = validateData(clean);
      if (err) { $("ed-msg").textContent = err; return; }
      const ren = {}; DRAFT.etfs.forEach((e, i) => { if (e._orig && e._orig !== clean.etfs[i].id) ren[e._orig] = clean.etfs[i].id; });
      const mv = o => { const r = {}; Object.keys(o || {}).forEach(k => { r[ren[k] || k] = o[k]; }); return r; };
      S.holdings = mv(S.holdings); S.gCustom = mv(S.gCustom); S.volCustom = mv(S.volCustom); S.opt.min = mv(S.opt.min); S.opt.max = mv(S.opt.max);
      S.scenarios.forEach(sc => { sc.weights = mv(sc.weights); });
      DATA = clean; lsSet(LS_DATA, JSON.stringify(clean)); DRAFT = null;
      afterDataChange(); $("ed-msg").textContent = "Modifications enregistrées sur cet appareil.";
    });
  }
  function renderDataTab() {
    renderEditor();
    $("data-table").innerHTML = "<thead><tr><th>ETF</th><th>Années</th><th>Frais</th><th>Volatilité 3 ans</th><th>Source</th></tr></thead><tbody>" +
      DATA.etfs.map((e, i) => "<tr class=\"k" + (i % 8) + "\"><td><span class=\"tk\">" + esc(e.id) + "</span><br>" + esc(e.name || "") + "</td><td>" + period(yearsOf(e)) + "</td><td>" + pct(e.ter / 100, 2) + "</td><td>" + pct(e.vol3y / 100) + "</td><td>" + esc(e.source || "") + "</td></tr>").join("") + "</tbody>";
    $("json").value = JSON.stringify(DATA, null, 2);
    $("json-msg").textContent = lsGet(LS_DATA) !== null ? "Données personnalisées actives, enregistrées sur cet appareil." : "Données d’origine.";
  }
  function afterDataChange() {
    S = sanitizeState(S); saveSoon();
    buildHoldings(); buildScenarioEditors(); buildOptBounds(); fillOptTarget();
    $("settings").dataset.built = "";
    OPT = null; recompute();
    if (S.tab === "data") renderDataTab();
    if (S.tab === "settings") renderSettings();
  }
  function wireJson() {
    $("json-apply").addEventListener("click", () => {
      let d; try { d = JSON.parse($("json").value); } catch (e) { $("json-msg").textContent = "JSON illisible : " + e.message + ". Vérifie les virgules et les guillemets."; return; }
      const err = validateData(d); if (err) { $("json-msg").textContent = err; return; }
      DATA = d; DRAFT = null; lsSet(LS_DATA, JSON.stringify(d)); afterDataChange(); $("json-msg").textContent = "JSON appliqué et enregistré sur cet appareil.";
    });
    $("json-copy").addEventListener("click", () => copyText($("json"), $("json-msg")));
    $("json-reset").addEventListener("click", () => { lsDel(LS_DATA); DATA = clone(DEFAULT_DATA); DRAFT = null; afterDataChange(); $("json-msg").textContent = "Données d’origine rétablies."; });
  }

  /* =================== Réglages =================== */
  const CONDS = {
    boot: () => S.mode === "boot", param: () => S.mode === "param", same: () => S.retMode === "same", gcustom: () => S.retMode === "custom",
    vcustom: () => S.volMode === "custom", matrix: () => S.corrMode === "matrix", uniform: () => S.corrMode === "uniform", pea: () => S.taxMode === "pea",
    tax: () => S.taxMode !== "none", real: () => S.real, lump: () => S.lumpAmount > 0, wd: () => S.wdMonthly > 0
  };
  function settingsSpec() {
    const E = DATA.etfs, yrs = Array.from(new Set([].concat(...E.map(yearsOf)))).sort((a, b) => a - b);
    const yOpts = [["", "Sans limite"]].concat(yrs.map(y => [y, String(y)]));
    const cy = commonYears(E);
    return [
      { title: "Projection", items: [
        { k: "mode", t: "select", l: "Modèle", o: [["boot", "Années réelles tirées au hasard"], ["param", "Paramétrique (log-normal)"]] },
        { k: "step", t: "select", l: "Pas de temps", o: [["month", "Mensuel"], ["year", "Annuel"]], c: "param", h: "Le pas mensuel fait apparaître les baisses en cours d’année." },
        { k: "block", t: "select", num: 1, l: "Années consécutives tirées ensemble", o: [[1, "1"], [2, "2"], [3, "3"]], c: "boot", h: "Des blocs de 2 ou 3 ans gardent l’enchaînement des années réelles." },
        { k: "winFrom", t: "select", num: 1, nul: 1, l: "Années tirées : à partir de", o: yOpts, c: "boot" },
        { k: "winTo", t: "select", num: 1, nul: 1, l: "Années tirées : jusqu’à", o: yOpts, c: "boot", h: "Seules les années communes aux ETF utilisés comptent." },
        { k: "nPaths", t: "select", num: 1, l: "Nombre de scénarios", o: [[500, "500"], [1000, "1 000"], [2000, "2 000"], [5000, "5 000"], [10000, "10 000"]], h: "Plus de scénarios : résultats plus stables, calcul plus long." },
        { t: "seed" },
        { k: "qLow", t: "select", num: 1, l: "Scénario défavorable", o: [[0.05, "P5 (1 cas sur 20)"], [0.1, "P10 (1 cas sur 10)"], [0.25, "P25 (1 cas sur 4)"]] },
        { k: "qHigh", t: "select", num: 1, l: "Scénario favorable", o: [[0.75, "P75"], [0.9, "P90"], [0.95, "P95"]] },
        { k: "badYear", t: "number", sc: 100, st: 1, l: "Seuil d’une mauvaise année (%)" }
      ] },
      { title: "Rendements attendus", items: [
        { k: "retMode", t: "select", l: "Hypothèse", o: [["same", "Le même pour tous, frais déduits"], ["histCommon", "Historique sur les années communes"], ["histMax", "Historique complet de chaque ETF"], ["custom", "Saisie par ETF"]], h: "Sert au mode paramétrique et à l’optimiseur." },
        { k: "gSame", t: "number", sc: 100, st: 0.1, l: "Rendement médian commun (% par an)", c: "same", h: (cy.length >= 2 ? "Moyenne " + period(cy) + " des ETF : " + pct(defaultGrowth(E), 1) + ". " : "") + "Une valeur plus basse est plus prudente." },
        { t: "etf", map: "gCustom", sc: 100, l: "Rendement médian par ETF (% par an, net de frais). Vide : historique complet.", c: "gcustom", ph: e => dec(cagr(series(e, yearsOf(e))) * 100, 1) }
      ] },
      { title: "Risque", items: [
        { k: "volMode", t: "select", l: "Volatilité", o: [["factsheet", "Sur 3 ans (reportings)"], ["annual", "Écart-type des rendements annuels"], ["custom", "Saisie par ETF"]] },
        { t: "etf", map: "volCustom", sc: 100, l: "Volatilité par ETF (%). Vide : celle des reportings.", c: "vcustom", ph: e => dec(e.vol3y, 1) },
        { k: "corrMode", t: "select", l: "Corrélations", o: [["matrix", "Estimées par paire"], ["uniform", "Identiques pour toutes les paires"]] },
        { k: "shrink", t: "number", sc: 100, st: 5, l: "Rapprochement vers la moyenne (%)", c: "matrix", h: "0 % : estimations brutes ; 100 % : toutes égales à la moyenne. Utile avec peu d’années." },
        { k: "rho", t: "number", st: 0.05, l: "Corrélation commune (0 à 0,95)", c: "uniform" },
        { k: "tailDf", t: "select", num: 1, l: "Krachs extrêmes (queues épaisses)", c: "param", o: [[0, "Non : loi normale"], [15, "Légers"], [8, "Modérés"], [5, "Marqués"], [4, "Forts"], [3, "Très forts"]], h: "Loi de Student : même volatilité, mais des chutes de −30 % ou −40 % plus fréquentes qu’avec la loi normale." }
      ] },
      { title: "Affichage", items: [
        { k: "real", t: "check", l: "Afficher en euros d’aujourd’hui", h: "Corrige les montants de l’inflation ci-dessous." },
        { k: "inflation", t: "number", sc: 100, st: 0.1, l: "Inflation annuelle (%)", c: "real", h: "2 % par défaut, la cible de la BCE." },
        { k: "quotesUrl", t: "text", l: "Adresse des cours en ligne", ph: "https://raw.githubusercontent.com/…/main/data/cours.json", h: "Pour la version ouverte depuis ton ordinateur : le fichier cours.json tenu à jour par GitHub. La version publiée sur GitHub Pages le trouve toute seule." },
        { k: "theme", t: "select", l: "Thème", o: [["auto", "Comme l’appareil"], ["light", "Clair"], ["dark", "Sombre"]] }
      ] },
      { title: "Versement ponctuel et retraits", items: [
        { k: "lumpAmount", t: "number", st: 1000, l: "Versement ponctuel (€)", h: "Prime, héritage, épargne placée d’un coup. 0 : aucun." },
        { k: "lumpYear", t: "number", st: 1, l: "Année du versement ponctuel (1 = dans les 12 mois)", c: "lump" },
        { k: "wdMonthly", t: "number", st: 100, l: "Retrait mensuel (€)", h: "Rente tirée du PEA. Les versements mensuels s’arrêtent quand les retraits commencent. 0 : aucun." },
        { k: "wdFrom", t: "number", st: 1, l: "Retraits à partir de l’année", c: "wd", h: "Avec un horizon plus court, aucun retrait n’est simulé." },
        { k: "wdIndex", t: "check", l: "Indexer les retraits sur l’inflation", c: "wd" }
      ] },
      { title: "Fiscalité et frais", items: [
        { k: "platFee", t: "number", sc: 100, st: 0.05, l: "Frais annuels de l’enveloppe (% de l’encours)", h: "Droits de garde, frais de gestion d’un PEA assurance ou d’un mandat. 0 chez la plupart des courtiers en ligne." },
        { k: "taxMode", t: "select", l: "Enveloppe", o: [["pea", "PEA"], ["cto", "Compte-titres"], ["none", "Ignorer l’impôt"]], h: "Impôt calculé comme si tout était retiré à l’horizon." },
        { k: "peaOpen", t: "number", st: 1, l: "Année d’ouverture du PEA", c: "pea", h: "À 5 ans et plus, seuls les prélèvements sociaux s’appliquent." },
        { k: "psRate", t: "number", sc: 100, st: 0.1, l: "Prélèvements sociaux (%)", c: "tax", h: "18,6 % depuis le 1er janvier 2026." },
        { k: "pfuRate", t: "number", sc: 100, st: 0.1, l: "Flat tax : PEA de moins de 5 ans ou compte-titres (%)", c: "tax", h: "31,4 % en 2026 : 12,8 % d’impôt et 18,6 % de prélèvements sociaux." },
        { k: "orderFee", t: "number", st: 0.5, l: "Frais par ordre d’arbitrage (€)", h: "Les versements programmés sont supposés gratuits." },
        { k: "cap", t: "number", st: 1000, l: "Plafond de versements (€)", h: "150 000 € pour un PEA classique." },
        { k: "stopAtCap", t: "check", l: "Arrêter les versements au plafond" }
      ] }
    ];
  }
  function itemHtml(it) {
    const cond = it.c ? " data-cond=\"" + it.c + "\"" : "", help = it.h ? "<small class=\"note\">" + esc(it.h) + "</small>" : "";
    if (it.t === "select") return "<label class=\"field\"" + cond + "><span>" + esc(it.l) + "</span><select data-bind=\"" + it.k + "\"" + (it.num ? " data-num=\"1\"" : "") + (it.nul ? " data-nullable=\"1\"" : "") + ">" + it.o.map(o => "<option value=\"" + o[0] + "\">" + esc(o[1]) + "</option>").join("") + "</select>" + help + "</label>";
    if (it.t === "number") return "<label class=\"field\"" + cond + "><span>" + esc(it.l) + "</span><input type=\"number\" inputmode=\"decimal\" step=\"" + (it.st || "any") + "\" data-bind=\"" + it.k + "\"" + (it.sc ? " data-scale=\"" + it.sc + "\"" : "") + ">" + help + "</label>";
    if (it.t === "text") return "<label class=\"field\"" + cond + "><span>" + esc(it.l) + "</span><input type=\"url\" inputmode=\"url\" spellcheck=\"false\" autocapitalize=\"off\" data-text=\"1\" data-bind=\"" + it.k + "\" placeholder=\"" + esc(it.ph || "") + "\">" + help + "</label>";
    if (it.t === "check") return "<label class=\"switch\"" + cond + "><input type=\"checkbox\" data-bind=\"" + it.k + "\"><span>" + esc(it.l) + (it.h ? "<small>" + esc(it.h) + "</small>" : "") + "</span></label>";
    if (it.t === "seed") return "<div class=\"field\"><span class=\"note\" style=\"margin:0\">Graine du tirage</span><div class=\"yr-add\" style=\"margin:0\"><input type=\"number\" step=\"1\" data-bind=\"seed\" aria-label=\"Graine du tirage\"><button type=\"button\" class=\"btn ghost small\" id=\"reseed\">Nouveau tirage</button></div><small class=\"note\">Même graine, mêmes résultats. Change-la pour vérifier la stabilité.</small></div>";
    if (it.t === "etf") return "<div" + cond + "><p class=\"note\">" + esc(it.l) + "</p><div class=\"etf-tbl\">" + DATA.etfs.map((e, i) => "<span class=\"tick k" + (i % 8) + "\">" + esc(e.id) + "</span><input type=\"number\" inputmode=\"decimal\" step=\"0.1\" data-bind=\"" + it.map + "." + esc(e.id) + "\" data-scale=\"" + it.sc + "\" data-nullable=\"1\" placeholder=\"" + esc(it.ph(e, i)) + "\" aria-label=\"" + esc(e.id) + "\">").join("") + "</div></div>";
    return "";
  }
  function renderSettings() {
    const box = $("settings");
    if (!box.dataset.built) { box.innerHTML = settingsSpec().map(g => "<fieldset><legend>" + esc(g.title) + "</legend>" + g.items.map(itemHtml).join("") + "</fieldset>").join(""); box.dataset.built = "1"; }
    syncBindings($("p-settings")); updateSettingsVisibility();
  }
  function updateSettingsVisibility() { qsa("[data-cond]").forEach(el => { const f = CONDS[el.dataset.cond]; el.hidden = f ? !f() : false; }); }
  function wireSettingsAndSave() {
    $("p-settings").addEventListener("click", ev => {
      if (ev.target.id === "reseed") { S.seed = 1 + Math.floor(Math.random() * 4294967294); S = sanitizeState(S); syncBindings($("p-settings")); afterChange("seed"); }
    });
    $("cfg-export").addEventListener("click", () => saveFile("simulateur-etf-pea-config.json", JSON.stringify({ app: "simulateur-etf-pea", version: 2, exported: new Date().toISOString(), state: S, data: DATA }, null, 2), "Configuration"));
    $("cfg-import").addEventListener("click", () => {
      const msg = $("cfg-msg"); let o;
      try { o = JSON.parse($("cfg-text").value); } catch (e) { msg.textContent = "JSON illisible : " + e.message + "."; return; }
      if (!o || typeof o !== "object") { msg.textContent = "Configuration vide."; return; }
      if (o.data) { const err = validateData(o.data); if (err) { msg.textContent = "Données refusées : " + err; return; } DATA = o.data; lsSet(LS_DATA, JSON.stringify(DATA)); }
      S = sanitizeState(o.state || o); S.tab = "settings"; saveSoon(); applyTheme(); DRAFT = null; afterDataChange(); syncBindings(document);
      msg.textContent = "Configuration importée.";
    });
    let armed = null;
    $("cfg-reset").addEventListener("click", ev => {
      const b = ev.currentTarget;
      if (!armed) { b.textContent = "Confirmer la réinitialisation"; armed = setTimeout(() => { armed = null; b.textContent = "Tout réinitialiser"; }, 5000); return; }
      clearTimeout(armed); armed = null; b.textContent = "Tout réinitialiser";
      lsDel(LS_STATE); lsDel(LS_DATA); lsDel(LS_V1);
      DATA = clone(DEFAULT_DATA); S = sanitizeState(defaultState()); S.tab = "settings"; DRAFT = null;
      applyTheme(); afterDataChange(); syncBindings(document); $("cfg-msg").textContent = "Application réinitialisée.";
    });
  }

  /* =================== démarrage =================== */
  async function initDownloads() {
    try { if (window.claude && typeof window.claude.use === "function") DOWNLOADS = await window.claude.use("downloads"); } catch (e) { DOWNLOADS = null; }
  }
  function init() {
    applyTheme();
    fillSortOptions(); buildHoldings(); buildScenarioEditors(); buildOptBounds(); fillOptTarget();
    syncBindings(document); updateSettingsVisibility(); syncStatic();
    document.addEventListener("input", ev => { if (ev.target.matches && ev.target.matches("[data-bind]")) onBound(ev); });
    document.addEventListener("change", ev => { if (ev.target.matches && ev.target.matches("[data-bind]")) onBound(ev); });
    document.addEventListener("click", ev => {
      const b = ev.target.closest && ev.target.closest("[data-set]");
      if (b) { setPath(S, b.dataset.set, b.dataset.val); S = sanitizeState(S); syncBindings(document); afterChange(b.dataset.set); return; }
      const g = ev.target.closest && ev.target.closest("[data-goto]");
      if (g) { setTab(g.dataset.goto); window.scrollTo(0, 0); return; }
      const ap = ev.target.closest && ev.target.closest("[data-apply]");
      if (ap) applyOpt(ap.dataset.apply);
    });
    const tabs = document.querySelector(".tabs");
    tabs.addEventListener("click", ev => { const b = ev.target.closest("button[data-tab]"); if (b) setTab(b.dataset.tab); });
    tabs.addEventListener("keydown", ev => {
      if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
      const i = TABS.indexOf(S.tab), j = (i + (ev.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
      setTab(TABS[j]); const nb = tabs.querySelector("[data-tab=\"" + TABS[j] + "\"]"); if (nb) nb.focus();
    });
    wireScenarioEditors(); wireEditor(); wireJson(); wireSettingsAndSave();
    const fan = $("fan");
    fan.addEventListener("pointermove", fanPointer); fan.addEventListener("pointerdown", fanPointer); fan.addEventListener("pointerleave", fanLeave);
    $("goal-solve").addEventListener("click", solveGoal);
    $("exp-csv").addEventListener("click", () => { if (SIM) saveFile("simulation-etf-pea.csv", buildCsv(), "Résultats CSV"); });
    $("sheet-close").addEventListener("click", closeSheet);
    $("sheet-copy").addEventListener("click", () => copyText($("sheet-text"), $("sheet-note")));
    document.addEventListener("keydown", ev => { if (ev.key === "Escape" && !$("sheet").hidden) closeSheet(); });
    recompute();
    setTab(S.tab);
    updateHdr();
    window.addEventListener("resize", debounce(() => { updateHdr(); if (S.tab === "sim") renderSimCharts(); if (S.tab === "compare") renderCompare(); if (S.tab === "opt") renderOpt(); }, 150));
    setTimeout(initDownloads, 0);
    setTimeout(loadQuotes, 0);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
