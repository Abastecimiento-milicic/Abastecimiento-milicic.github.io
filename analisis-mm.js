/* ============================
   ANALISIS MM - CONFIG
============================ */
const CSV_CANDIDATES = [
  "ANALISIS-MM.csv",
  "ANALISIS-MM.CSV",
  "ANALISIS-MM.csv?v=1"
];

const DELIM = ";";

// Columnas (según lo que venís usando)
const COL_ALMACEN = "Almacén";              // filtro cliente
const COL_MATERIAL = "Material";            // materiales distintos
const COL_ESTADO = "Estado";                // tabla + donut
const COL_LIBRE = "Libre utilizacion";      // disponible > 0

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
  return (x * 100).toFixed(2).replace(".", ",") + "%";
}

function showError(html) {
  const el = document.getElementById("msg");
  if (el) el.innerHTML = `<div class="error">${html}</div>`;
}

function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
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
   FETCH con fallback (anti-caché)
============================ */
async function fetchFirstOk(urls) {
  let lastErr = null;

  for (const u of urls) {
    try {
      const resp = await fetch(u, { cache: "no-store" });
      if (!resp.ok) {
        lastErr = new Error(`HTTP ${resp.status} al abrir: ${u}`);
        continue;
      }
      const text = await resp.text();
      return { url: u, text };
    } catch (e) {
      lastErr = new Error(`No se pudo abrir: ${u} (${e.message})`);
    }
  }

  throw lastErr || new Error("No se pudo abrir ningún CSV.");
}

/* ============================
   GLOBAL
============================ */
let DATA = [];
let HEADERS = [];
let chartEstados = null;

/* ============================
   UI: Select CLIENTE (ALMACEN)
============================ */
function renderClientes() {
  const sel = document.getElementById("clienteSelect");
  if (!sel) return;

  sel.querySelectorAll("option:not([value=''])").forEach(o => o.remove());

  const clientes = [...new Set(DATA.map(r => clean(r[COL_ALMACEN])).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b, "es"));

  for (const c of clientes) {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    sel.appendChild(o);
  }
}

function rowsFiltradas() {
  const c = document.getElementById("clienteSelect")?.value || "";
  if (!c) return DATA;
  return DATA.filter(r => clean(r[COL_ALMACEN]) === c);
}

/* ============================
   KPI + Estados (por materiales distintos)
============================ */
function calcByEstado(rows) {
  // Estado -> Set(material)
  const map = new Map();

  for (const r of rows) {
    const estado = clean(r[COL_ESTADO]) || "(Sin estado)";
    const mat = clean(r[COL_MATERIAL]) || "";
    if (!mat) continue;

    if (!map.has(estado)) map.set(estado, new Set());
    map.get(estado).add(mat);
  }

  // a array ordenado desc por cantidad
  const arr = [...map.entries()].map(([estado, setMat]) => ({
    estado,
    cant: setMat.size
  })).sort((a,b) => b.cant - a.cant);

  const total = arr.reduce((s,x)=> s + x.cant, 0);

  // % sobre total
  arr.forEach(x => x.pct = total ? (x.cant / total) : 0);

  return { arr, total };
}

function calcKPIs(rows) {
  const mats = new Set();
  const matsDisponibles = new Set();

  for (const r of rows) {
    const mat = clean(r[COL_MATERIAL]);
    if (!mat) continue;

    mats.add(mat);

    const libre = toNumber(r[COL_LIBRE]);
    if (libre > 0) matsDisponibles.add(mat);
  }

  const cantMateriales = mats.size;
  const cantDisponibles = matsDisponibles.size;
  const pctDisponible = cantMateriales ? (cantDisponibles / cantMateriales) : NaN;

  return { cantMateriales, cantDisponibles, pctDisponible };
}

/* ============================
   Render tabla estados
============================ */
function renderTablaEstados(rows) {
  const tbody = document.getElementById("tablaEstadosBody");
  if (!tbody) return;

  const { arr, total } = calcByEstado(rows);

  tbody.innerHTML = "";

  for (const x of arr) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${x.estado}</td>
      <td style="text-align:right">${fmtInt(x.cant)}</td>
      <td style="text-align:right">${fmtPct01(x.pct)}</td>
    `;
    tbody.appendChild(tr);
  }

  // total
  const trTot = document.createElement("tr");
  trTot.innerHTML = `
    <td><b>Total</b></td>
    <td style="text-align:right"><b>${fmtInt(total)}</b></td>
    <td style="text-align:right"><b>100,00%</b></td>
  `;
  tbody.appendChild(trTot);

  return { arr, total };
}

/* ============================
   Donut estados
============================ */
function buildDonutEstados(rows) {
  const { arr } = calcByEstado(rows);

  const labels = arr.map(x => x.estado);
  const values = arr.map(x => x.cant);

  const canvas = document.getElementById("chartEstados");
  if (!canvas) return;

  if (chartEstados) chartEstados.destroy();

  chartEstados = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "right" },
        tooltip: {
          callbacks: {
            label: (c) => {
              const v = c.parsed ?? 0;
              const total = values.reduce((s,x)=>s+x,0);
              const pct = total ? (v/total)*100 : 0;
              return ` ${c.label}: ${fmtInt(v)} (${pct.toFixed(2).replace(".", ",")}%)`;
            }
          }
        }
      }
    }
  });
}

/* ============================
   Apply (todo)
============================ */
function applyAll() {
  const rows = rowsFiltradas();

  // KPIs
  const k = calcKPIs(rows);
  setText("kpiMat", fmtInt(k.cantMateriales));
  setText("kpiDisp", fmtInt(k.cantDisponibles));
  setText("kpiPct", fmtPct01(k.pctDisponible));

  // Tabla + donut
  renderTablaEstados(rows);
  buildDonutEstados(rows);
}

/* ============================
   INIT
============================ */
window.addEventListener("DOMContentLoaded", async () => {
  // fecha header
  const d = new Date();
  const lastUpdate = document.getElementById("lastUpdate");
  if (lastUpdate) {
    lastUpdate.textContent =
      `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  }

  try {
    const { url, text } = await fetchFirstOk(CSV_CANDIDATES);

    // fuente visible
    const src = document.getElementById("fuenteArchivo");
    if (src) src.textContent = url.replace(/\?.*$/, "");

    const m = parseDelimited(text, DELIM);
    if (!m.length || m.length < 2) {
      showError("El CSV está vacío o no tiene filas.");
      return;
    }

    HEADERS = m[0].map(clean);

    // Validaciones fuertes (para que el error sea claro)
    const required = [COL_ALMACEN, COL_MATERIAL, COL_ESTADO, COL_LIBRE];
    const missing = required.filter(c => !HEADERS.includes(c));
    if (missing.length) {
      showError(
        `Faltan columnas en <b>${url}</b>: <b>${missing.join(", ")}</b><br>` +
        `Revisá encabezados (incluye mayúsculas/acentos).`
      );
      return;
    }

    DATA = m.slice(1).map(row => {
      const o = {};
      HEADERS.forEach((h, i) => (o[h] = clean(row[i])));
      return o;
    });

    // hints
    setText("clienteHint", `Columna cliente: ${COL_ALMACEN}`);

    renderClientes();
    applyAll();

    document.getElementById("clienteSelect")?.addEventListener("change", applyAll);
    document.getElementById("btnReset")?.addEventListener("click", () => {
      const sel = document.getElementById("clienteSelect");
      if (sel) sel.value = "";
      applyAll();
    });

  } catch (err) {
    console.error(err);
    showError(
      `Error cargando <b>ANALISIS-MM</b>.<br>` +
      `${clean(err.message)}<br><br>` +
      `Probá abrir el CSV directo en el navegador:<br>` +
      `<code>/ANALISIS-MM.csv</code>`
    );
  }
});

