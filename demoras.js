/* ============================
   CONFIG
============================ */
const csvUrl = "DEMORAS.csv";
const DELIM = ";";

// posibles nombres de columnas
const CLIENT_CANDIDATES = ["CLIENTE", "CLIENTE / OBRA", "CLIENTE / OBRA ", "OBRA", "ALMACEN", "ALMACÉN"];
const MES_CANDIDATES = ["MES", "Mes", "MES DEMORA", "MES ENTREGA", "MES_ENTREGA", "MES DEMORAS"];
const FECHA_CANDIDATES = ["FECHA", "FECHA ENTREGA", "FECHA ENTREGA ESPERADA", "FECHA OC", "FECHA CONTABILIZACION", "FECHA CONTABILIZACIÓN"];

// áreas que querés mostrar (se toman como columnas si existen)
const AREA_ORDER = [
  "PROYECTO",
  "CADENA DE SUMINISTRO",
  "ALMACÉN",
  "ALMACEN",
  "BLEND",
  "EQUIPOS MENORES",
  "COMPRAS",
  "COMPRAS EQUIPOS",
  "COMPRAS AGV"
];

/* ============================
   COLORES / UI
============================ */
const COLORS = {
  grid:  "rgba(15, 23, 42, 0.10)",
  text:  "#0b1220",
  muted: "#526172",
  brand: "#0b5a46",
  line:  "#ef4444"
};

/* ============================
   GLOBAL
============================ */
let headers = [];
let data = [];

let CLIENT_COL = null;
let MES_COL = null;
let FECHA_COL = null;
let AREA_COLS = [];

let chartMes = null;
let chartArea = null;

/* ============================
   HELPERS
============================ */
const clean = (v) => (v ?? "").toString().trim();

function showError(msg) {
  const el = document.getElementById("msg");
  if (el) el.innerHTML = `<div class="error">${msg}</div>`;
}

function toNumber(v) {
  let x = clean(v);
  if (!x) return 0;
  x = x.replace(/\s/g, "");
  if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

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

function parseDateAny(s) {
  const t = clean(s);
  if (!t) return null;

  let m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);

  m = t.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

  return null;
}

function monthKeyFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function normalize(s) {
  return clean(s)
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // saca acentos
}

function sortMonths(labels) {
  // si son yyyy-mm, ordenar directo
  const allYyyyMm = labels.every(x => /^\d{4}-\d{2}$/.test(x));
  if (allYyyyMm) return [...labels].sort();

  // si son nombres de mes
  const order = {
    ENERO:1, FEBRERO:2, MARZO:3, ABRIL:4, MAYO:5, JUNIO:6,
    JULIO:7, AGOSTO:8, SEPTIEMBRE:9, OCTUBRE:10, NOVIEMBRE:11, DICIEMBRE:12
  };

  return [...labels].sort((a,b)=>{
    const aa = normalize(a);
    const bb = normalize(b);
    const oa = order[aa] ?? 999;
    const ob = order[bb] ?? 999;
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b, "es");
  });
}

/* ============================
   DETECTORS
============================ */
function detectColumns() {
  const H = headers;

  CLIENT_COL =
    CLIENT_CANDIDATES.find(c => H.includes(c)) ||
    H.find(h => normalize(h).includes("CLIENTE")) ||
    H.find(h => normalize(h).includes("OBRA")) ||
    null;

  MES_COL =
    MES_CANDIDATES.find(c => H.includes(c)) ||
    H.find(h => normalize(h) === "MES") ||
    null;

  FECHA_COL =
    FECHA_CANDIDATES.find(c => H.includes(c)) ||
    H.find(h => normalize(h).includes("FECHA")) ||
    null;

  // columnas de áreas: usamos AREA_ORDER si existen como headers (con o sin acento)
  const byNorm = new Map(H.map(h => [normalize(h), h]));
  const cols = [];
  for (const a of AREA_ORDER) {
    const real = byNorm.get(normalize(a));
    if (real) cols.push(real);
  }

  // fallback: si no detecta ninguna, buscar columnas que parezcan áreas por nombre (sin mes/cliente/fecha)
  if (!cols.length) {
    const excluded = new Set([CLIENT_COL, MES_COL, FECHA_COL].filter(Boolean));
    for (const h of H) {
      if (excluded.has(h)) continue;
      // nos quedamos con columnas “cortas” y tipo área (heurística)
      const n = normalize(h);
      if (n.includes("COMPRAS") || n.includes("PROYECTO") || n.includes("BLEND") || n.includes("ALMACEN") || n.includes("EQUIPOS")) {
        cols.push(h);
      }
    }
  }

  AREA_COLS = cols;
}

/* ============================
   FILTERED ROWS
============================ */
function rowsByCliente() {
  const c = document.getElementById("clienteSelect")?.value || "";
  if (!c || !CLIENT_COL) return data;
  return data.filter(r => clean(r[CLIENT_COL]) === c);
}

function getRowMonth(r) {
  if (MES_COL && clean(r[MES_COL])) return clean(r[MES_COL]);

  if (FECHA_COL) {
    const d = parseDateAny(r[FECHA_COL]);
    if (d) return monthKeyFromDate(d);
  }

  return null;
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

function renderMeses(rows) {
  const sel = document.getElementById("mesSelect");
  if (!sel) return [];

  const months = [...new Set(rows.map(getRowMonth).filter(Boolean))];
  const sorted = sortMonths(months);

  const prev = sel.value;
  sel.innerHTML = "";
  for (const m of sorted) {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m;
    sel.appendChild(o);
  }

  sel.value = sorted.includes(prev) ? prev : (sorted[sorted.length - 1] || "");

  const hint = document.getElementById("mesHint");
  if (hint) hint.textContent = sel.value ? `Mes seleccionado: ${sel.value}` : "Sin meses";

  return sorted;
}

/* ============================
   AGGREGATIONS
============================ */
function sumAreas(r) {
  let t = 0;
  for (const c of AREA_COLS) t += toNumber(r[c]);
  return t;
}

function aggByMonth(rows) {
  const map = new Map();
  for (const r of rows) {
    const m = getRowMonth(r);
    if (!m) continue;
    map.set(m, (map.get(m) ?? 0) + sumAreas(r));
  }
  return map;
}

function aggByAreaForMonth(rows, month) {
  const map = new Map();
  for (const c of AREA_COLS) map.set(c, 0);

  for (const r of rows) {
    const m = getRowMonth(r);
    if (m !== month) continue;
    for (const c of AREA_COLS) {
      map.set(c, (map.get(c) ?? 0) + toNumber(r[c]));
    }
  }
  return map;
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
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
}

/* ============================
   RENDER: BAR + LINE (mes)
============================ */
function buildChartMes(rows, monthsSorted) {
  const map = aggByMonth(rows);

  const labels = monthsSorted.filter(m => map.has(m));
  const values = labels.map(m => map.get(m) ?? 0);

  const canvas = document.getElementById("chartDemorasMes");
  if (!canvas) return;

  if (chartMes) chartMes.destroy();

  chartMes = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Demoras",
          data: values
        },
        {
          type: "line",
          label: "Tendencia",
          data: values,
          borderColor: COLORS.line,
          backgroundColor: COLORS.line,
          borderDash: [6, 6],
          tension: 0,
          pointRadius: 3,
          pointHoverRadius: 5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: "transparent" }, ticks: { color: COLORS.muted } },
        y: { beginAtZero: true, grid: { color: COLORS.grid }, ticks: { color: COLORS.muted } }
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtInt(c.parsed.y ?? 0)}` }
        },
        datalabels: {
          formatter: (v, ctx) => (ctx.dataset.type === "line" ? "" : (v ? fmtInt(v) : "")),
          anchor: "end",
          align: "end",
          offset: 2,
          font: { weight: "900" }
        }
      }
    }
  });
}

/* ============================
   RENDER: DONUT (area mes)
============================ */
function buildChartArea(rows, monthSelected) {
  const map = aggByAreaForMonth(rows, monthSelected);

  const labels = [];
  const values = [];
  for (const [k,v] of map.entries()) {
    if (!v) continue;
    labels.push(k);
    values.push(v);
  }

  const total = values.reduce((a,b)=>a+b,0);

  const canvas = document.getElementById("chartDemorasArea");
  if (!canvas) return;

  if (chartArea) chartArea.destroy();

  chartArea = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: values }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: "right" },
        tooltip: {
          callbacks: {
            label: (c) => {
              const v = c.parsed ?? 0;
              const pct = total ? (v/total*100) : 0;
              return ` ${c.label}: ${fmtInt(v)} (${pct.toFixed(2).replace(".", ",")}%)`;
            }
          }
        },
        datalabels: {
          formatter: (v, ctx) => {
            if (!total) return "";
            const pct = (v/total*100);
            if (pct < 4) return "";
            return `${fmtInt(v)} (${pct.toFixed(2).replace(".", ",")}%)`;
          },
          anchor: "end",
          align: "end",
          offset: 8,
          font: { weight: "900" }
        }
      }
    }
  });
}

/* ============================
   TABLE: meses x áreas
============================ */
function buildTable(rows, monthsSorted) {
  const tbl = document.getElementById("tablaDemoras");
  if (!tbl) return;

  const cols = AREA_COLS;

  // header
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");

  const th0 = document.createElement("th");
  th0.textContent = "Mes";
  trh.appendChild(th0);

  for (const c of cols) {
    const th = document.createElement("th");
    th.textContent = c;
    trh.appendChild(th);
  }

  const thT = document.createElement("th");
  thT.textContent = "Total";
  trh.appendChild(thT);

  thead.appendChild(trh);

  // body
  const tbody = document.createElement("tbody");

  for (const m of monthsSorted) {
    // sumar por área para ese mes
    const map = aggByAreaForMonth(rows, m);

    let total = 0;
    const tr = document.createElement("tr");

    const td0 = document.createElement("td");
    td0.textContent = m;
    tr.appendChild(td0);

    for (const c of cols) {
      const v = map.get(c) ?? 0;
      total += v;
      const td = document.createElement("td");
      td.textContent = v ? fmtInt(v) : "";
      tr.appendChild(td);
    }

    const tdT = document.createElement("td");
    tdT.textContent = total ? fmtInt(total) : "";
    tr.appendChild(tdT);

    tbody.appendChild(tr);
  }

  tbl.innerHTML = "";
  tbl.appendChild(thead);
  tbl.appendChild(tbody);
}

/* ============================
   APPLY ALL
============================ */
function applyAll() {
  const rows = rowsByCliente();
  const months = renderMeses(rows);

  const mesSel = document.getElementById("mesSelect")?.value || "";
  buildChartMes(rows, months);
  buildChartArea(rows, mesSel);
  buildTable(rows, months);
}

/* ============================
   INIT
============================ */
window.addEventListener("DOMContentLoaded", () => {
  applyChartDefaults();

  // fecha “hoy”
  const d = new Date();
  const last = document.getElementById("lastUpdate");
  if (last) last.textContent =
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

      detectColumns();

      if (!CLIENT_COL) {
        showError("No encuentro columna CLIENTE/OBRA/ALMACEN en DEMORAS.csv.");
        return;
      }
      if (!AREA_COLS.length) {
        showError("No encuentro columnas de ÁREAS (PROYECTO/COMPRAS/BLEND/etc.). Revisá encabezados.");
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
      document.getElementById("mesSelect")?.addEventListener("change", applyAll);
    })
    .catch(err => {
      console.error(err);
      showError("Error cargando CSV. Revisá el nombre del archivo y que esté en la raíz del repo.");
    });
});
