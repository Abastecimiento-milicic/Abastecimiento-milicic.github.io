/* ============================
   CONFIG
============================ */
const csvUrl = "CUMPLIMIENTO_2025.csv";
const DELIM = ";";

const FECHA_COL = "FECHA ENTREGA ESPERADA";
const CLIENT_CANDIDATES = ["CLIENTE NRO.", "CLIENTE"];

const AT_COL = "ENTREGADOS AT";
const FT_COL = "ENTREGADOS FT";
const NO_COL = "NO ENTREGADOS";

/* ============================
   ESTADO GLOBAL
============================ */
let data = [];
let headers = [];
let CLIENT_COL = null;
let chartMes = null;
let chartTendencia = null;

/* ============================
   HELPERS
============================ */
const clean = v => (v ?? "").toString().trim();

function toNumber(v) {
  let x = clean(v);
  if (!x) return 0;
  x = x.replace(/\s/g, "");
  if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function parseDateDMY(s) {
  const p = clean(s).split("/");
  if (p.length !== 3) return null;
  const [d,m,y] = p.map(n => parseInt(n,10));
  if (!y || !m || !d) return null;
  return new Date(y, m-1, d);
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

function fmtInt(n) {
  return Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtPct(x) {
  if (!isFinite(x)) return "-";
  return (x * 100).toFixed(1).replace(".", ",") + "%";
}

function fmtDelta(d) {
  if (!isFinite(d)) return "Sin mes anterior";
  const arrow = d >= 0 ? "▲" : "▼";
  return `${arrow} ${(Math.abs(d)*100).toFixed(1).replace(".", ",")}% vs mes anterior`;
}

function showError(msg) {
  const el = document.getElementById("msg");
  if (el) el.innerHTML = `<div class="error">${msg}</div>`;
}

/* ============================
   CSV PARSER
============================ */
function parseDelimited(text, delimiter=";") {
  const rows = [];
  let row = [], cur = "", inQuotes = false;

  text = text.replace(/\r\n/g,"\n").replace(/\r/g,"\n");

  for (let i=0;i<text.length;i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i+1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      row.push(cur); cur = "";
    } else if (ch === "\n" && !inQuotes) {
      row.push(cur); rows.push(row);
      row = []; cur = "";
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

/* ============================
   FILTROS
============================ */
function filteredRowsByCliente() {
  const sel = document.getElementById("clienteSelect");
  const c = sel ? sel.value : "";
  return c ? data.filter(r => clean(r[CLIENT_COL]) === c) : data;
}

function getMonthKeyFromRow(r) {
  const d = parseDateDMY(r[FECHA_COL]);
  return d ? monthKey(d) : null;
}

function buildMesSelect(rows) {
  const sel = document.getElementById("mesSelect");
  if (!sel) return [];

  const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))].sort();
  const prev = sel.value;

  sel.innerHTML = "";
  months.forEach(m => {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m;
    sel.appendChild(o);
  });

  sel.value = months.includes(prev) ? prev : months[months.length - 1] || "";
  document.getElementById("mesHint").textContent =
    sel.value ? `Mes seleccionado: ${sel.value}` : "Sin meses";

  return months;
}

/* ============================
   KPIs
============================ */
function calcTotals(rows) {
  let at=0, ft=0, no=0;
  rows.forEach(r=>{
    at+=toNumber(r[AT_COL]);
    ft+=toNumber(r[FT_COL]);
    no+=toNumber(r[NO_COL]);
  });
  return { at, ft, no, total: at+ft+no };
}

function updateKPIsGeneral(rows) {
  const t = calcTotals(rows);
  document.getElementById("kpiTotal").textContent = fmtInt(t.total);
  document.getElementById("kpiATpct").textContent = fmtPct(t.at/t.total);


