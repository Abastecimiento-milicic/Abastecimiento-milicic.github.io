/* ============================
   CONFIG
============================ */
let csvUrl = "CUMPLIMIENTO_2025.csv";
const DELIM = ";";

const FECHA_COL = "FECHA ENTREGA ESPERADA";
const CLIENT_CANDIDATES = ["CLIENTE / OBRA", "CLIENTE NRO.", "CLIENTE"];

const AT_COL = "ENTREGADOS AT";
const FT_COL = "ENTREGADOS FT";
const NO_COL = "NO ENTREGADOS";

/* ============================
   COLORES
============================ */
const COLORS = {
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

let chartMes = null;
let chartTendencia = null;

/* ============================
   HELPERS
============================ */
const clean = (v) => (v ?? "").toString().trim();

function toNumber(v) {
  let x = clean(v);
  if (!x) return 0;
  x = x.replace(/\s/g, "");
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

function showError(msg) {
  const el = document.getElementById("msg");
  if (el) el.innerHTML = `<div class="error">${msg}</div>`;
}
function clearError() {
  const el = document.getElementById("msg");
  if (el) el.innerHTML = "";
}

/* ============================
   DATE PARSING
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
      if (inQuotes && text[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === delimiter && !inQuotes) {
      row.push(cur); cur = "";
    } else if (ch === "\n" && !inQuotes) {
      row.push(cur); rows.push(row); row = []; cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

/* ============================
   FILTERS
============================ */
function filteredRowsByCliente() {
  const sel = document.getElementById("clienteSelect");
  const c = sel ? sel.value : "";
  return c ? data.filter(r => clean(r[CLIENT_COL]) === c) : data;
}

/* ============================
   SELECTS
============================ */
function renderClientes() {
  const sel = document.getElementById("clienteSelect");
  if (!sel) return;

  sel.querySelectorAll("option:not([value=''])").forEach(o => o.remove());

  const clientes = [...new Set(data.map(r => clean(r[CLIENT_COL])).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b, "es"));

  for (const c of clientes) {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    sel.appendChild(o);
  }
}

function buildMesSelect(rows) {
  const sel = document.getElementById("mesSelect");
  if (!sel) return [];

  const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))].sort();

  sel.innerHTML = "";
  for (const m of months) {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m;
    sel.appendChild(o);
  }

  sel.value = months[months.length - 1] || "";

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
  return {
    at, ft, no, total,
    pctAT: total ? at/total : NaN,
    pctFT: total ? ft/total : NaN,
    pctNO: total ? no/total : NaN
  };
}

/* ============================
   UI
============================ */
function updateKPIsGeneral(rows) {
  const t = calcTotals(rows);
  const pctAT = t.total ? t.at / t.total : NaN;
  const pctFT = t.total ? t.ft / t.total : NaN;
  const pctNO = t.total ? t.no / t.total : NaN;

  document.getElementById("kpiTotal").textContent = fmtInt(t.total);
  document.getElementById("kpiATpct").textContent = fmtPct01(pctAT);
  document.getElementById("kpiATqty").textContent = `Cantidad: ${fmtInt(t.at)}`;
  document.getElementById("kpiFTpct").textContent = fmtPct01(pctFT);
  document.getElementById("kpiFTqty").textContent = `Cantidad: ${fmtInt(t.ft)}`;
  document.getElementById("kpiNOpct").textContent = fmtPct01(pctNO);
  document.getElementById("kpiNOqty").textContent = `Cantidad: ${fmtInt(t.no)}`;
}

function updateKPIsMonthly(rows, months) {
  const mes = document.getElementById("mesSelect")?.value || "";
  if (!mes) return;

  const cur = calcMonthTotals(rows, mes);

  document.getElementById("kpiTotalMes").textContent = fmtInt(cur.total);
  document.getElementById("kpiATmes").textContent = fmtPct01(cur.pctAT);
  document.getElementById("kpiFTmes").textContent = fmtPct01(cur.pctFT);
  document.getElementById("kpiNOmes").textContent = fmtPct01(cur.pctNO);
}

/* ============================
   CHART SAFE INIT (NO rompe)
============================ */
function applyChartDefaultsSafe() {
  try {
    if (!window.Chart) return; // si chart.js no cargó
    if (window.ChartDataLabels) Chart.register(ChartDataLabels); // si el plugin no cargó, no pasa nada

    Chart.defaults.color = COLORS.text;
    Chart.defaults.font.family = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
    Chart.defaults.font.weight = "800";
    Chart.defaults.interaction.mode = "index";
    Chart.defaults.interaction.intersect = false;
  } catch (e) {
    console.warn("Charts deshabilitados:", e);
  }
}

function destroyCharts() {
  try { if (chartMes) { chartMes.destroy(); chartMes = null; } } catch {}
  try { if (chartTendencia) { chartTendencia.destroy(); chartTendencia = null; } } catch {}
}

function buildChartsSafe(rows) {
  // Si Chart no está, no hacemos gráficos, pero el tablero sigue.
  if (!window.Chart) return;

  // Podés volver a pegar tus charts completos acá cuando ya esté todo OK.
  // Por ahora lo dejamos vacío para que NO rompa.
}

/* ============================
   APPLY ALL
============================ */
function applyAll() {
  const rows = filteredRowsByCliente();
  const months = buildMesSelect(rows);

  updateKPIsGeneral(rows);
  updateKPIsMonthly(rows, months);

  destroyCharts();
  buildChartsSafe(rows);
}

/* ============================
   LOAD CSV
============================ */
function setTabTexts(tab, fileName) {
  const subtitle = document.getElementById("subtitle");
  const foot = document.getElementById("footnote");

  if (tab === "ANALISIS_MM") {
    if (subtitle) subtitle.textContent = "Análisis MM (desde CSV)";
    if (foot) foot.innerHTML = `Fuente: <b>${fileName}</b> (delimitador “;”).`;
  } else {
    if (subtitle) subtitle.textContent = "Análisis de Cumplimiento de Pedidos por Obra";
    if (foot) foot.innerHTML = `Fuente: <b>${fileName}</b> (delimitador “;”).`;
  }
}

function loadCSV(url, tab) {
  csvUrl = url;

  data = [];
  headers = [];
  CLIENT_COL = null;

  clearError();
  destroyCharts();

  document.getElementById("clienteHint").textContent = `Cargando: ${csvUrl}...`;
  document.getElementById("mesHint").textContent = "-";
  document.getElementById("clienteSelect").value = "";
  document.getElementById("mesSelect").innerHTML = "";

  setTabTexts(tab
