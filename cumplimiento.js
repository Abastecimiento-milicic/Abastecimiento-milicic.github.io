/* ============================
   CONFIG
============================ */
const CSV_CANDIDATES = ["CUMPLIMIENTO_2025.csv","CUMPLIMIENTO.csv","cumplimiento.csv","CUMPLIMIENTO 2025.csv"];
const DELIM = ";";

const FECHA_CANDIDATES = ["FECHA ENTREGA ESPERADA","FECHA ENTREGA","MES ENTREGA","MES DE ENTREGA","FECHA OC","FECHA ENTREGA OC"];
let FECHA_COL = "FECHA ENTREGA ESPERADA";
const CLIENT_CANDIDATES = ["CLIENTE / OBRA", "CLIENTE NRO.", "CLIENTE"];

// NUEVOS FILTROS
const CLASIF2_CANDIDATES = ["CLASIFICACION 2", "CLASIFICACIÓN 2", "CLASIFICACION2", "CLASIFICACION_2"];
const GCOC_CANDIDATES = ["GC OC", "GC_OC", "GCOC"];

const AT_COL = "ENTREGADOS AT";
const FT_COL = "ENTREGADOS FT";
const NO_COL = "NO ENTREGADOS";

/* ============================
   COLORES (match KPIs)
============================ */
const COLORS = {
  blue:  "#1d4ed8",
  green: "#16a34a",
  amber: "#f59e0b",
  red:   "#ef4444",
  grid:  "rgba(15, 23, 42, 0.10)",
  text:  "#0b1220",
  muted: "#526172",
};

/* ============================
   GLOBAL
============================ */
let data = [];
let headers = [];

let CLIENT_COL = null;
let CLASIF2_COL = null;
let GCOC_COL = null;

let chartMes = null;
let chartTendencia = null;

const multiState = {
  clienteSelect: new Set(),
  clasif2Select: new Set(),
  gcocSelect: new Set(),
};


/* ============================
   HELPERS
============================ */
const clean = (v) => (v ?? "").toString().trim();

function norm(s){
  return clean(s)
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

let headers = []; // se carga al leer el CSV
function findHeaderByCandidates(cands){
  const hNorm = headers.map(norm);
  for (const c of cands){
    const idx = hNorm.indexOf(norm(c));
    if (idx >= 0) return headers[idx];
  }
  return null;
}


function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt ?? "";
}

function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html ?? "";
}

function toNumber(v) {
  let x = clean(v);
  if (!x) return 0;
  x = x.replace(/\s/g, "");
  // soporte 1.234,56 y 1234,56 y 1234.56
  if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtPct01(x) {
  if (!isFinite(x)) return "-";
  return (x * 100).toFixed(1).replace(".", ",") + "%";
}

function safeFilePart(s) {
  return clean(s).replace(/[^\w\-]+/g, "_").slice(0, 80) || "Todos";
}

function showError(msg) {
  setHTML("msg", `<div class="error">${msg}</div>`);
}

/* ============================
   DATE PARSING
   dd/mm/yyyy | dd-mm-yyyy | yyyy-mm-dd
============================ */
function parseDateAny(s) {
  const t = clean(s);
  if (!t) return null;

  let m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);

  m = t.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

  return null;
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthKeyFromRow(r) {
  const d = parseDateAny(r[FECHA_COL]);
  return d ? monthKey(d) : null;
}

/* ============================
   CSV parser (quotes safe)
============================ */
function parseDelimited(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" && !inQuotes) {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else {
      cur += ch;
    }
  }

  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }

  return rows;
}

/* ============================
   SELECT UTIL
============================ */
function fillMulti(id, values){
  const list = document.querySelector(`.multi-list[data-sel="${id}"]`);
  if (!list) return;

  const st = multiState[id] || (multiState[id] = new Set());
  const prev = new Set(st);
  st.clear();
  for (const v of values){ if (prev.has(v)) st.add(v); }

  list.innerHTML = values.map(v => {
    const checked = st.has(v) ? "checked" : "";
    const esc = String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    return `<label class="multi-item"><input type="checkbox" value="${esc}" ${checked}><span title="${esc}">${esc}</span></label>`;
  }).join("");

  renderMultiLabel(id, values);
}

function renderMultiLabel(id, values=null){
  const lbl = document.querySelector(`.multi-btn[data-sel="${id}"] .multi-label`);
  if (!lbl) return;
  const st = multiState[id];
  const arr = st ? Array.from(st) : [];
  if (!arr.length) { lbl.textContent = "Todos"; return; }
  if (values && arr.length === values.length) { lbl.textContent = "Todo"; return; }
  if (arr.length === 1) { lbl.textContent = arr[0]; return; }
  lbl.textContent = `${arr.length} seleccionados`;
}

function fillSelect(selectId, values, placeholder = "Todos") {
  const sel = document.getElementById(selectId);
  if (!sel) return;

  const prev = sel.value;

  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  sel.appendChild(opt0);

  for (const v of values) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  }

  // mantener selección si existe, sino “Todos”
  sel.value = values.includes(prev) ? prev : "";
}

function uniqSorted(arr) {
  return [...new Set(arr.map(clean).filter(Boolean))].sort((a,b) => a.localeCompare(b, "es"));
}

/* ============================
   FILTERS (NUEVO: cliente + clasif2 + gcoc)
============================ */
function getSel(id) {
  return document.getElementById(id)?.value || "";
}

function getSelMulti(id){
  const st = multiState[id];
  return st ? Array.from(st) : [];
}

function clearSelection(id){
  const st = multiState[id];
  if (st) st.clear();
  renderMultiLabel(id);
}

function setAll(id, values, on=true){
  const st = multiState[id];
  if (!st) return;
  st.clear();
  if (on) values.forEach(v => st.add(v));
  renderMultiLabel(id, values);
}

function getSel(id) {
  return document.getElementById(id)?.value || "";
}

function rowsByClienteBase() {
  const cs = getSelMulti("clienteSelect");
  if (!cs.length) return data;
  return data.filter(r => cs.includes(clean(r[CLIENT_COL])));
}

function filteredRowsNoMes() {
  let rows = rowsByClienteBase();

  const c2s = getSelMulti("clasif2Select");
  if (c2s.length && CLASIF2_COL) rows = rows.filter(r => c2s.includes(clean(r[CLASIF2_COL])));
  const gcs = getSelMulti("gcocSelect");
  if (gcs.length && GCOC_COL) rows = rows.filter(r => gcs.includes(clean(r[GCOC_COL])));
  return rows;
}

function filteredRowsByAll() {
  const rows = filteredRowsNoMes();
  const mes = getSel("mesSelect");
  if (!mes) return rows;
  return rows.filter(r => getMonthKeyFromRow(r) === mes);
}

/* ============================
   SELECTS
============================ */
function renderClientes() {
  const clientes = uniqSorted(data.map(r => r[CLIENT_COL]));
  if (document.querySelector('.multi[data-sel="clienteSelect"]')) {
    fillMulti("clienteSelect", clientes);
  } else {
    fillSelect("clienteSelect", clientes, "Todos");
  }
}

function renderClasif2(rowsBase) {
  const hint = document.getElementById("clasif2Hint");
  if (!CLASIF2_COL) {
    if (hint) hint.textContent = "Columna: (no encontrada)";
    // deshabilito el select para que no moleste
    const sel = document.getElementById("clasif2Select");
    if (sel) { sel.disabled = true; sel.innerHTML = `<option value="">Todos</option>`; }
    return;
  }
  if (hint) hint.textContent = `Columna: ${CLASIF2_COL}`;
  const vals = uniqSorted(rowsBase.map(r => r[CLASIF2_COL]));
  const sel = document.getElementById("clasif2Select");
  if (sel) sel.disabled = false;
  if (document.querySelector('.multi[data-sel="clasif2Select"]')) { fillMulti("clasif2Select", vals); } else { fillSelect("clasif2Select", vals, "Todos"); }
}

function renderGcoc(rowsBase) {
  const hint = document.getElementById("gcocHint");
  if (!GCOC_COL) {
    if (hint) hint.textContent = "Columna: (no encontrada)";
    const sel = document.getElementById("gcocSelect");
    if (sel) { sel.disabled = true; sel.innerHTML = `<option value="">Todos</option>`; }
    return;
  }
  if (hint) hint.textContent = `Columna: ${GCOC_COL}`;
  const vals = uniqSorted(rowsBase.map(r => r[GCOC_COL]));
  const sel = document.getElementById("gcocSelect");
  if (sel) sel.disabled = false;
  if (document.querySelector('.multi[data-sel="gcocSelect"]')) { fillMulti("gcocSelect", vals); } else { fillSelect("gcocSelect", vals, "Todos"); }
}

function buildMesSelect(rows) {
  const sel = document.getElementById("mesSelect");
  if (!sel) return [];

  const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))].sort();
  const prevSelected = sel.value;

  sel.innerHTML = "";
  for (const m of months) {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m;
    sel.appendChild(o);
  }

  // por defecto: último mes disponible
  sel.value = months.includes(prevSelected) ? prevSelected : (months[months.length - 1] || "");

  const hint = document.getElementById("mesHint");
  if (hint) hint.textContent = sel.value ? `Mes seleccionado: ${sel.value}` : "Sin meses";

  return months;
}

/* ============================
   KPI CALCS
============================ */
function calcTotals(rows) {
  let at = 0, ft = 0, no = 0;
  for (const r of rows) {
    at += toNumber(r[AT_COL]);
    ft += toNumber(r[FT_COL]);
    no += toNumber(r[NO_COL]);
  }
  const total = at + ft + no;
  return { at, ft, no, total };
}

function calcMonthTotals(rows, month) {
  let at = 0, ft = 0, no = 0;

  for (const r of rows) {
    if (getMonthKeyFromRow(r) !== month) continue;
    at += toNumber(r[AT_COL]);
    ft += toNumber(r[FT_COL]);
    no += toNumber(r[NO_COL]);
  }

  const total = at + ft + no;
  const pctAT = total ? at / total : NaN;
  const pctFT = total ? ft / total : NaN;
  const pctNO = total ? no / total : NaN;

  return { at, ft, no, total, pctAT, pctFT, pctNO };
}

/* ============================
   DELTAS
============================ */
function deltaInfo(curr, prev) {
  if (!isFinite(curr) || !isFinite(prev)) return { text: "Sin mes anterior", diff: NaN };
  const diff = curr - prev;
  const eps = 0.000001;
  if (Math.abs(diff) < eps) return { text: "• 0,0% vs mes anterior", diff: 0 };
  const arrow = diff > 0 ? "▲" : "▼";
  const txt = `${arrow} ${(Math.abs(diff) * 100).toFixed(1).replace(".", ",")}% vs mes anterior`;
  return { text: txt, diff };
}

function setDelta(el, text, cls) {
  if (!el) return;
  el.classList.remove("delta-good", "delta-bad", "delta-neutral");
  if (cls) el.classList.add(cls);
  el.textContent = text;
}

/* ============================
   KPIs UI
============================ */
function updateKPIsGeneral(rows) {
  const t = calcTotals(rows);
  const pctAT = t.total ? t.at / t.total : NaN;
  const pctFT = t.total ? t.ft / t.total : NaN;
  const pctNO = t.total ? t.no / t.total : NaN;

  setText("kpiTotal", fmtInt(t.total));

  setText("kpiATpct", fmtPct01(pctAT));
  setText("kpiATqty", `Cantidad: ${fmtInt(t.at)}`);

  setText("kpiFTpct", fmtPct01(pctFT));
  setText("kpiFTqty", `Cantidad: ${fmtInt(t.ft)}`);

  setText("kpiNOpct", fmtPct01(pctNO));
  setText("kpiNOqty", `Cantidad: ${fmtInt(t.no)}`);
}

function updateKPIsMonthly(rows, months) {
  const mes = getSel("mesSelect");
  if (!mes) return;

  const idx = months.indexOf(mes);
  const prevMes = idx > 0 ? months[idx - 1] : null;

  const cur = calcMonthTotals(rows, mes);
  const prev = prevMes ? calcMonthTotals(rows, prevMes) : null;

  setText("kpiTotalMes", fmtInt(cur.total));
  setText("kpiATmes", fmtPct01(cur.pctAT));
  setText("kpiFTmes", fmtPct01(cur.pctFT));
  setText("kpiNOmes", fmtPct01(cur.pctNO));

  const atSub = document.getElementById("kpiATmesSub");
  const ftSub = document.getElementById("kpiFTmesSub");
  const noSub = document.getElementById("kpiNOmesSub");

  if (!prev) {
    setDelta(atSub, `Cant: ${fmtInt(cur.at)} · Sin mes anterior`, "");
    setDelta(ftSub, `Cant: ${fmtInt(cur.ft)} · Sin mes anterior`, "");
    setDelta(noSub, `Cant: ${fmtInt(cur.no)} · Sin mes anterior`, "");
    return;
  }

  const dAT = deltaInfo(cur.pctAT, prev.pctAT);
  const dFT = deltaInfo(cur.pctFT, prev.pctFT);
  const dNO = deltaInfo(cur.pctNO, prev.pctNO);

  /*
    REGLAS:
    AT: baja = rojo, sube o se mantiene = verde
    FT: sube o se mantiene = rojo, baja = verde
    NO: sube = rojo, baja o se mantiene = verde
  */
  let clsAT = "delta-good";
  if (dAT.diff < 0) clsAT = "delta-bad";

  let clsFT = "delta-bad";
  if (dFT.diff < 0) clsFT = "delta-good";

  let clsNO = "delta-good";
  if (dNO.diff > 0) clsNO = "delta-bad";

  setDelta(atSub, `Cant: ${fmtInt(cur.at)} · ${dAT.text}`, clsAT);
  setDelta(ftSub, `Cant: ${fmtInt(cur.ft)} · ${dFT.text}`, clsFT);
  setDelta(noSub, `Cant: ${fmtInt(cur.no)} · ${dNO.text}`, clsNO);
}

/* ============================
   CHART DEFAULTS
============================ */
function applyChartDefaults() {
  Chart.register(ChartDataLabels);

  Chart.defaults.color = COLORS.text;
  Chart.defaults.font.family = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
  Chart.defaults.font.weight = "800";

  Chart.defaults.interaction.mode = "index";
  Chart.defaults.interaction.intersect = false;

  Chart.defaults.plugins.tooltip.backgroundColor = "rgba(255,255,255,0.97)";
  Chart.defaults.plugins.tooltip.titleColor = COLORS.text;
  Chart.defaults.plugins.tooltip.bodyColor = COLORS.text;
  Chart.defaults.plugins.tooltip.borderColor = "rgba(2,8,20,.18)";
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.displayColors = true;
}

/* ============================
   CHART 1: 100% stacked bar
============================ */
function buildChartMes(rows) {
  const agg = new Map();
  const monthsSet = new Set();

  for (const r of rows) {
    const d = parseDateAny(r[FECHA_COL]);
    if (!d) continue;

    const mk = monthKey(d);
    monthsSet.add(mk);

    if (!agg.has(mk)) agg.set(mk, { at: 0, ft: 0, no: 0 });
    const c = agg.get(mk);

    c.at += toNumber(r[AT_COL]);
    c.ft += toNumber(r[FT_COL]);
    c.no += toNumber(r[NO_COL]);
  }

  const months = [...monthsSet].sort();
  const qAT = months.map(m => agg.get(m)?.at ?? 0);
  const qFT = months.map(m => agg.get(m)?.ft ?? 0);
  const qNO = months.map(m => agg.get(m)?.no ?? 0);

  const pAT = qAT.map((v,i)=>{ const t=qAT[i]+qFT[i]+qNO[i]; return t? (v/t)*100 : 0; });
  const pFT = qFT.map((v,i)=>{ const t=qAT[i]+qFT[i]+qNO[i]; return t? (v/t)*100 : 0; });
  const pNO = qNO.map((v,i)=>{ const t=qAT[i]+qFT[i]+qNO[i]; return t? (v/t)*100 : 0; });

  const canvas = document.getElementById("chartMes");
  if (!canvas) return;

  if (chartMes) chartMes.destroy();

  chartMes = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        { label: "Entregados AT", data: pAT, _q: qAT, stack:"s", backgroundColor: COLORS.green },
        { label: "Entregados FT", data: pFT, _q: qFT, stack:"s", backgroundColor: COLORS.amber },
        { label: "No entregados", data: pNO, _q: qNO, stack:"s", backgroundColor: COLORS.red },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked:true, grid:{ color:"transparent" }, ticks:{ color: COLORS.muted } },
        y: {
          stacked:true,
          beginAtZero:true,
          max:100,
          grid:{ color: COLORS.grid },
          ticks:{ color: COLORS.muted, callback:(v)=> v + "%" }
        }
      },
      plugins: {
        legend: { position:"bottom" },
        tooltip: {
          callbacks: {
            label: (c) => {
              const pct = (c.parsed.y ?? 0).toFixed(1).replace(".", ",");
              const qty = c.dataset._q?.[c.dataIndex] ?? 0;
              return ` ${c.dataset.label}: ${fmtInt(qty)} (${pct}%)`;
            }
          }
        },
        datalabels: {
          formatter: (v, ctx) => {
            const qty = ctx.dataset._q?.[ctx.dataIndex] ?? 0;
            if (!qty || v < 7) return "";
            return `${fmtInt(qty)} (${v.toFixed(0)}%)`;
          },
          anchor: "center",
          align: "center",
          clamp: true,
          color: "#fff",
          font: { weight: "900", size: 11 }
        }
      }
    }
  });
}

/* ============================
   CHART 2: Trend lines
============================ */
function buildChartTendencia(rows) {
  const agg = new Map();
  const monthsSet = new Set();

  for (const r of rows) {
    const d = parseDateAny(r[FECHA_COL]);
    if (!d) continue;

    const mk = monthKey(d);
    monthsSet.add(mk);

    if (!agg.has(mk)) agg.set(mk, { at: 0, ft: 0, no: 0 });
    const c = agg.get(mk);

    c.at += toNumber(r[AT_COL]);
    c.ft += toNumber(r[FT_COL]);
    c.no += toNumber(r[NO_COL]);
  }

  const months = [...monthsSet].sort();

  const pAT = months.map(m => {
    const c = agg.get(m); const t = c.at + c.ft + c.no;
    return t ? (c.at / t) * 100 : 0;
  });
  const pFT = months.map(m => {
    const c = agg.get(m); const t = c.at + c.ft + c.no;
    return t ? (c.ft / t) * 100 : 0;
  });
  const pNO = months.map(m => {
    const c = agg.get(m); const t = c.at + c.ft + c.no;
    return t ? (c.no / t) * 100 : 0;
  });

  const canvas = document.getElementById("chartTendencia");
  if (!canvas) return;

  if (chartTendencia) chartTendencia.destroy();

  chartTendencia = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: months,
      datasets: [
        { label: "A Tiempo %", data: pAT, borderColor: COLORS.green, backgroundColor: COLORS.green, tension: 0, pointRadius: 4, pointHoverRadius: 6, pointBorderWidth: 2 },
        { label: "Fuera Tiempo %", data: pFT, borderColor: COLORS.amber, backgroundColor: COLORS.amber, tension: 0, pointRadius: 4, pointHoverRadius: 6, pointBorderWidth: 2 },
        { label: "No Entregados %", data: pNO, borderColor: COLORS.red, backgroundColor: COLORS.red, tension: 0, pointRadius: 4, pointHoverRadius: 6, pointBorderWidth: 2 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: "transparent" }, ticks: { color: COLORS.muted } },
        y: { beginAtZero: true, max: 100, grid: { color: COLORS.grid }, ticks: { color: COLORS.muted, callback: (v) => v + "%" } }
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1).replace(".", ",")}%` } },
        datalabels: {
          align: "top",
          anchor: "end",
          offset: 6,
          formatter: (v) => `${Number(v).toFixed(0)}%`,
          color: COLORS.text,
          font: { size: 11, weight: "900" }
        }
      }
    }
  });
}

/* ============================
   DOWNLOAD: NO ENTREGADOS
============================ */
function escapeCSV(v) {
  const s = (v ?? "").toString();
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCSV(filename, rows, cols) {
  const header = cols.map(escapeCSV).join(";");
  const lines = rows.map(r => cols.map(c => escapeCSV(r[c])).join(";"));
  const csv = [header, ...lines].join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function getNoEntregadosRows(rows) {
  return rows.filter(r => toNumber(r[NO_COL]) > 0);
}

/* ============================
   APPLY ALL (con filtros nuevos)
============================ */
function applyAll() {
  // 1) base por cliente (para refrescar opciones dependientes)
  const baseCliente = rowsByClienteBase();

  // 2) refresco clasif2 desde cliente
  renderClasif2(baseCliente);

  // 3) refresco gcoc desde cliente + clasif2 actual
  const baseParaGc = (() => {
    let r = baseCliente;
    const c2 = getSel("clasif2Select");
    if (c2 && CLASIF2_COL) r = r.filter(x => clean(x[CLASIF2_COL]) === c2);
    return r;
  })();
  renderGcoc(baseParaGc);

  // 4) filas finales (sin mes) para KPIs generales + charts + meses disponibles
  const rows = filteredRowsNoMes();

  // 5) meses disponibles en base a filtros (sin mes)
  const months = buildMesSelect(rows);

  // 6) KPIs y charts con filtros aplicados
  updateKPIsGeneral(rows);
  updateKPIsMonthly(rows, months);

  buildChartMes(rows);
  buildChartTendencia(rows);
}


/* ============================
   CSV LOADER (robusto)
============================ */
async function fetchFirstOk() {
  for (const name of CSV_CANDIDATES) {
    try {
      const r = await fetch(name, { cache: "no-store" });
      if (r.ok) return { name, text: await r.text() };
    } catch (e) {}
  }
  throw new Error("No pude abrir ningún CSV. Probé: " + CSV_CANDIDATES.join(" / "));
}

/* ============================
   INIT
============================ */
window.addEventListener("DOMContentLoaded", () => {
  // ===== Multiselect dropdown handlers =====
  function toggleMultiPanel(id){
    const panel = document.querySelector(`.multi-panel[data-sel="${id}"]`);
    if (!panel) return;
    panel.hidden = !panel.hidden;
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".multi-btn[data-sel]");
    if (btn){
      const id = btn.dataset.sel;
      // cerrar otros
      document.querySelectorAll(".multi-panel[data-sel]").forEach(p => {
        if (p.dataset.sel !== id) p.hidden = true;
      });
      toggleMultiPanel(id);
      return;
    }

    const actBtn = e.target.closest("[data-sel][data-act]");
    if (actBtn){
      const id = actBtn.dataset.sel;
      const act = actBtn.dataset.act;
      const values = Array.from(document.querySelectorAll(`.multi-list[data-sel="${id}"] input[type="checkbox"]`)).map(x => x.value);
      if (act === "all") setAll(id, values, true);
      if (act === "none") setAll(id, values, false);

      document.querySelectorAll(`.multi-list[data-sel="${id}"] input[type="checkbox"]`).forEach(ch => {
        ch.checked = (act === "all");
      });
      applyAll();
      return;
    }

    if (!e.target.closest(".multi")){
      document.querySelectorAll(".multi-panel[data-sel]").forEach(p => p.hidden = true);
    }
  });

  document.addEventListener("change", (e) => {
    const chk = e.target.closest('.multi-list[data-sel] input[type="checkbox"]');
    if (!chk) return;
    const id = chk.closest(".multi-list").dataset.sel;
    const st = multiState[id] || (multiState[id] = new Set());
    if (chk.checked) st.add(chk.value);
    else st.delete(chk.value);
    const values = Array.from(document.querySelectorAll(`.multi-list[data-sel="${id}"] input[type="checkbox"]`)).map(x => x.value);
    renderMultiLabel(id, values);
    applyAll();
  });


  applyChartDefaults();

  // fecha “hoy” en header
  const d = new Date();
  setText("lastUpdate", `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`);

  fetchFirstOk()
    .then(({ name, text }) => {
      // CSV encontrado
      try { const used = document.querySelector(".footnote b"); if (used) used.textContent = name; } catch(e) {}

      const m = parseDelimited(text, DELIM);
      if (!m.length || m.length < 2) {
        showError("El CSV está vacío o no tiene filas.");
        return;
      }

      headers = m[0].map(clean);

      // detectar columna fecha/mes de entrega
      FECHA_COL = findHeaderByCandidates(FECHA_CANDIDATES) || FECHA_COL;


      CLIENT_COL = CLIENT_CANDIDATES.find(c => headers.includes(c));
      if (!CLIENT_COL) {
        showError("No encuentro columna CLIENTE. Probé: " + CLIENT_CANDIDATES.join(" / "));
        return;
      }

      // detectar columnas nuevas si existen
      CLASIF2_COL = findHeaderByCandidates(CLASIF2_CANDIDATES) || null;
      GCOC_COL = findHeaderByCandidates(GCOC_CANDIDATES) || null;

      const required = [FECHA_COL, AT_COL, FT_COL, NO_COL];
      const missing = required.filter(c => !headers.includes(c));
      if (missing.length) {
        showError("Faltan columnas en el CSV: " + missing.join(", "));
        return;
      }

      data = m.slice(1).map(row => {
        const o = {};
        headers.forEach((h, i) => (o[h] = clean(row[i])));
        return o;
      });

      setText("clienteHint", `Columna cliente: ${CLIENT_COL}`);
      setText("clasif2Hint", CLASIF2_COL ? `Columna: ${CLASIF2_COL}` : "Columna: (no encontrada)");
      setText("gcocHint", GCOC_COL ? `Columna: ${GCOC_COL}` : "Columna: (no encontrada)");

      renderClientes();
      applyAll();

      // listeners
      if (c2) c2.value = "";
        const gc = document.getElementById("gcocSelect");
        if (gc) gc.value = "";
        applyAll();
      });

      if (gc) gc.value = "";
        applyAll();
      });

      document.getElementById("mesSelect")?.addEventListener("change", () => {
        const rows = filteredRowsNoMes();
        const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))].sort();
        updateKPIsMonthly(rows, months);
      });

      document.getElementById("btnDownloadNO")?.addEventListener("click", () => {
        const rowsFilt = filteredRowsByAll();
        const noRows = getNoEntregadosRows(rowsFilt);

        if (!noRows.length) {
          alert("No hay NO ENTREGADOS para el filtro actual.");
          return;
        }

        const cols = [CLIENT_COL, FECHA_COL, AT_COL, FT_COL, NO_COL, "CLASIFICACION 2", "Material", "SOLPED", "SOLPED"];

        const cliente = safeFilePart(getSel("clienteSelect") || "Todos");
        const c2 = safeFilePart(getSel("clasif2Select") || "Todos");
        const gc = safeFilePart(getSel("gcocSelect") || "Todos");
        const mes = safeFilePart(getSel("mesSelect") || "Todos");

        const filename = `NO_ENTREGADOS_${cliente}_${c2}_${gc}_${mes}.csv`;
        downloadCSV(filename, noRows, cols);
      });

      // limpio mensaje de error si había
      setHTML("msg", "");
    })
    .catch(err => {
      console.error(err);
      showError("Error cargando CSV. Revisá el nombre del archivo y que esté en la raíz del repo.");
    });
});



