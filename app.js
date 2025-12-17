/* ============================
   CONFIG
============================ */
const csvUrl = "CUMPLIMIENTO_2025.csv";
const DELIM = ";";

const FECHA_COL = "FECHA ENTREGA ESPERADA";
const CLIENT_CANDIDATES = ["CLIENTE / OBRA", "CLIENTE NRO.", "CLIENTE"];

const AT_COL = "ENTREGADOS AT";
const FT_COL = "ENTREGADOS FT";
const NO_COL = "NO ENTREGADOS";

/* ============================
   COLORES (igual a CSS)
============================ */
const COLORS = {
  blue:  "#1d4ed8",
  green: "#16a34a",
  amber: "#f59e0b",
  red:   "#ef4444",
  grid:  "rgba(15, 23, 42, 0.08)",
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

function safeFilePart(s) {
  return clean(s).replace(/[^\w\-]+/g, "_").slice(0, 80) || "Todos";
}

/* ============================
   DATE PARSING
   - dd/mm/yyyy (principal)
   - dd-mm-yyyy
   - yyyy-mm-dd
============================ */
function parseDateAny(s) {
  const t = clean(s);
  if (!t) return null;

  // dd/mm/yyyy or dd-mm-yyyy
  let m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const y = parseInt(m[3], 10);
    if (!y || !mo || !d) return null;
    return new Date(y, mo - 1, d);
  }

  // yyyy-mm-dd
  m = t.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    if (!y || !mo || !d) return null;
    return new Date(y, mo - 1, d);
  }

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
   UI
============================ */
function showError(msg) {
  const el = document.getElementById("msg");
  if (el) el.innerHTML = `<div class="error">${msg}</div>`;
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
  return c ? data.filter((r) => clean(r[CLIENT_COL]) === c) : data;
}

function filteredRowsByClienteYMes() {
  const rowsCliente = filteredRowsByCliente();
  const mes = document.getElementById("mesSelect")?.value || "";
  if (!mes) return rowsCliente;
  return rowsCliente.filter((r) => getMonthKeyFromRow(r) === mes);
}

/* ============================
   SELECTS
============================ */
function renderClientes() {
  const sel = document.getElementById("clienteSelect");
  if (!sel) return;

  sel.querySelectorAll("option:not([value=''])").forEach((o) => o.remove());

  const clientes = [...new Set(data.map((r) => clean(r[CLIENT_COL])).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"));

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
   KPI calculations
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
   DELTAS (con tolerancia)
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

  function setDelta(el, text, cls) {
    if (!el) return;
    el.classList.remove("delta-good", "delta-bad", "delta-neutral");
    if (cls) el.classList.add(cls);
    el.textContent = text;
  }

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
  let clsAT = "delta-neutral";
  if (dAT.diff > 0) clsAT = "delta-good";
  else if (dAT.diff < 0) clsAT = "delta-bad";
  else clsAT = "delta-good";

  let clsFT = "delta-neutral";
  if (dFT.diff > 0) clsFT = "delta-bad";
  else if (dFT.diff < 0) clsFT = "delta-good";
  else clsFT = "delta-bad"; // se mantiene = rojo

  let clsNO = "delta-neutral";
  if (dNO.diff > 0) clsNO = "delta-bad";
  else clsNO = "delta-good"; // baja o se mantiene = verde

  setDelta(atSub, `Cant: ${fmtInt(cur.at)} · ${dAT.text}`, clsAT);
  setDelta(ftSub, `Cant: ${fmtInt(cur.ft)} · ${dFT.text}`, clsFT);
  setDelta(noSub, `Cant: ${fmtInt(cur.no)} · ${dNO.text}`, clsNO);
}

/* ============================
   CHART DEFAULTS (Power BI feel)
============================ */
function applyChartDefaults() {
  Chart.defaults.color = COLORS.text;
  Chart.defaults.font.family = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
  Chart.defaults.font.weight = "700";

  Chart.defaults.plugins.tooltip.backgroundColor = "rgba(255,255,255,0.96)";
  Chart.defaults.plugins.tooltip.titleColor = COLORS.text;
  Chart.defaults.plugins.tooltip.bodyColor = COLORS.text;
  Chart.defaults.plugins.tooltip.borderColor = "rgba(2,8,20,.14)";
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.displayColors = true;
  Chart.defaults.plugins.tooltip.padding = 10;

  Chart.defaults.interaction.mode = "index";
  Chart.defaults.interaction.intersect = false;
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
  const qAT = months.map((m) => agg.get(m)?.at ?? 0);
  const qFT = months.map((m) => agg.get(m)?.ft ?? 0);
  const qNO = months.map((m) => agg.get(m)?.no ?? 0);

  const pAT = qAT.map((v, i) => {
    const t = qAT[i] + qFT[i] + qNO[i];
    return t ? (v / t) * 100 : 0;
  });
  const pFT = qFT.map((v, i) => {
    const t = qAT[i] + qFT[i] + qNO[i];
    return t ? (v / t) * 100 : 0;
  });
  const pNO = qNO.map((v, i) => {
    const t = qAT[i] + qFT[i] + qNO[i];
    return t ? (v / t) * 100 : 0;
  });

  const canvas = document.getElementById("chartMes");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (chartMes) chartMes.destroy();

  chartMes = new Chart(ctx, {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        { label: "Entregados AT", data: pAT, _q: qAT, stack: "s", backgroundColor: COLORS.green },
        { label: "Entregados FT", data: pFT, _q: qFT, stack: "s", backgroundColor: COLORS.amber },
        { label: "No entregados", data: pNO, _q: qNO, stack: "s", backgroundColor: COLORS.red  },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { color: "transparent" }, ticks: { color: COLORS.muted } },
        y: {
          stacked: true, beginAtZero: true, max: 100,
          grid: { color: COLORS.grid },
          ticks: { callback: (v) => v + "%", color: COLORS.muted }
        },
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (c) => {
              const pct = (c.parsed.y ?? 0).toFixed(1).replace(".", ",");
              const qty = c.dataset._q?.[c.dataIndex] ?? 0;
              return ` ${c.dataset.label}: ${fmtInt(qty)} (${pct}%)`;
            },
          },
        },
        datalabels: {
          formatter: (v, ctx) => {
            const qty = ctx.dataset._q?.[ctx.dataIndex] ?? 0;
            if (!qty || v < 6) return "";
            return `${fmtInt(qty)} (${v.toFixed(0)}%)`;
          },
          anchor: "center",
          align: "center",
          clamp: true,
          color: "#ffffff",
          font: { weight: "900", size: 11 }
        },
      },
    },
    plugins: [ChartDataLabels],
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
  const pAT = months.map((m) => {
    const c = agg.get(m); const t = c.at + c.ft + c.no;
    return t ? (c.at / t) * 100 : 0;
  });
  const pFT = months.map((m) => {
    const c = agg.get(m); const t = c.at + c.ft + c.no;
    return t ? (c.ft / t) * 100 : 0;
  });
  const pNO = months.map((m) => {
    const c = agg.get(m); const t = c.at + c.ft + c.no;
    return t ? (c.no / t) * 100 : 0;
  });

  const canvas = document.getElementById("chartTendencia");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (chartTendencia) chartTendencia.destroy();

  chartTendencia = new Chart(ctx, {
    type: "line",
    data: {
      labels: months,
      datasets: [
        { label: "A Tiempo %", data: pAT, borderColor: COLORS.green, backgroundColor: COLORS.green,
          tension: 0, pointRadius: 4, pointHoverRadius: 6, pointBorderWidth: 2 },
        { label: "Fuera Tiempo %", data: pFT, borderColor: COLORS.amber, backgroundColor: COLORS.amber,
          tension: 0, pointRadius: 4, pointHoverRadius: 6, pointBorderWidth: 2 },
        { label: "No Entregados %", data: pNO, borderColor: COLORS.red, backgroundColor: COLORS.red,
          tension: 0, pointRadius: 4, pointHoverRadius: 6, pointBorderWidth: 2 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: "transparent" }, ticks: { color: COLORS.muted } },
        y: {
          beginAtZero: true, max: 100,
          grid: { color: COLORS.grid },
          ticks: { callback: (v) => v + "%", color: COLORS.muted }
        },
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
          font: { size: 11, weight: "900" },
        },
      },
    },
    plugins: [ChartDataLabels],
  });
}

/* ============================
   EXPORT CSV (NO ENTREGADOS)
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

  fetch(csvUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`No pude abrir ${csvUrl} (HTTP ${r.status})`);
      return r.text();
    })
    .then((text) => {
      const m = parseDelimited(text, DELIM);
      if (!m.length || m.length < 2) {
        showError("El CSV está vacío o no tiene filas.");
        return;
      }

      headers = m[0].map(clean);

      CLIENT_COL = CLIENT_CANDIDATES.find((c) => headers.includes(c));
      if (!CLIENT_COL) {
        showError("No encuentro columna CLIENTE. Probé: " + CLIENT_CANDIDATES.join(" / "));
        return;
      }

      const required = [FECHA_COL, AT_COL, FT_COL, NO_COL];
      const missing = required.filter((c) => !headers.includes(c));
      if (missing.length) {
        showError("Faltan columnas en el CSV: " + missing.join(", "));
        return;
      }

      data = m.slice(1).map((r) => {
        const o = {};
        headers.forEach((h, i) => (o[h] = clean(r[i])));
        return o;
      });

      const hint = document.getElementById("clienteHint");
      if (hint) hint.textContent = `Columna cliente: ${CLIENT_COL}`;

      renderClientes();
      applyAll();

      document.getElementById("clienteSelect")?.addEventListener("change", () => {
        applyAll();
      });

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

        const cols = [CLIENT_COL, FECHA_COL, AT_COL, FT_COL, NO_COL];

        const cliente = safeFilePart(document.getElementById("clienteSelect")?.value || "Todos");
        const mes = safeFilePart(document.getElementById("mesSelect")?.value || "Todos");
        const filename = `NO_ENTREGADOS_${cliente}_${mes}.csv`;

        downloadCSV(filename, noRows, cols);
      });
    })
    .catch((err) => {
      console.error(err);
      showError("Error cargando CSV. Revisá nombre del archivo y que esté en la raíz del repo.");
    });
});
