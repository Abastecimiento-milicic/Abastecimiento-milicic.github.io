/* ============================
   CONFIG
============================ */
const csvUrlMM = "ANALISIS-MM.csv";
const DELIM = ";";

// Candidatos por si tu CSV viene con acentos o recortes (como en tu captura)
const ALMACEN_CAND = ["ALMACEN", "Almacen", "Almacén", "ALMACÉN"];
const MATERIAL_CAND = ["Material", "MATERIAL", "Codigo Item", "Código Item", "Material Texto breve"];
const LIBRE_CAND = [
  "LIBRE UTILIZACION", "Libre utilizacion", "Libre utilización",
  "Libre utilizaci", "Libre Utilizaci", "Libre Utilizacion"
];
const ESTADO_CAND = ["Estado", "ESTADO", "Id Estado", "ID Estado", "Estado stock", "Estado de stock"];

/* ============================
   GLOBAL
============================ */
let rowsMM = [];
let headersMM = [];

let COL_ALMACEN = null;
let COL_MATERIAL = null;
let COL_LIBRE = null;
let COL_ESTADO = null;

let chartEstados = null;

/* ============================
   HELPERS
============================ */
const clean = (v) => (v ?? "").toString().trim();

function showError(msg) {
  const el = document.getElementById("msg");
  if (el) el.innerHTML = `<div class="error">${msg}</div>`;
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

function fmtPct(x) {
  if (!isFinite(x)) return "-";
  return (x * 100).toFixed(2).replace(".", ",") + "%";
}

function pickCol(cands) {
  return cands.find(c => headersMM.includes(c)) || null;
}

/* ============================
   FILTER
============================ */
function filteredMM() {
  const sel = document.getElementById("clienteMM");
  const v = sel?.value || "";
  if (!v) return rowsMM;
  return rowsMM.filter(r => clean(r[COL_ALMACEN]) === v);
}

/* ============================
   UI: Select cliente
============================ */
function renderClientesMM() {
  const sel = document.getElementById("clienteMM");
  if (!sel) return;

  // limpiar opciones salvo "Todos"
  sel.querySelectorAll("option:not([value=''])").forEach(o => o.remove());

  const values = [...new Set(rowsMM.map(r => clean(r[COL_ALMACEN])).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,"es"));

  for (const v of values) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  }
}

/* ============================
   CALCS
============================ */
function distinctMaterials(rows) {
  const s = new Set();
  for (const r of rows) {
    const m = clean(r[COL_MATERIAL]);
    if (m) s.add(m);
  }
  return s;
}

function distinctMaterialsDisponible(rows) {
  const s = new Set();
  for (const r of rows) {
    const m = clean(r[COL_MATERIAL]);
    if (!m) continue;
    const libre = toNumber(r[COL_LIBRE]);
    if (libre > 0) s.add(m);
  }
  return s;
}

function aggByEstado(rows) {
  // estado -> Set(material)
  const map = new Map();

  for (const r of rows) {
    const estado = clean(r[COL_ESTADO]) || "(Sin estado)";
    const mat = clean(r[COL_MATERIAL]);
    if (!mat) continue;

    if (!map.has(estado)) map.set(estado, new Set());
    map.get(estado).add(mat);
  }

  const totalSet = distinctMaterials(rows);
  const total = totalSet.size || 0;

  const arr = [...map.entries()].map(([estado, set]) => ({
    estado,
    cant: set.size,
    pct: total ? set.size / total : 0
  }));

  // ordenar por cantidad desc
  arr.sort((a,b) => b.cant - a.cant);

  return { arr, total };
}

/* ============================
   RENDER KPIs
============================ */
function renderKPIs(rows) {
  const totalMat = distinctMaterials(rows).size;
  const dispMat = distinctMaterialsDisponible(rows).size;
  const pct = totalMat ? dispMat / totalMat : NaN;

  document.getElementById("kpiMat").textContent = fmtInt(totalMat);
  document.getElementById("kpiDispQty").textContent = fmtInt(dispMat);
  document.getElementById("kpiDispPct").textContent = isFinite(pct) ? fmtPct(pct) : "-";
}

/* ============================
   TABLE
============================ */
function renderTableEstados(rows) {
  const tbody = document.querySelector("#tblEstados tbody");
  if (!tbody) return;

  const { arr, total } = aggByEstado(rows);

  tbody.innerHTML = "";

  for (const it of arr) {
    const tr = document.createElement("tr");

    const tdE = document.createElement("td");
    tdE.textContent = it.estado;

    const tdC = document.createElement("td");
    tdC.className = "num";
    tdC.textContent = fmtInt(it.cant);

    const tdP = document.createElement("td");
    tdP.className = "num";
    tdP.textContent = fmtPct(it.pct);

    tr.appendChild(tdE);
    tr.appendChild(tdC);
    tr.appendChild(tdP);

    tbody.appendChild(tr);
  }

  document.getElementById("totalMat").textContent = fmtInt(total);
  document.getElementById("totalPct").textContent = "100,00%";

  return arr;
}

/* ============================
   CHART (dona)
============================ */
function renderChartEstados(arr) {
  const canvas = document.getElementById("chartEstados");
  if (!canvas) return;

  const labels = arr.map(x => x.estado);
  const data = arr.map(x => x.cant);

  if (chartEstados) chartEstados.destroy();

  chartEstados = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data }]
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
              const total = c.dataset.data.reduce((a,b)=>a+b,0) || 1;
              const pct = (v/total)*100;
              return ` ${c.label}: ${fmtInt(v)} (${pct.toFixed(2).replace(".", ",")}%)`;
            }
          }
        }
      }
    }
  });
}

/* ============================
   APPLY
============================ */
function applyMM() {
  const rows = filteredMM();
  renderKPIs(rows);
  const arr = renderTableEstados(rows) || [];
  renderChartEstados(arr);
}

/* ============================
   INIT
============================ */
window.addEventListener("DOMContentLoaded", () => {
  // fecha “hoy”
  const d = new Date();
  document.getElementById("lastUpdate").textContent =
    `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;

  fetch(csvUrlMM)
    .then(r => {
      if (!r.ok) throw new Error(`No pude abrir ${csvUrlMM} (HTTP ${r.status})`);
      return r.text();
    })
    .then(text => {
      const m = parseDelimited(text, DELIM);
      if (!m.length || m.length < 2) {
        showError("El CSV está vacío o no tiene filas.");
        return;
      }

      headersMM = m[0].map(clean);

      COL_ALMACEN = pickCol(ALMACEN_CAND);
      COL_MATERIAL = pickCol(MATERIAL_CAND);
      COL_LIBRE = pickCol(LIBRE_CAND);
      COL_ESTADO = pickCol(ESTADO_CAND);

      const missing = [];
      if (!COL_ALMACEN) missing.push("ALMACEN");
      if (!COL_MATERIAL) missing.push("Material");
      if (!COL_LIBRE) missing.push("LIBRE UTILIZACION");
      if (!COL_ESTADO) missing.push("Estado");

      if (missing.length) {
        showError(
          "No pude encontrar columnas en ANALISIS-MM.csv: " +
          missing.join(", ") +
          "<br><br>Columnas detectadas:<br>" + headersMM.join(" | ")
        );
        return;
      }

      rowsMM = m.slice(1).map(row => {
        const o = {};
        headersMM.forEach((h, i) => (o[h] = clean(row[i])));
        return o;
      });

      document.getElementById("clienteHint").textContent = `Columna cliente: ${COL_ALMACEN}`;

      renderClientesMM();
      applyMM();

      document.getElementById("clienteMM")?.addEventListener("change", applyMM);
      document.getElementById("btnResetMM")?.addEventListener("click", () => {
        const sel = document.getElementById("clienteMM");
        if (sel) sel.value = "";
        applyMM();
      });
    })
    .catch(err => {
      console.error(err);
      showError("Error cargando ANALISIS-MM.csv. Revisá el nombre del archivo y que esté en la raíz del repo.");
    });
});

