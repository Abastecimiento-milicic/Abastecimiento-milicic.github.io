/* ============================
   CONFIG
============================ */
const csvUrl = "CUMPLIMIENTO_2025.csv";  // nombre EXACTO en tu repo
const DELIM = ";";

const FECHA_COL = "FECHA ENTREGA ESPERADA";
const CLIENT_CANDIDATES = ["CLIENTE / OBRA", "CLIENTE NRO.", "CLIENTE"];

// FILTROS
const CLASIF2_CANDIDATES = ["CLASIFICACION 2", "CLASIFICACIÓN 2", "CLASIFICACION2", "CLASIFICACION_2"];
const ESTADO_ITEM_CANDIDATES = ["ESTADO ITEM", "ESTADO", "ESTADO_ITEM"];
const GRUPO_COMPRA_CANDIDATES = ["GRUPO DE COMPRA", "GRUPO DE COMPRAS", "GRUPO_COMPRA", "GRUPO_DE_COMPRA"];
const CLASE_DOC_CANDIDATES = ["CLASE DE DOC", "CLASE DOC", "CLASE_DE_DOC", "CLASEDOC"];

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
let ESTADO_ITEM_COL = null;
let GRUPO_COMPRA_COL = null;
let CLASE_DOC_COL = null;

let chartMes = null;
let chartTendencia = null;

/* ============================
   HELPERS
============================ */
const clean = (v) => (v ?? "").toString().trim();

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

function uniqSorted(arr) {
  return [...new Set(arr.map(clean).filter(Boolean))].sort((a,b) => a.localeCompare(b, "es"));
}

function getSel(id) {
  return document.getElementById(id)?.value || "";
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

function ensureDisabled(selectId, hintId, label) {
  const hint = document.getElementById(hintId);
  if (hint) hint.textContent = label;

  const sel = document.getElementById(selectId);
  if (sel) {
    sel.disabled = true;
    sel.innerHTML = `<option value="">Todos</option>`;
  }
}

function ensureEnabled(selectId, hintId, label) {
  const hint = document.getElementById(hintId);
  if (hint) hint.textContent = label;

  const sel = document.getElementById(selectId);
  if (sel) sel.disabled = false;
}

/* ============================
   FILTERS
============================ */
function rowsByClienteBase() {
  const c = getSel("clienteSelect");
  if (!c) return data;
  return data.filter(r => clean(r[CLIENT_COL]) === c);
}

function filteredRowsNoMes() {
  let rows = rowsByClienteBase();

  const c2 = getSel("clasif2Select");
  if (c2 && CLASIF2_COL) rows = rows.filter(r => clean(r[CLASIF2_COL]) === c2);

  const ei = getSel("estadoItemSelect");
  if (ei && ESTADO_ITEM_COL) rows = rows.filter(r => clean(r[ESTADO_ITEM_COL]) === ei);

  const gc = getSel("grupoCompraSelect");
  if (gc && GRUPO_COMPRA_COL) rows = rows.filter(r => clean(r[GRUPO_COMPRA_COL]) === gc);

  const cd = getSel("claseDocSelect");
  if (cd && CLASE_DOC_COL) rows = rows.filter(r => clean(r[CLASE_DOC_COL]) === cd);

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
  fillSelect("clienteSelect", clientes, "Todos");
}

function renderClasif2(rowsBase) {
  if (!CLASIF2_COL) {
    ensureDisabled("clasif2Select", "clasif2Hint", "Columna: (no encontrada)");
    return;
  }
  ensureEnabled("clasif2Select", "clasif2Hint", `Columna: ${CLASIF2_COL}`);
  const vals = uniqSorted(rowsBase.map(r => r[CLASIF2_COL]));
  fillSelect("clasif2Select", vals, "Todos");
}

function renderEstadoItem(rowsBase) {
  if (!ESTADO_ITEM_COL) {
    ensureDisabled("estadoItemSelect", "estadoItemHint", "Columna: (no encontrada)");
    return;
  }
  ensureEnabled("estadoItemSelect", "estadoItemHint", `Columna: ${ESTADO_ITEM_COL}`);
  const vals = uniqSorted(rowsBase.map(r => r[ESTADO_ITEM_COL]));
  fillSelect("estadoItemSelect", vals, "Todos");
}

function renderGrupoCompra(rowsBase) {
  if (!GRUPO_COMPRA_COL) {
    ensureDisabled("grupoCompraSelect", "grupoCompraHint", "Columna: (no encontrada)");
    return;
  }
  ensureEnabled("grupoCompraSelect", "grupoCompraHint", `Columna: ${GRUPO_COMPRA_COL}`);
  const vals = uniqSorted(rowsBase.map(r => r[GRUPO_COMPRA_COL]));
  fillSelect("grupoCompraSelect", vals, "Todos");
}

function renderClaseDoc(rowsBase) {
  if (!CLASE_DOC_COL) {
    ensureDisabled("claseDocSelect", "claseDocHint", "Columna: (no encontrada)");
    return;
  }
  ensureEnabled("claseDocSelect", "claseDocHint", `Columna: ${CLASE_DOC_COL}`);
  const vals = uniqSorted(rowsBase.map(r => r[CLASE_DOC_COL]));
  fillSelect("claseDocSelect", vals, "Todos");
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

function pickExistingCols(desired) {
  return desired.filter(c => c && headers.includes(c));
}

/* ============================
   APPLY ALL
============================ */
function applyAll() {
  // 1) base por cliente (para refrescar opciones dependientes)
  const baseCliente = rowsByClienteBase();

  // 2) refresco cascada de selects (cada uno depende del anterior)
  renderClasif2(baseCliente);

  const baseClasif = (() => {
    let r = baseCliente;
    const c2 = getSel("clasif2Select");
    if (c2 && CLASIF2_COL) r = r.filter(x => clean(x[CLASIF2_COL]) === c2);
    return r;
  })();
  renderEstadoItem(baseClasif);

  const baseEstado = (() => {
    let r = baseClasif;
    const ei = getSel("estadoItemSelect");
    if (ei && ESTADO_ITEM_COL) r = r.filter(x => clean(x[ESTADO_ITEM_COL]) === ei);
    return r;
  })();
  renderGrupoCompra(baseEstado);

  const baseGrupo = (() => {
    let r = baseEstado;
    const gc = getSel("grupoCompraSelect");
    if (gc && GRUPO_COMPRA_COL) r = r.filter(x => clean(x[GRUPO_COMPRA_COL]) === gc);
    return r;
  })();
  renderClaseDoc(baseGrupo);

  // 3) filas finales (sin mes) para KPIs generales + charts + meses disponibles
  const rows = filteredRowsNoMes();

  // 4) meses disponibles en base a filtros (sin mes)
  const months = buildMesSelect(rows);

  // 5) KPIs y charts con filtros aplicados
  updateKPIsGeneral(rows);
  updateKPIsMonthly(rows, months);

  buildChartMes(rows);
  buildChartTendencia(rows);
}

/* ============================
   INIT
============================ */
window.addEventListener("DOMContentLoaded", () => {
  applyChartDefaults();

  // fecha “hoy” en header
  const d = new Date();
  setText("lastUpdate", `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`);

  fetch(csvUrl)
    .then(r => {
      if (!r.ok) throw new Error(`No pude abrir ${csvUrl} (HTTP ${r.status})`);
      return r.text();
    })
    .then(text => {
      const m = parseDelimited(text, DELIM);
      if (!m.length || m.length < 2) {
        showError("El CSV está vacío o no tiene filas.");
        return;
      }

      headers = m[0].map(clean);

      CLIENT_COL = CLIENT_CANDIDATES.find(c => headers.includes(c));
      if (!CLIENT_COL) {
        showError("No encuentro columna CLIENTE. Probé: " + CLIENT_CANDIDATES.join(" / "));
        return;
      }

      // detectar columnas de filtros si existen
      CLASIF2_COL = CLASIF2_CANDIDATES.find(c => headers.includes(c)) || null;
      ESTADO_ITEM_COL = ESTADO_ITEM_CANDIDATES.find(c => headers.includes(c)) || null;
      GRUPO_COMPRA_COL = GRUPO_COMPRA_CANDIDATES.find(c => headers.includes(c)) || null;
      CLASE_DOC_COL = CLASE_DOC_CANDIDATES.find(c => headers.includes(c)) || null;

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
      setText("estadoItemHint", ESTADO_ITEM_COL ? `Columna: ${ESTADO_ITEM_COL}` : "Columna: (no encontrada)");
      setText("grupoCompraHint", GRUPO_COMPRA_COL ? `Columna: ${GRUPO_COMPRA_COL}` : "Columna: (no encontrada)");
      setText("claseDocHint", CLASE_DOC_COL ? `Columna: ${CLASE_DOC_COL}` : "Columna: (no encontrada)");

      renderClientes();
      applyAll();

      // listeners (cascada)
      document.getElementById("clienteSelect")?.addEventListener("change", () => {
        document.getElementById("clasif2Select")?.value = "";
        document.getElementById("estadoItemSelect")?.value = "";
        document.getElementById("grupoCompraSelect")?.value = "";
        document.getElementById("claseDocSelect")?.value = "";
        applyAll();
      });

      document.getElementById("clasif2Select")?.addEventListener("change", () => {
        document.getElementById("estadoItemSelect")?.value = "";
        document.getElementById("grupoCompraSelect")?.value = "";
        document.getElementById("claseDocSelect")?.value = "";
        applyAll();
      });

      document.getElementById("estadoItemSelect")?.addEventListener("change", () => {
        document.getElementById("grupoCompraSelect")?.value = "";
        document.getElementById("claseDocSelect")?.value = "";
        applyAll();
      });

      document.getElementById("grupoCompraSelect")?.addEventListener("change", () => {
        document.getElementById("claseDocSelect")?.value = "";
        applyAll();
      });

      document.getElementById("claseDocSelect")?.addEventListener("change", applyAll);

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

        // columnas de export: solo las que existan en tu CSV
        const desired = [
          CLIENT_COL,
          CLASIF2_COL,
          ESTADO_ITEM_COL,
          GRUPO_COMPRA_COL,
          CLASE_DOC_COL,
          FECHA_COL,
          AT_COL, FT_COL, NO_COL,
          "CODIGO ITEM",
          "DESCRIPCION ITEM",
          "NRO OC",
          "SOLPED",
          "Material"
        ];
        const cols = pickExistingCols(desired);

        const cliente = safeFilePart(getSel("clienteSelect") || "Todos");
        const c2 = safeFilePart(getSel("clasif2Select") || "Todos");
        const ei = safeFilePart(getSel("estadoItemSelect") || "Todos");
        const gc = safeFilePart(getSel("grupoCompraSelect") || "Todos");
        const cd = safeFilePart(getSel("claseDocSelect") || "Todos");
        const mes = safeFilePart(getSel("mesSelect") || "Todos");

        const filename = `NO_ENTREGADOS_${cliente}_${c2}_${ei}_${gc}_${cd}_${mes}.csv`;
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
