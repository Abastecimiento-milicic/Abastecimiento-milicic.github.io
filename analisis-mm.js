/* ============================
   CONFIG
============================ */
const csvUrl = "ANALISIS-MM.csv";
const DELIM = ";";

/* ============================
   HELPERS
============================ */
const clean = (v) => (v ?? "").toString().trim();

function showError(msg) {
  const el = document.getElementById("msg");
  if (el) el.innerHTML = `<div class="error">${msg}</div>`;
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtPct(x) {
  if (!isFinite(x)) return "-";
  return (x * 100).toFixed(2).replace(".", ",") + "%";
}

function toNumber(v) {
  let x = clean(v);
  if (!x) return 0;
  x = x.replace(/\s/g, "");
  // soporta 1.234,56 y 1234,56 y 1234.56
  if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

// Normaliza: sin acentos, minúsculas, sin espacios/guiones/underscores
function norm(s) {
  return clean(s)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // saca acentos
    .toLowerCase()
    .replace(/[\s\-_]+/g, "");
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
   GLOBAL
============================ */
let data = [];
let headers = [];

let COL_ALMACEN = null;
let COL_MATERIAL = null;
let COL_LIBRE = null;
let COL_ESTADO = null;

let chartEstados = null;

/* ============================
   COLUMN DETECTION (tolerante)
============================ */
function findColumn(headers, candidates) {
  const map = new Map(headers.map(h => [norm(h), h]));
  for (const c of candidates) {
    const key = norm(c);
    if (map.has(key)) return map.get(key);
  }
  // fallback: contains
  for (const [k, orig] of map.entries()) {
    for (const c of candidates) {
      const ck = norm(c);
      if (k.includes(ck) || ck.includes(k)) return orig;
    }
  }
  return null;
}

/* ============================
   UI: CLIENTES
============================ */
function renderClientes() {
  const sel = document.getElementById("clienteSelect");
  if (!sel) return;

  sel.querySelectorAll("option:not([value=''])").forEach(o => o.remove());

  const clientes = [...new Set(data.map(r => clean(r[COL_ALMACEN])).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b, "es"));

  for (const c of clientes) {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    sel.appendChild(o);
  }
}

function filteredRows() {
  const c = document.getElementById("clienteSelect")?.value || "";
  return c ? data.filter(r => clean(r[COL_ALMACEN]) === c) : data;
}

/* ============================
   CALCS
============================ */
function distinctCountBy(rows, col) {
  const s = new Set();
  for (const r of rows) {
    const v = clean(r[col]);
    if (v) s.add(v);
  }
  return s.size;
}

function distinctAvailableMaterials(rows) {
  const s = new Set();
  for (const r of rows) {
    const mat = clean(r[COL_MATERIAL]);
    const libre = toNumber(r[COL_LIBRE]);
    if (mat && libre > 0) s.add(mat);
  }
  return s.size;
}

function estadosAgg(rows) {
  // estado -> Set(material)
  const m = new Map();
  for (const r of rows) {
    const est = clean(r[COL_ESTADO]) || "(Sin estado)";
    const mat = clean(r[COL_MATERIAL]);
    if (!mat) continue;
    if (!m.has(est)) m.set(est, new Set());
    m.get(est).add(mat);
  }
  // a array
  const out = [];
  for (const [estado, setMat] of m.entries()) out.push({ estado, cant: setMat.size });
  out.sort((a,b) => b.cant - a.cant || a.estado.localeCompare(b.estado, "es"));
  return out;
}

/* ============================
   RENDER
============================ */
function renderKPIs(rows) {
  const totalMat = distinctCountBy(rows, COL_MATERIAL);
  const dispMat = distinctAvailableMaterials(rows);
  const pct = totalMat ? dispMat / totalMat : NaN;

  document.getElementById("kpiMat").textContent = fmtInt(totalMat);
  document.getElementById("kpiDisp").textContent = fmtInt(dispMat);
  document.getElementById("kpiPct").textContent = fmtPct(pct);

  const info = [
    `Cliente: ${COL_ALMACEN}`,
    `Material: ${COL_MATERIAL}`,
    `Libre: ${COL_LIBRE}`,
    `Estado: ${COL_ESTADO}`,
  ].join(" · ");
  document.getElementById("kpiInfo").textContent = info;
}

function renderEstadosTable(rows) {
  const body = document.getElementById("estadosBody");
  if (!body) return;
  body.innerHTML = "";

  const agg = estadosAgg(rows);
  const total = agg.reduce((s,x)=> s + x.cant, 0);

  document.getElementById("estadosTotal").textContent = fmtInt(total);

  for (const it of agg) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="padding:8px; border-bottom:1px solid rgba(2,8,20,.08)">${it.estado}</td>
      <td style="padding:8px; text-align:right; border-bottom:1px solid rgba(2,8,20,.08)">${fmtInt(it.cant)}</td>
      <td style="padding:8px; text-align:right; border-bottom:1px solid rgba(2,8,20,.08)">${fmtPct(total ? it.cant/total : NaN)}</td>
    `;
    body.appendChild(tr);
  }

  return agg;
}

function renderDonut(agg) {
  const canvas = document.getElementById("chartEstados");
  if (!canvas) return;

  if (chartEstados) chartEstados.destroy();

  const labels = agg.map(x => x.estado);
  const values = agg.map(x => x.cant);
  const total = values.reduce((a,b)=>a+b,0);

  Chart.register(ChartDataLabels);

  chartEstados = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: values }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "right" },
        tooltip: {
          callbacks: {
            label: (c) => {
              const v = c.parsed || 0;
              const pct = total ? (v/total)*100 : 0;
              return ` ${c.label}: ${fmtInt(v)} (${pct.toFixed(2).replace(".", ",")}%)`;
            }
          }
        },
        datalabels: {
          formatter: (v) => {
            if (!total) return "";
            const pct = (v/total)*100;
            return pct >= 7 ? `${pct.toFixed(0)}%` : ""; // no ensuciar si es chico
          },
          font: { weight: "900" }
        }
      },
      cutout: "62%"
    }
  });
}

function applyAll() {
  const rows = filteredRows();
  renderKPIs(rows);
  const agg = renderEstadosTable(rows) || [];
  renderDonut(agg);
}

/* ============================
   INIT
============================ */
window.addEventListener("DOMContentLoaded", () => {
  // fecha “hoy” en header
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
      if (!m.length || m.length < 2) throw new Error("El CSV está vacío o no tiene filas.");

      headers = m[0].map(clean);

      // Detecta columnas con tolerancia (acentos/mayúsculas)
      COL_ALMACEN = findColumn(headers, ["ALMACEN", "ALMACÉN", "CLIENTE", "CLIENTE / OBRA"]);
      COL_MATERIAL = findColumn(headers, ["MATERIAL", "CODIGO MATERIAL", "CODIGO_MATERIAL"]);
      COL_LIBRE = findColumn(headers, ["LIBRE UTILIZACION", "LIBRE UTILIZACIÓN", "LIBREUTILIZACION", "LIBRE UTILIZ"]);
      COL_ESTADO = findColumn(headers, ["ESTADO", "ID ESTADO", "Id Estado", "Estado"]);

      const missing = [];
      if (!COL_ALMACEN) missing.push("ALMACEN");
      if (!COL_MATERIAL) missing.push("MATERIAL");
      if (!COL_LIBRE) missing.push("LIBRE UTILIZACION");
      if (!COL_ESTADO) missing.push("ESTADO");

      if (missing.length) {
        throw new Error(
          `Faltan columnas en ${csvUrl}: ${missing.join(", ")}. ` +
          `Revisá encabezados (mayúsculas/acentos).`
        );
      }

      data = m.slice(1).map(row => {
        const o = {};
        headers.forEach((h, i) => (o[h] = clean(row[i])));
        return o;
      });

      document.getElementById("clienteHint").textContent = `Columna cliente: ${COL_ALMACEN}`;

      renderClientes();
      applyAll();

      document.getElementById("clienteSelect")?.addEventListener("change", applyAll);
      document.getElementById("btnReset")?.addEventListener("click", () => {
        const sel = document.getElementById("clienteSelect");
        if (sel) sel.value = "";
        applyAll();
      });
    })
    .catch(err => {
      console.error(err);
      showError(err.message);
    });
});

