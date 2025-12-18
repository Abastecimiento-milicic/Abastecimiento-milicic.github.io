/* ============================
   CONFIG
============================ */
const csvUrl = "CUMPLIMIENTO_2025.csv";  // nombre EXACTO en tu repo
const DELIM = ";";

const FECHA_COL = "FECHA ENTREGA ESPERADA";
const CLIENT_CANDIDATES = ["CLIENTE / OBRA", "CLIENTE NRO.", "CLIENTE"];

const AT_COL = "ENTREGADOS AT";
const FT_COL = "ENTREGADOS FT";
const NO_COL = "NO ENTREGADOS";

const DEMORA_COL = "DIAS DE DEMORA"; // <-- NUEVO

/* ============================
   COLORES (match KPIs)
============================ */
const COLORS = {
  blue:  "#1d4ed8",
  green: "#16a34a",
  greenDark: "#0a5a2a",  // <-- 75% line
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
  const el = document.getElementById("msg");
  if (el) el.innerHTML = `<div class="error">${msg}</div>`;
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
   FILTERS
============================ */
function filteredRowsByCliente() {
  const sel = document.getElementById("clienteSelect");
  const c = sel ? sel.value : "";
  return c ? data.filter(r => clean(r[CLIENT_COL]) === c) : data;
}

function filteredRowsByClienteYMes() {
  const rows = filteredRowsByCliente();
  const mes = document.getElementById("mesSelect")?.value || "";
  if (!mes) return rows;
  return rows.filter(r => getMonthKeyFromRow(r) === mes);
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

  const idx = months.indexOf(mes);
  const prevMes = idx > 0 ? months[idx - 1] : null;

  const cur = calcMonthTotals(rows, mes);
  const prev = prevMes ? calcMonthTotals(rows, prevMes) : null;

  document.getElementById("kpiTotalMes").textContent = fmtInt(cur.total);
  document.getElementById("kpiATmes").textContent = fmtPct01(cur.pctAT);
  document.getElementById("kpiFTmes").textContent = fmtPct01(cur.pctFT);
  document.getElementById("kpiNOmes").textContent = fmtPct01(cur.pctNO);

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
   CHART DEFAULTS (Power BI hover)
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
   CHART 1: 100% stacked bar + líneas constantes + demora promedio
============================ */
function buildChartMes(rows) {
  const agg = new Map();
  const monthsSet = new Set();

  for (const r of rows) {
    const d = parseDateAny(r[FECHA_COL]);
    if (!d) continue;

    const mk = monthKey(d);
    monthsSet.add(mk);

    if (!agg.has(mk)) agg.set(mk, { at: 0, ft: 0, no: 0, demoraSum: 0, demoraCnt: 0 });
    const c = agg.get(mk);

    c.at += toNumber(r[AT_COL]);
    c.ft += toNumber(r[FT_COL]);
    c.no += toNumber(r[NO_COL]);

    const dd = toNumber(r[DEMORA_COL]);
    if (dd > 0 || clean(r[DEMORA_COL]) !== "") {
      c.demoraSum += dd;
      c.demoraCnt += 1;
    }
  }

  const months = [...monthsSet].sort();
  const qAT = months.map(m => agg.get(m)?.at ?? 0);
  const qFT = months.map(m => agg.get(m)?.ft ?? 0);
  const qNO = months.map(m => agg.get(m)?.no ?? 0);

  const pAT = qAT.map((v,i)=>{ const t=qAT[i]+qFT[i]+qNO[i]; return t? (v/t)*100 : 0; });
  const pFT = qFT.map((v,i)=>{ const t=qAT[i]+qFT[i]+qNO[i]; return t? (v/t)*100 : 0; });
  const pNO = qNO.map((v,i)=>{ const t=qAT[i]+qFT[i]+qNO[i]; return t? (v/t)*100 : 0; });

  const demoraAvg = months.map(m => {
    const c = agg.get(m);
    if (!c || !c.demoraCnt) return 0;
    return c.demoraSum / c.demoraCnt;
  });

  // Escala derecha: incluir línea fija de 7
  const maxDemora = Math.max(7, ...demoraAvg, 0);
  const suggestedMaxY2 = Math.ceil(maxDemora * 1.25);

  // Líneas constantes
  const line75 = months.map(() => 75); // eje izquierdo (%)
  const line7  = months.map(() => 7);  // eje derecho (días)

  const canvas = document.getElementById("chartMes");
  if (!canvas) return;

  if (chartMes) chartMes.destroy();

  chartMes = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        // barras
        { label: "Entregados AT", data: pAT, _q: qAT, stack:"s", backgroundColor: COLORS.green, yAxisID: "y" },
        { label: "Entregados FT", data: pFT, _q: qFT, stack:"s", backgroundColor: COLORS.amber, yAxisID: "y" },
        { label: "No entregados", data: pNO, _q: qNO, stack:"s", backgroundColor: COLORS.red, yAxisID: "y" },

        // 75% constante (verde oscuro, punteada) eje izquierdo
        {
          type: "line",
          label: "Meta 75%",
          data: line75,
          yAxisID: "y",
          borderColor: COLORS.greenDark,
          borderWidth: 2,
          borderDash: [6, 6],
          pointRadius: 0,
          tension: 0,
          datalabels: { display: false }
        },

        // Demora promedio (eje derecho)
        {
          type: "line",
          label: "Prom. días de demora",
          data: demoraAvg,
          yAxisID: "y2",
          borderColor: "#ff00b8",   // similar al magenta de tu ejemplo Power BI
          backgroundColor: "#ff00b8",
          borderWidth: 3,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0,
          datalabels: {
            align: "top",
            anchor: "end",
            formatter: (v) => v ? Math.round(v).toString() : "",
            color: COLORS.text,
            font: { size: 11, weight: "900" }
          }
        },

        // Línea constante 7 (roja punteada) eje derecho
        {
          type: "line",
          label: "Límite 7 días",
          data: line7,
          yAxisID: "y2",
          borderColor: COLORS.red,
          borderWidth: 2,
          borderDash: [6, 6],
          pointRadius: 0,
          tension: 0,
          datalabels: { display: false }
        },
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
        },
        y2: {
          position: "right",
          beginAtZero: true,
          suggestedMax: suggestedMaxY2,
          grid: { drawOnChartArea: false }, // no ensucia la grilla del %
          ticks: { color: COLORS.red }, // como en Power BI (eje derecho rojo)
          title: { display: true, text: "días de demora", color: COLORS.red, font: { weight: "900" } }
        }
      },
      plugins: {
        legend: { position:"bottom" },
        tooltip: {
          callbacks: {
            label: (c) => {
              // Barras
              if (c.dataset.type !== "line" && c.dataset.stack) {
                const pct = (c.parsed.y ?? 0).toFixed(1).replace(".", ",");
                const qty = c.dataset._q?.[c.dataIndex] ?? 0;
                return ` ${c.dataset.label}: ${fmtInt(qty)} (${pct}%)`;
              }
              // Líneas
              if (c.dataset.yAxisID === "y2") {
                return ` ${c.dataset.label}: ${Number(c.parsed.y ?? 0).toFixed(1).replace(".", ",")} días`;
              }
              return ` ${c.dataset.label}: ${Number(c.parsed.y ?? 0).toFixed(1).replace(".", ",")}%`;
            }
          }
        },
        datalabels: {
          // etiquetas SOLO en barras (no en líneas) y solo si el segmento es “visible”
          formatter: (v, ctx) => {
            const isLine = ctx.dataset.type === "line";
            if (isLine) return "";

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
   CHART 2: Trend lines (rectas + etiquetas %)
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
        tooltip: {
          callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1).replace(".", ",")}%` }
        },
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
   APPLY ALL
============================ */
function applyAll() {
  const rows = filteredRowsByCliente();
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
  applyChartDefaults();

  const d = new Date();
  document.getElementById("lastUpdate").textContent =
    `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;

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

      const required = [FECHA_COL, AT_COL, FT_COL, NO_COL, DEMORA_COL];
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

      document.getElementById("clienteHint").textContent = `Columna cliente: ${CLIENT_COL}`;

      renderClientes();
      applyAll();

      document.getElementById("clienteSelect")?.addEventListener("change", applyAll);

      document.getElementById("mesSelect")?.addEventListener("change", () => {
        const rows = filteredRowsByCliente();
        const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))].sort();
        updateKPIsMonthly(rows, months);
      });

      document.getElementById("btnDownloadNO")?.addEventListener("click", () => {
        const rowsFilt = filteredRowsByClienteYMes();
        const noRows = getNoEntregadosRows(rowsFilt);

        if (!noRows.length) {
          alert("No hay NO ENTREGADOS para el filtro actual.");
          return;
        }

        const cols = [CLIENT_COL, FECHA_COL, AT_COL, FT_COL, NO_COL, DEMORA_COL];

        const cliente = safeFilePart(document.getElementById("clienteSelect")?.value || "Todos");
        const mes = safeFilePart(document.getElementById("mesSelect")?.value || "Todos");
        const filename = `NO_ENTREGADOS_${cliente}_${mes}.csv`;

        downloadCSV(filename, noRows, cols);
      });
    })
    .catch(err => {
      console.error(err);
      showError("Error cargando CSV. Revisá el nombre del archivo y que esté en la raíz del repo.");
    });
});



