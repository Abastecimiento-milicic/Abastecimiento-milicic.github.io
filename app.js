const PATH_MM = "data/ANALISIS-MM.csv";
const PATH_CUMP = "data/CUMPLIMIENTO.csv";

const $ = (id) => document.getElementById(id);
let mmChart;

function setStatus(msg) {
  const el = $("globalStatus");
  if (el) el.textContent = msg;
}

function normalizeKey(s) {
  return String(s ?? "")
    .replace(/^\uFEFF/, "")                // quita BOM
    .trim()
    .toLowerCase()
    .normalize("NFD")                      // separa acentos
    .replace(/[\u0300-\u036f]/g, "")       // borra acentos
    .replace(/\s+/g, " ");                 // colapsa espacios
}

function parseCSVSmart(text) {
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLine = text.split("\n").find(l => l.trim() !== "") || "";
  const commas = (firstLine.match(/,/g) || []).length;
  const semis  = (firstLine.match(/;/g) || []).length;
  const delim = semis > commas ? ";" : ",";

  // Parser simple (sin comillas complejas). Suficiente para CSV de Excel típico.
  const rawRows = text.split("\n").filter(l => l.trim() !== "").map(line => line.split(delim));
  if (!rawRows.length) return { headers: [], rows: [] };

  let headers = rawRows[0].map(h => String(h ?? "").replace(/^\uFEFF/, "").trim());
  const rows = rawRows.slice(1).map(r => {
    const o = {};
    headers.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
    return o;
  });

  return { headers, rows };
}

async function loadCSV(path) {
  const res = await fetch(path + "?v=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (HTTP ${res.status})`);
  const text = await res.text();
  return parseCSVSmart(text);
}

function pickColumn(headers, candidates) {
  const map = new Map(headers.map(h => [normalizeKey(h), h]));
  for (const c of candidates) {
    const key = normalizeKey(c);
    if (map.has(key)) return map.get(key);
  }
  return null;
}

function numSmart(v) {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  // soporta 1.234,56 o 1234.56
  const normalized = s.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function uniqCount(arr) {
  return new Set(arr.filter(x => String(x ?? "").trim() !== "")).size;
}

function fillSelect(select, values) {
  select.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "__ALL__";
  optAll.textContent = "Todos";
  select.appendChild(optAll);

  values.forEach(v => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  });
}

function renderSimpleTable(tableId, headers, rows, maxRows = 30) {
  const table = $(tableId);
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  thead.innerHTML = "";
  tbody.innerHTML = "";

  const trh = document.createElement("tr");
  headers.forEach(h => {
    const th = document.createElement("th");
    th.textContent = h;
    trh.appendChild(th);
  });
  thead.appendChild(trh);

  rows.slice(0, maxRows).forEach(r => {
    const tr = document.createElement("tr");
    headers.forEach(h => {
      const td = document.createElement("td");
      td.textContent = r[h] ?? "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

/* ===== Tabs ===== */
function initTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");

      document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
      const viewId = btn.dataset.view;
      $(viewId).classList.remove("hidden");
    });
  });
}

/* ===== ANALISIS MM ===== */
let mmCache = null;

async function loadMM() {
  setStatus("Cargando ANÁLISIS MM…");

  if (!mmCache) mmCache = await loadCSV(PATH_MM);
  const { headers, rows } = mmCache;

  // Detectar columnas aunque vengan con acentos / mayúsculas / espacios
  const colAlmacen = pickColumn(headers, ["ALMACEN", "Almacen", "CLIENTE", "Cliente"]);
  const colMaterial = pickColumn(headers, ["MATERIAL", "Material", "CODIGO MATERIAL", "Código material", "Codigo material"]);
  const colLibre = pickColumn(headers, [
    "LIBRE UTILIZACION", "Libre utilizacion", "Libre utilización", "Libre Utilización",
    "LIBRE UTILIZACIÓN"
  ]);
  const colEstado = pickColumn(headers, ["ESTADO", "Estado", "estado"]);

  // Si falta algo, mostrar qué headers leyó
  if (!colAlmacen || !colMaterial || !colLibre || !colEstado) {
    $("mmTable").querySelector("thead").innerHTML = `<tr><th>ERROR</th></tr>`;
    $("mmTable").querySelector("tbody").innerHTML = `
      <tr><td>
        No encuentro columnas requeridas.<br><br>
        Necesito: <b>ALMACEN</b>, <b>Material</b>, <b>Libre utilizacion</b>, <b>estado</b><br><br>
        Headers detectados:<br>
        <code>${headers.join(" | ")}</code>
      </td></tr>
    `;
    $("kpiMat").textContent = "0";
    $("kpiDisp").textContent = "0";
    $("kpiPct").textContent = "0%";
    setStatus("Error columnas MM");
    return;
  }

  // Llenar select clientes
  const clientes = Array.from(new Set(rows.map(r => r[colAlmacen]).filter(Boolean))).sort();
  const sel = $("mmCliente");
  if (sel.options.length === 0) fillSelect(sel, clientes);

  const chosen = sel.value || "__ALL__";
  const filtered = (chosen === "__ALL__") ? rows : rows.filter(r => r[colAlmacen] === chosen);

  // KPIs
  const totalMat = uniqCount(filtered.map(r => r[colMaterial]));
  const dispMat = uniqCount(
    filtered.filter(r => numSmart(r[colLibre]) !== 0).map(r => r[colMaterial])
  );

  $("kpiMat").textContent = totalMat.toLocaleString("es-AR");
  $("kpiDisp").textContent = dispMat.toLocaleString("es-AR");
  $("kpiPct").textContent = totalMat ? `${Math.round((dispMat / totalMat) * 100)}%` : "0%";

  // Estados (conteo por estado)
  const byEstado = new Map();
  for (const r of filtered) {
    const est = r[colEstado] || "(Sin estado)";
    byEstado.set(est, (byEstado.get(est) || 0) + 1);
  }

  const estadoHeaders = ["Estado", "Registros"];
  const estadoRows = Array.from(byEstado.entries())
    .map(([Estado, Registros]) => ({ Estado, Registros }))
    .sort((a,b) => b.Registros - a.Registros);

  // tabla estados
  const table = $("mmTable");
  table.querySelector("thead").innerHTML =
    `<tr>${estadoHeaders.map(h => `<th>${h}</th>`).join("")}</tr>`;
  table.querySelector("tbody").innerHTML =
    estadoRows.map(r => `<tr><td>${r.Estado}</td><td>${r.Registros}</td></tr>`).join("");

  // gráfico
  if (mmChart) mmChart.destroy();
  mmChart = new Chart($("mmChart"), {
    type: "doughnut",
    data: {
      labels: estadoRows.map(x => x.Estado),
      datasets: [{ data: estadoRows.map(x => x.Registros) }]
    },
    options: { responsive: true }
  });

  $("lastUpdate").textContent = new Date().toLocaleDateString("es-AR");
  setStatus("Listo");
}

/* ===== CUMPLIMIENTO (preview simple) ===== */
let cumpCache = null;
async function loadCumplimiento() {
  if (!cumpCache) cumpCache = await loadCSV(PATH_CUMP);
  const { headers, rows } = cumpCache;

  // muestra primeras 30 filas (sin lógica aún)
  renderSimpleTable("cumpTable", headers.slice(0, Math.min(12, headers.length)), rows, 30);
}

/* ===== Init ===== */
document.addEventListener("DOMContentLoaded", async () => {
  initTabs();

  $("mmCliente").addEventListener("change", () => loadMM());

  try {
    await loadMM();
    await loadCumplimiento();
  } catch (e) {
    console.error(e);
    setStatus("ERROR");
    alert(e.message);
  }
});


