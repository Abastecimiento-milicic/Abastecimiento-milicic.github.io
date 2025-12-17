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
const clean = (v) => (v ?? "").toString().trim();

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
  const d = parseInt(p[0], 10);
  const m = parseInt(p[1], 10);
  const y = parseInt(p[2], 10);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthKeyFromRow(r) {
  const d = parseDateDMY(r[FECHA_COL]);
  return d ? monthKey(d) : null;
}

function fmtInt(n) {
  return Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtPct01(x) {
  if (!isFinite(x)) return "-";
  return (x * 100).toFixed(1).replace(".", ",") + "%";
}

function fmtDelta01(d) {
  if (!isFinite(d)) return "Sin mes anterior";
  const arrow = d >= 0 ? "▲" : "▼";
  return `${arrow} ${(Math.abs(d) * 100).toFixed(1).replace(".", ",")}% vs mes anterior`;
}

function showError(msg) {
  const el = document.getElementById("msg");
  if (el) el.innerHTML = `<div class="error">${msg}</div>`;
}

function safeFilePart(s) {
  return clean(s).replace(/[^\w\-]+/g, "_").slice(0, 80) || "Todos";
}

/* ============================
   EXPORT (CSV para Excel)
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
   CSV PARSER (soporta comillas)
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
   FILTROS
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
  return rowsCliente.filter(r => getMonthKeyFromRow(r) === mes);
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
   KPIs
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
  const pctTOT = total ? (at + ft) / total : NaN;

  return { at, ft, no, total, pctAT, pctFT, pctNO, pctTOT };
}

function updateKPIsMonthly(rows, months) {
  const mes = document.getElementById("mesSelect")?.value || "";
  if (!mes) return;

  const idx = months.indexOf(mes);
  const prevMes = idx > 0 ? months[idx - 1] : null;

  const cur = calcMonthTotals(rows, mes);
  const prev = prevMes ? calcMonthTotals(rows, prevMes) : null;

  document.getElementById("kpiATmes").textContent = fmtPct01(cur.pctAT);
  document.getElementById("kpiATmesSub").textContent =
    `Cant: ${fmtInt(cur.at)} · ${prev ? fmtDelta01(cur.pctAT - prev.pctAT) : "Sin mes anterior"}`;

  document.getElementById("kpiFTmes").textContent = fmtPct01(cur.pctFT);
  document.getElementById("kpiFTmesSub").textContent =
    `Cant: ${fmtInt(cur.ft)} · ${prev ? fmtDelta01(cur.pctFT - prev.pctFT) : "Sin mes anterior"}`;

  document.getElementById("kpiNOmes").textContent = fmtPct01(cur.pctNO);
  document.getElementById("kpiNOmesSub").textContent =
    `Cant: ${fmtInt(cur.no)} · ${prev ? fmtDelta01(cur.pctNO - prev.pctNO) : "Sin mes anterior"}`;

  document.getElementById("kpiTOTmes").textContent = fmtPct01(cur.pctTOT);
  document.getElementById("kpiTOTmesSub").textContent =
    `Cant: ${fmtInt(cur.at + cur.ft)} · ${prev ? fmtDelta01(cur.pctTOT - prev.pctTOT) : "Sin mes anterior"}`;
}

/* ============================
   CHART 1: 100% apilado
============================ */
function buildChartMes(rows) {
  const agg = new Map();
  const monthsSet = new Set();

  for (const r of rows) {
    const d = parseDateDMY(r[FECHA_COL]);
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
        { label: "Entregados AT", data: pAT, _q: qAT, stack: "s" },
        { label: "Entregados FT", data: pFT, _q: qFT, stack: "s" },
        { label: "No entregados", data: pNO, _q: qNO, stack: "s" },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, max: 100, ticks: { callback: (v) => v + "%" } },
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            label: (c) => {
              const pct = (c.parsed.y ?? 0).toFixed(1).replace(".", ",");
              const qty = c.dataset._q?.[c.dataIndex] ?? 0;
              return `${c.dataset.label}: ${fmtInt(qty)} (${pct}%)`;
            },
          },
        },
        datalabels: {
          formatter: (v, ctx) => {
            const qty = ctx.dataset._q?.[ctx.dataIndex] ?? 0;
            if (!qty || v < 4) return "";
            return `${fmtInt(qty)} (${v.toFixed(1).replace(".", ",")}%)`;
          },
          anchor: "center",
          align: "center",
          clamp: true,
        },
      },
    },
    plugins: [ChartDataLabels],
  });
}

/* ============================
   CHART 2: Tendencia
============================ */
function buildChartTendencia(rows) {
  const agg = new Map();
  const monthsSet = new Set();

  for (const r of rows) {
    const d = parseDateDMY(r[FECHA_COL]);
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
    const c = agg.get(m);
    const t = c.at + c.ft + c.no;
    return t ? (c.at / t) * 100 : 0;
  });
  const pFT = months.map((m) => {
    const c = agg.get(m);
    const t = c.at + c.ft + c.no;
    return t ? (c.ft / t) * 100 : 0;
  });
  const pNO = months.map((m) => {
    const c = agg.get(m);
    const t = c.at + c.ft + c.no;
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
        { label: "A Tiempo %", data: pAT, tension: 0, pointRadius: 4 },
        { label: "Fuera Tiempo %", data: pFT, tension: 0, pointRadius: 4 },
        { label: "No Entregados %", data: pNO, tension: 0, pointRadius: 4 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + "%" } },
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(1).replace(".", ",")}%`,
          },
        },
        datalabels: {
          align: "top",
          anchor: "end",
          offset: 4,
          formatter: (v) => `${Number(v).toFixed(1).replace(".", ",")}%`,
          font: { size: 11, weight: "bold" },
        },
      },
    },
    plugins: [ChartDataLabels],
  });
}

/* ============================
   APLICAR TODO
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
        showError("No encuentro columna CLIENTE (probé: " + CLIENT_CANDIDATES.join(" / ") + ")");
        return;
      }

      const required = [FECHA_COL, AT_COL, FT_COL, NO_COL];
      const missing = required.filter((c) => !headers.includes(c));
      if (missing.length) {
        showError("Faltan columnas: " + missing.join(", "));
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

      document.getElementById("clienteSelect").addEventListener("change", () => {
        applyAll();
      });

      document.getElementById("mesSelect").addEventListener("change", () => {
        const rows = filteredRowsByCliente();
        const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))].sort();
        updateKPIsMonthly(rows, months);
      });

      // ✅ Botón descarga: respeta Cliente + Mes
      const btn = document.getElementById("btnDownloadNO");
      if (btn) {
        btn.addEventListener("click", () => {
          const rowsFilt = filteredRowsByClienteYMes();
          const noRows = getNoEntregadosRows(rowsFilt);

          if (!noRows.length) {
            alert("No hay NO ENTREGADOS para el filtro actual.");
            return;
          }

          // Columnas a exportar (podés agregar más)
          const cols = [CLIENT_COL, FECHA_COL, AT_COL, FT_COL, NO_COL];

          const cliente = safeFilePart(document.getElementById("clienteSelect")?.value || "Todos");
          const mes = safeFilePart(document.getElementById("mesSelect")?.value || "Todos");
          const filename = `NO_ENTREGADOS_${cliente}_${mes}.csv`;

          downloadCSV(filename, noRows, cols);
        });
      }
    })
    .catch((err) => {
      console.error(err);
      showError("Error cargando CSV. Revisá que el nombre coincida y esté en la raíz del repo.");
    });
});
