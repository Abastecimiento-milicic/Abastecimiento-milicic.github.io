/* ============================
   CONFIG
============================ */
const csvUrl = "ANALISIS-MM.csv";
const DELIM = ";";

// Columnas esperadas (con tolerancia de mayúsculas/minúsculas)
const COL_CLIENTE = ["ALMACEN"];
const COL_MATERIAL = ["Material", "MATERIAL", "CODIGO MATERIAL", "COD_MATERIAL"];
const COL_LIBRE = ["LIBRE UTILIZACION", "LIBRE_UTILIZACION", "LIBRE UTILIZACIÓN", "LIBREUTILIZACION"];
const COL_ESTADO = ["estado", "ESTADO", "Estado"];

/* ============================
   GLOBAL
============================ */
let rows = [];
let headers = [];

let H_CLIENTE = null;
let H_MATERIAL = null;
let H_LIBRE = null;
let H_ESTADO = null;

let chartEstados = null;

/* ============================
   HELPERS
============================ */
const clean = (v) => (v ?? "").toString().trim();

function toNumber(v) {
  let x = clean(v);
  if (!x) return 0;
  x = x.replace(/\s/g, "");
  // 1.234,56 / 1234,56 / 1234.56
  if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtPct2(x01) {
  if (!isFinite(x01)) return "-";
  return (x01 * 100).toFixed(2).replace(".", ",") + "%";
}

function showError(msg) {
  const el = document.getElementById("msg");
  if (el) el.innerHTML = `<div class="error">${msg}</div>`;
}

function parseDelimited(text, delimiter = ";") {
  const out = [];
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
      out.push(row);
      row = [];
      cur = "";
    } else {
      cur += ch;
    }
  }

  if (cur || row.length) {
    row.push(cur);
    out.push(row);
  }

  return out;
}

function pickHeader(candidates) {
  return candidates.find(c => headers.includes(c)) || null;
}

/* ============================
   FILTER
============================ */
function getFilteredRows() {
  const sel = document.getElementById("clienteSelect");
  const c = sel ? sel.value : "";
  if (!c) return rows;
  return rows.filter(r => clean(r[H_CLIENTE]) === c);
}

/* ============================
   CLIENTES
============================ */
function renderClientes() {
  const sel = document.getElementById("clienteSelect");
  if (!sel) return;

  sel.querySelectorAll("option:not([value=''])").forEach(o => o.remove());

  const clientes = [...new Set(rows.map(r => clean(r[H_CLIENTE])).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b, "es"));

  for (const c of clientes) {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    sel.appendChild(o);
  }
}

/* ============================
   KPIs
============================ */
function calcKPIs(rs) {
  const allMaterials = new Set();
  const dispMaterials = new Set();

  for (const r of rs) {
    const mat = clean(r[H_MATERIAL]);
    if (!mat) continue;

    allMaterials.add(mat);

    const libre = toNumber(r[H_LIBRE]);
    if (libre > 0) dispMaterials.add(mat);
  }

  const total = allMaterials.size;
  const disp = dispMaterials.size;
  const pct = total ? disp / total : NaN;

  return { total, disp, pct };
}

/* ============================
   ESTADOS (conteo por materiales)
============================ */
function calcEstados(rs) {
  // estado -> set(material)
  const map = new Map();

  for (const r of rs) {
    const estado = clean(r[H_ESTADO]) || "(Sin estado)";
    const mat = clean(r[H_MATERIAL]);
    if (!mat) continue;

    if (!map.has(estado)) map.set(estado, new Set());
    map.get(estado).add(mat);
  }

  // total materiales distintos (para %)
  const totalSet = new Set();
  for (const r of rs) {
    const mat = clean(r[H_MATERIAL]);
    if (mat) totalSet.add(mat);
  }
  const total = totalSet.size || 0;

  const items = [...map.entries()].map(([estado, setMat]) => ({
    estado,
    cant: setMat.size,
    pct: total ? setMat.size / total : NaN
  }));

  // Orden: por número inicial "1-", "2-", etc si existe; sino por cant desc
  items.sort((a,b) => {
    const na = (a.estado.match(/^(\d+)/)?.[1]) ? parseInt(a.estado.match(/^(\d+)/)[1],10) : null;
    const nb = (b.estado.match(/^(\d+)/)?.[1]) ? parseInt(b.estado.match(/^(\d+)/)[1],10) : null;
    if (na != null && nb != null && na !== nb) return na - nb;
    if (na != null && nb == null) return -1;
    if (na == null && nb != null) return 1;
    return b.cant - a.cant;
  });

  return { total, items };
}

function estadoColor(estado) {
  const s = (estado || "").toString();
  if (/^1\b|^1-/.test(s)) return "#ef4444"; // rojo
  if (/^2\b|^2-/.test(s)) return "#f59e0b"; // amarillo/ámbar
  if (/^3\b|^3-/.test(s)) return "#16a34a"; // verde
  if (/^4\b|^4-/.test(s)) return "#0b7a4a"; // verde oscuro
  // fallback (grises/azules)
  return "#1d4ed8";
}

/* ============================
   UI RENDER
============================ */
function renderKPIs(rs) {
  const k = calcKPIs(rs);
  document.getElementById("kpiMat").textContent = fmtInt(k.total);
  document.getElementById("kpiDispQty").textContent = fmtInt(k.disp);
  document.getElementById("kpiDispPct").textContent = fmtPct2(k.pct);
}

function renderTablaEstados(est) {
  const tb = document.getElementById("tbodyEstados");
  tb.innerHTML = "";

  for (const it of est.items) {
    const tr = document.createElement("tr");

    const tdE = document.createElement("td");
    tdE.textContent = it.estado;

    const tdC = document.createElement("td");
    tdC.className = "num";
    tdC.textContent = fmtInt(it.cant);

    const tdP = document.createElement("td");
    tdP.className = "num";
    tdP.textContent = fmtPct2(it.pct);

    tr.appendChild(tdE);
    tr.appendChild(tdC);
    tr.appendChild(tdP);
    tb.appendChild(tr);
  }

  document.getElementById("totalMat").textContent = fmtInt(est.total);
}

function renderDonut(est) {
  const canvas = document.getElementById("chartEstados");
  if (!canvas) return;

  const labels = est.items.map(x => x.estado);
  const data = est.items.map(x => x.cant);
  const colors = est.items.map(x => estadoColor(x.estado));

  if (chartEstados) chartEstados.destroy();

  Chart.register(ChartDataLabels);

  chartEstados = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed ?? 0;
              const total = data.reduce((a,b)=>a+b,0) || 0;
              const pct = total ? (val/total) : 0;
              return ` ${ctx.label}: ${fmtInt(val)} (${fmtPct2(pct)})`;
            }
          }
        },
        datalabels: {
          formatter: (value, ctx) => {
            const total = data.reduce((a,b)=>a+b,0) || 0;
            if (!total || !value) return "";
            const pct = value / total;
            // si es muy chiquito, no muestres
            if (pct < 0.06) return "";
            return `${fmtInt(value)} (${(pct*100).toFixed(2).replace(".", ",")}%)`;
          },
          color: "#111827",
          font: { weight: "900", size: 12 },
          anchor: "end",
          align: "end",
          offset: 8,
          clamp: true
        }
      }
    }
  });

  // Leyenda custom a la derecha/abajo
  const leg = document.getElementById("legendEstados");
  if (!leg) return;

  leg.innerHTML = "";
  est.items.forEach((it, i) => {
    const row = document.createElement("div");
    row.className = "mm-legend-item";

    const dot = document.createElement("span");
    dot.className = "mm-dot";
    dot.style.background = colors[i];

    const txt = document.createElement("span");
    txt.className = "mm-legend-text";
    txt.textContent = it.estado;

    row.appendChild(dot);
    row.appendChild(txt);
    leg.appendChild(row);
  });
}

function applyAll() {
  const rs = getFilteredRows();
  renderKPIs(rs);

  const est = calcEstados(rs);
  renderTablaEstados(est);
  renderDonut(est);
}

/* ============================
   INIT
============================ */
window.addEventListener("DOMContentLoaded", () => {
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

      H_CLIENTE = pickHeader(COL_CLIENTE);
      H_MATERIAL = pickHeader(COL_MATERIAL);
      H_LIBRE = pickHeader(COL_LIBRE);
      H_ESTADO = pickHeader(COL_ESTADO);

      const miss = [];
      if (!H_CLIENTE) miss.push("ALMACEN");
      if (!H_MATERIAL) miss.push("Material");
      if (!H_LIBRE) miss.push("LIBRE UTILIZACION");
      if (!H_ESTADO) miss.push("estado/ESTADO");

      if (miss.length) {
        showError("Faltan columnas en ANALISIS-MM.csv: " + miss.join(", "));
        return;
      }

      rows = m.slice(1).map(line => {
        const o = {};
        headers.forEach((h, i) => (o[h] = clean(line[i])));
        return o;
      });

      renderClientes();
      applyAll();

      document.getElementById("clienteSelect")?.addEventListener("change", applyAll);
      document.getElementById("btnReset")?.addEventListener("click", () => {
        document.getElementById("clienteSelect").value = "";
        applyAll();
      });
    })
    .catch(err => {
      console.error(err);
      showError("Error cargando ANALISIS-MM.csv. Revisá el nombre y que esté en la raíz del repo.");
    });
});

