function _fmtPct(v){ if(v==null||isNaN(v)) return ""; const n=Math.round(v*10)/10; return n.toString().replace(".", ",") + "%"; }
function _fmtNum1(v){ if(v==null||isNaN(v)) return ""; const n=Math.round(v*10)/10; return n.toString().replace(".", ","); }

function toNumAny(v){
  if(v==null) return NaN;
  if(typeof v === "number") return v;
  const s = String(v).trim();
  if(!s) return NaN;
  // soporta "7,8" y "7.8" y miles "1.234,5"
  const norm = s.replace(/\./g, "").replace(/,/g, ".");
  const n = parseFloat(norm);
  return isNaN(n) ? NaN : n;
}

/* ============================
   CONFIG
============================ */
const csvUrl = "CUMPLIMIENTO_2025.csv";  // nombre EXACTO en tu repo
const DELIM = ";";

const FECHA_COL = "FECHA ENTREGA ESPERADA";
const DEMORA_COL = "DIAS DE DEMORA";

function avgDelay(rows){
  let s = 0, c = 0;
  for (const r of rows){
    const v = toNumAny(r[DEMORA_COL]);
    if (!isNaN(v)){ s += v; c++; }
  }
  return c ? (s / c) : NaN;
}

const CLIENT_CANDIDATES = ["CLIENTE / OBRA", "CLIENTE NRO.", "CLIENTE"];
const CLASIF2_CANDIDATES = ["CLASIFICACION 2", "CLASIFICACIÓN 2", "CLASIFICACION2", "CLASIFICACION_2"];
const GCOC_CANDIDATES = ["GRUPO DE COMPRAS OC", "GRUPO DE COMPRAS_OC", "GRUPO DE COMPRA OC"];

const AT_COL = "ENTREGADOS AT";
const FT_COL = "ENTREGADOS FT";
const NO_COL = "NO ENTREGADOS";

/* ============================
   COLORES (pedido)
   - demora: azul
   - no entregados: rojo
   - entregados AT: verde
   - entregados FT: naranja
============================ */
const COLORS = {
  demora: "#1d4ed8",   // azul
  at:     "#16a34a",   // verde
  ft:     "#f59e0b",   // naranja
  no:     "#ef4444",   // rojo
  grid:   "rgba(15, 23, 42, 0.10)",
  text:   "#0b1220",
  muted:  "#526172",
};

/* ============================
   GLOBAL
============================ */
let data = [];
let headers = [];

let CLIENT_COL = null;
let CLASIF2_COL = null;
let GCOC_COL = null;

let chartMesInstance = null;
let chartTendenciaInstance = null;

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

  sel.value = values.includes(prev) ? prev : "";
}

function uniqSorted(arr) {
  return [...new Set(arr.map(clean).filter(Boolean))].sort((a,b) => a.localeCompare(b, "es"));
}

/* ============================
   FILTERS
============================ */
function getSel(id) {
  return document.getElementById(id)?.value || "";
}

function rowsByClienteBase() {
  const c = getSel("clienteSelect");
  if (!c) return data;
  return data.filter(r => clean(r[CLIENT_COL]) === c);
}

function filteredRowsNoMes() {
  let rows = rowsByClienteBase();

  const c2 = getSel("clasif2Select");
  if (c2 && CLASIF2_COL) rows = rows.filter(r => clean(r[CLASIF2_COL]) === c2);

  const gc = getSel("gcocSelect");
  if (gc && GCOC_COL) rows = rows.filter(r => clean(r[GCOC_COL]) === gc);

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
  const hint = document.getElementById("clasif2Hint");
  if (!CLASIF2_COL) {
    if (hint) hint.textContent = "Columna: (no encontrada)";
    const sel = document.getElementById("clasif2Select");
    if (sel) { sel.disabled = true; sel.innerHTML = `<option value="">Todos</option>`; }
    return;
  }
  if (hint) hint.textContent = `Columna: ${CLASIF2_COL}`;
  const vals = uniqSorted(rowsBase.map(r => r[CLASIF2_COL]));
  const sel = document.getElementById("clasif2Select");
  if (sel) sel.disabled = false;
  fillSelect("clasif2Select", vals, "Todos");
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
  fillSelect("gcocSelect", vals, "Todos");
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

  // regla: AT > 80% => rojo
  const elAT = document.getElementById("kpiATpct");
  if (elAT) elAT.style.color = (pctAT > 0.8) ? "#e53935" : "";

  // demora promedio (general) entero
  const avgG = avgDelay(rows);
  setText("kpiDemoraAvg", isNaN(avgG) ? "-" : (Math.round(avgG) + " d"));

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

  // demora promedio del mes seleccionado entero
  const mesRows = rows.filter(r => getMonthKeyFromRow(r) === mes);
  const avgM = avgDelay(mesRows);
  setText("kpiDemoraMes", isNaN(avgM) ? "-" : (Math.round(avgM) + " d"));

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

  // reglas colores delta
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
   CHARTS (Chart.js)
============================ */
function ensureCanvas(containerId, canvasId){
  const container = document.getElementById(containerId);
  if (!container) return null;

  let canvas = document.getElementById(canvasId);
  if (!canvas) {
    container.innerHTML = `<canvas id="${canvasId}" style="width:100%;height:100%"></canvas>`;
    canvas = document.getElementById(canvasId);
  }
  return canvas;
}

function buildChartMes(rows) {
  const agg = new Map();
  const monthsSet = new Set();

  for (const r of rows) {
    const d = parseDateAny(r[FECHA_COL]);
    if (!d) continue;

    const mk = monthKey(d);
    monthsSet.add(mk);

    if (!agg.has(mk)) agg.set(mk, { at: 0, ft: 0, no: 0, demSum: 0, demCnt: 0 });
    const c = agg.get(mk);

    c.at += toNumber(r[AT_COL]);
    c.ft += toNumber(r[FT_COL]);
    c.no += toNumber(r[NO_COL]);

    const dem = toNumAny(r[DEMORA_COL]);
    if (!isNaN(dem)) { c.demSum += dem; c.demCnt += 1; }
  }

  const months = [...monthsSet].sort();
  const qAT = months.map(m => agg.get(m)?.at ?? 0);
  const qFT = months.map(m => agg.get(m)?.ft ?? 0);
  const qNO = months.map(m => agg.get(m)?.no ?? 0);

  const pAT = qAT.map((v,i)=>{ const t=qAT[i]+qFT[i]+qNO[i]; return t? (v/t)*100 : 0; });
  const pFT = qFT.map((v,i)=>{ const t=qAT[i]+qFT[i]+qNO[i]; return t? (v/t)*100 : 0; });
  const pNO = qNO.map((v,i)=>{ const t=qAT[i]+qFT[i]+qNO[i]; return t? (v/t)*100 : 0; });

  const avgDem = months.map(m => {
    const c = agg.get(m);
    return (c && c.demCnt) ? (c.demSum / c.demCnt) : null;
  });

  const canvas = ensureCanvas("chartMes", "chartMesCanvas");
  if (!canvas || !window.Chart) return;

  if (chartMesInstance) chartMesInstance.destroy();

  Chart.register(ChartDataLabels);

  chartMesInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        {
          label: "Entregados AT",
          data: pAT,
          backgroundColor: COLORS.at,
          stack: "s1",
          _qty: qAT,
          datalabels: {
            anchor: "center",
            align: "center",
            clamp: true,
            color: "#fff",
            font: { weight: "700", size: 11 },
            formatter: (v, ctx) => {
              const i = ctx.dataIndex;
              const q = ctx.dataset._qty?.[i] ?? 0;
              if (!q) return "";
              return `${fmtInt(q)} (${Math.round(v)}%)`;
            }
          }
        },
        {
          label: "Entregados FT",
          data: pFT,
          backgroundColor: COLORS.ft,
          stack: "s1",
          _qty: qFT,
          datalabels: {
            anchor: "center",
            align: "center",
            clamp: true,
            color: "#111",
            font: { weight: "800", size: 11 },
            formatter: (v, ctx) => {
              const i = ctx.dataIndex;
              const q = ctx.dataset._qty?.[i] ?? 0;
              if (!q) return "";
              return `${fmtInt(q)} (${Math.round(v)}%)`;
            }
          }
        },
        {
          label: "No entregados",
          data: pNO,
          backgroundColor: COLORS.no,
          stack: "s1",
          _qty: qNO,
          datalabels: {
            anchor: "center",
            align: "center",
            clamp: true,
            color: "#fff",
            font: { weight: "700", size: 11 },
            formatter: (v, ctx) => {
              const i = ctx.dataIndex;
              const q = ctx.dataset._qty?.[i] ?? 0;
              if (!q) return "";
              return `${fmtInt(q)} (${Math.round(v)}%)`;
            }
          }
        },
        {
          type: "line",
          label: "Promedio días de demora",
          data: avgDem,
          yAxisID: "y2",
          order: 99,
          borderColor: COLORS.demora,
          borderWidth: 3,
          backgroundColor: COLORS.demora,
          pointRadius:  4,
          pointHoverRadius:  6,
          tension: 0.25,
          datalabels: {
            anchor: "end",
            align: "top",
            offset: 6,
            color: COLORS.text,
            font: { weight: "800", size: 11 },
            formatter: (v) => (v==null || isNaN(v)) ? "" : `${Math.round(v)} d`
          }
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 6, right: 10, bottom: 20, left: 10 } },
      plugins: {
        legend: {
          position: "bottom",
          align: "center",
          labels: { boxWidth: 14, boxHeight: 14, color: COLORS.text, font: { weight: "700" } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y;
              if (ctx.dataset.type === "line") return `${ctx.dataset.label}: ${_fmtNum1(v)} días`;
              const i = ctx.dataIndex;
              const q = ctx.dataset._qty?.[i] ?? 0;
              return `${ctx.dataset.label}: ${fmtInt(q)} (${_fmtNum1(v)}%)`;
            }
          }
        }
      },
      scales: {
        x: { stacked: true, ticks: { color: COLORS.text }, grid: { display: false } },
        y: {
          stacked: true,
          min: 0,
          max: 100,
          ticks: {
            color: COLORS.text,
            callback: (v) => `${v}%`
          },
          grid: { color: COLORS.grid }
        },
        y2: {
          position: "right",
          grid: { display: false },
          ticks: { color: COLORS.text },
          title: { display: true, text: "Días de demora", color: COLORS.text, font: { weight: "800" } }
        }
      }
    }
  });
}

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
    const c = agg.get(m); const t = (c?.at ?? 0) + (c?.ft ?? 0) + (c?.no ?? 0);
    return t ? ((c.at ?? 0) / t) * 100 : 0;
  });

  const pFT = months.map(m => {
    const c = agg.get(m); const t = (c?.at ?? 0) + (c?.ft ?? 0) + (c?.no ?? 0);
    return t ? ((c.ft ?? 0) / t) * 100 : 0;
  });

  const pNO = months.map(m => {
    const c = agg.get(m); const t = (c?.at ?? 0) + (c?.ft ?? 0) + (c?.no ?? 0);
    return t ? ((c.no ?? 0) / t) * 100 : 0;
  });

  const canvas = ensureCanvas("chartTendencia", "chartTendenciaCanvas");
  if (!canvas || !window.Chart) return;

  if (chartTendenciaInstance) chartTendenciaInstance.destroy();

  Chart.register(ChartDataLabels);

  chartTendenciaInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels: months,
      datasets: [
        {
          label: "A Tiempo %",
          data: pAT,
          borderColor: COLORS.at,
          backgroundColor: COLORS.at,
          pointRadius: 3,
          tension: 0.25,
          datalabels: {
            anchor: "end",
            align: "top",
            offset: 4,
            color: COLORS.text,
            font: { weight: "800", size: 11 },
            formatter: (v) => _fmtPct(v)
          }
        },
        {
          label: "Fuera Tiempo %",
          data: pFT,
          borderColor: COLORS.ft,
          backgroundColor: COLORS.ft,
          pointRadius: 3,
          tension: 0.25,
          datalabels: {
            anchor: "end",
            align: "top",
            offset: 4,
            color: COLORS.text,
            font: { weight: "800", size: 11 },
            formatter: (v) => _fmtPct(v)
          }
        },
        {
          label: "No Entregados %",
          data: pNO,
          borderColor: COLORS.no,
          backgroundColor: COLORS.no,
          pointRadius: 3,
          tension: 0.25,
          datalabels: {
            anchor: "end",
            align: "top",
            offset: 4,
            color: COLORS.text,
            font: { weight: "800", size: 11 },
            formatter: (v) => _fmtPct(v)
          }
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 8, right: 10, bottom: 20, left: 10 } },
      plugins: {
        legend: {
          position: "bottom",
          align: "center",
          labels: { boxWidth: 14, boxHeight: 14, color: COLORS.text, font: { weight: "700" } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${_fmtNum1(ctx.parsed.y)}%`
          }
        }
      },
      scales: {
        x: { ticks: { color: COLORS.text }, grid: { display: false } },
        y: {
          min: 0,
          max: 100,
          ticks: { color: COLORS.text, callback: (v) => `${v}%` },
          grid: { color: COLORS.grid },
          title: { display: true, text: "%", color: COLORS.text, font: { weight: "800" } }
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
   APPLY ALL
============================ */
function applyAll() {
  const baseCliente = rowsByClienteBase();
  renderClasif2(baseCliente);

  const baseParaGc = (() => {
    let r = baseCliente;
    const c2 = getSel("clasif2Select");
    if (c2 && CLASIF2_COL) r = r.filter(x => clean(x[CLASIF2_COL]) === c2);
    return r;
  })();
  renderGcoc(baseParaGc);

  const rows = filteredRowsNoMes();
  const months = buildMesSelect(rows);

  updateKPIsGeneral(rows);
  updateKPIsMonthly(rows, months);

  buildChartMes(rows);
  buildChartTendencia(rows);
}

/* ============================
   INIT
============================ */
window.addEventListener("DOMContentLoaded", () => {
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

      CLASIF2_COL = CLASIF2_CANDIDATES.find(c => headers.includes(c)) || null;
      GCOC_COL = GCOC_CANDIDATES.find(c => headers.includes(c)) || null;

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

      document.getElementById("clienteSelect")?.addEventListener("change", () => {
        const c2 = document.getElementById("clasif2Select");
        if (c2) c2.value = "";
        const gc = document.getElementById("gcocSelect");
        if (gc) gc.value = "";
        applyAll();
      });

      document.getElementById("clasif2Select")?.addEventListener("change", () => {
        const gc = document.getElementById("gcocSelect");
        if (gc) gc.value = "";
        applyAll();
      });

      document.getElementById("gcocSelect")?.addEventListener("change", applyAll);

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

        const cols = headers.slice(); // exportar TODAS las columnas

        const cliente = safeFilePart(getSel("clienteSelect") || "Todos");
        const c2 = safeFilePart(getSel("clasif2Select") || "Todos");
        const gc = safeFilePart(getSel("gcocSelect") || "Todos");
        const mes = safeFilePart(getSel("mesSelect") || "Todos");

        const filename = `NO_ENTREGADOS_${cliente}_${c2}_${gc}_${mes}.csv`;
        downloadCSV(filename, noRows, cols);
      });

      setHTML("msg", "");
    })
    .catch(err => {
      console.error(err);
      showError("Error cargando CSV. Revisá el nombre del archivo y que esté en la raíz del repo.");
    });
});
