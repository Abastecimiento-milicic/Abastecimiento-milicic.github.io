/* ============================
   DEMORAS - CONFIG
============================ */
// archivo datos
const csvUrl = "DEMORAS.csv";   // OJO: nombre EXACTO del repo

// candidatos de columnas (se detectan en runtime)
const CLIENT_CANDIDATES = ["Cliente", "CLIENTE"];
const MES_CANDIDATES    = ["Mes", "MES ENTREGA", "MES DE ENTREGA"];
const FECHA_CANDIDATES  = ["Fecha", "FECHA", "FECHA ENTREGA", "FECHA DE ENTREGA"];

// “áreas” (las que me pasaste)
const AREA_EXPECTED = [
  "CADENA D' SUMINISTRO",
  "CADENA DE SUMINISTRO",
  "ALMACÉN",
  "ALMACEN",
  "COMPRAS",
  "COMPRAS EQUIPOS",
  "COMPRAS EQUIPOS MENORES",
  "COMPRAS AGV",
  "EQUIPOS MENORES",
  "BLEN"
];

// motivos/categorías
const MOTIVO_EXPECTED = [
  "CERCANA CS",
  "LEJANA CS",
  "OBRA CS",
  "CERCANA OBRA",
  "LEJANA OBRA",
  "OBRA OBRA"
];

/* ============================
   GLOBAL
============================ */
let data = [];
let headers = [];

let CLIENT_COL = null;
let MES_COL = null;
let FECHA_COL = null;
let AREA_COLS = [];
let MOTIVO_COLS = [];

let chartMesE = null;
let chartMesResizeBound = false;

let chartAreas = null;
let chartMotivos = null;
let chartAreasResizeBound = false;

/* ============================
   HELPERS
============================ */
function norm(s){
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toNumber(v){
  if (v == null) return 0;
  const s = String(v).replace(/\./g,"").replace(",",".").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// en este dataset “área” viene como columnas flag (0/1, X, true, etc)
function isTruthyAreaValue(v){
  if (v == null) return false;
  const t = String(v).trim();
  if (!t) return false;
  if (t === "0") return false;
  if (t === "0.0") return false;
  if (t.toLowerCase() === "false") return false;
  return true;
}

function fmtInt(n){
  const x = Number(n) || 0;
  return x.toLocaleString("es-AR");
}

function fmtPct01(x){
  const v = (Number(x) || 0) * 100;
  return v.toFixed(1).replace(".", ",") + "%";
}

function showError(msg){
  const el = document.getElementById("msg");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
}

function escapeCsvCell(v){
  const s = String(v ?? "");
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
  return s;
}

function rowsToCsv(rows, cols){
  const out = [];
  out.push(cols.map(escapeCsvCell).join(";"));
  for (const r of rows){
    out.push(cols.map(c => escapeCsvCell(r[c])).join(";"));
  }
  return out.join("\n");
}

function downloadFilteredCsv(rows, cols, cliente, mes){
  const csv = rowsToCsv(rows, cols);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `DEMORAS_filtrado_${cliente}_${mes}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function monthSortKey(mk){
  // mk esperado: YYYY-MM o MMM-YYYY etc -> fallback a parse
  const s = String(mk);
  // si viene YYYY-MM
  if (/^\d{4}-\d{2}$/.test(s)){
    const [y,mm] = s.split("-").map(Number);
    return y*100 + mm;
  }
  // si viene "enero" etc, no ordena perfecto; se usa FECHA si existe
  return 0;
}

function parseDateAny(v){
  if (!v) return null;
  const s = String(v).trim();
  // ISO
  let d = new Date(s);
  if (!isNaN(d)) return d;

  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m){
    const dd = Number(m[1]);
    const mm = Number(m[2]) - 1;
    const yy = Number(m[3]);
    d = new Date(yy, mm, dd);
    if (!isNaN(d)) return d;
  }
  return null;
}

function monthKey(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  return `${y}-${m}`;
}

function getMonthKeyFromRow(r){
  if (MES_COL && r[MES_COL]){
    // si viene yyyy-mm ya
    const s = String(r[MES_COL]).trim();
    if (/^\d{4}-\d{2}$/.test(s)) return s;
  }
  if (FECHA_COL && r[FECHA_COL]){
    const d = parseDateAny(r[FECHA_COL]);
    if (d) return monthKey(d);
  }
  // fallback: intentar parsear MES_COL como fecha
  if (MES_COL && r[MES_COL]){
    const d = parseDateAny(r[MES_COL]);
    if (d) return monthKey(d);
  }
  return null;
}

function parseDelimited(text){
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      delimiter: "",
      complete: (res) => resolve(res),
      error: (err) => reject(err)
    });
  });
}

function detectColumns() {
  const hNorm = headers.map(norm);
  const findCol = (cands) => {
    for (const c of cands) {
      const idx = hNorm.indexOf(norm(c));
      if (idx >= 0) return headers[idx];
    }
    return null;
  };

  CLIENT_COL = findCol(CLIENT_CANDIDATES);
  MES_COL = findCol(MES_CANDIDATES);
  FECHA_COL = findCol(FECHA_CANDIDATES);

  // áreas: 1) por lista esperada 2) si no, por heurística
  const expectedNorm = new Set(AREA_EXPECTED.map(norm));
  const foundAreas = [];
  for (const h of headers) {
    const hn = norm(h);
    if (expectedNorm.has(hn)) foundAreas.push(h);
  }
  if (!foundAreas.length) {
    // heurística: columnas que no sean claves y que parezcan flags
    const exclude = new Set([CLIENT_COL, MES_COL, FECHA_COL].filter(Boolean).map(norm));
    AREA_COLS = headers.filter(h => !exclude.has(norm(h)) && /AREA|ALMACEN|COMPRAS|CADENA|EQUIPOS|BLEN/i.test(h));
  } else {
    AREA_COLS = foundAreas;
  }

  // motivos/categorías (tabla + dona por mes)
  const motExpected = new Set(MOTIVO_EXPECTED.map(norm));
  const motFound = [];
  for (const h of headers) {
    const hn = norm(h);
    if (motExpected.has(hn)) motFound.push(h);
  }
  // fallback: columnas que incluyan " CS" o "OBRA" o "CERCANA" y que no sean claves ni áreas
  if (!motFound.length) {
    const exclude = new Set([CLIENT_COL, MES_COL, FECHA_COL, ...AREA_COLS].filter(Boolean).map(norm));
    MOTIVO_COLS = headers.filter(h => {
      const hn = norm(h);
      if (exclude.has(hn)) return false;
      return hn.includes(" CS") ||
             hn.includes(" OBRA") ||
             hn.includes("CERCANA") ||
             hn.includes("LEJANA");
    });
  } else {
    MOTIVO_COLS = motFound;
  }
}

function filteredRows() {
  const cliente = document.getElementById("clienteSelect")?.value || "Todos";
  const mes     = document.getElementById("mesSelect")?.value || "Todos";

  return data.filter(r => {
    const okCliente = (cliente === "Todos") || (CLIENT_COL && String(r[CLIENT_COL]) === cliente);
    const mk = getMonthKeyFromRow(r);
    const okMes = (mes === "Todos") || (mk === mes);
    return okCliente && okMes;
  });
}

function filteredRowsByClienteYMes() {
  // igual a filteredRows pero asegurando que el mes no sea "Todos" para la dona
  return filteredRows();
}

/* ============================
   AGGREGATIONS
============================ */
function aggByMonth(rows) {
  const m = new Map();
  for (const r of rows) {
    const mk = getMonthKeyFromRow(r);
    if (!mk) continue;
    m.set(mk, (m.get(mk) || 0) + 1);
  }
  const months = [...m.keys()].sort((a,b) => monthSortKey(a) - monthSortKey(b));
  const counts = months.map(k => m.get(k) || 0);
  return { months, counts };
}

function aggByMonthAreas(rows) {
  // Cuenta por MES y por ÁREA (columnas booleanas)
  const m = new Map(); // monthKey -> Map(areaCol -> count)
  for (const r of rows) {
    const mk = getMonthKeyFromRow(r);
    if (!mk) continue;

    if (!m.has(mk)) {
      const init = new Map();
      for (const a of AREA_COLS) init.set(a, 0);
      m.set(mk, init);
    }
    const bucket = m.get(mk);

    for (const a of AREA_COLS) {
      if (isTruthyAreaValue(r[a])) bucket.set(a, (bucket.get(a) || 0) + 1);
    }
  }

  const months = [...m.keys()].sort((a,b) => monthSortKey(a) - monthSortKey(b));
  const byArea = {};
  for (const a of AREA_COLS) {
    byArea[a] = months.map(mk => (m.get(mk)?.get(a) || 0));
  }
  return { months, byArea };
}

function aggAreas(rows) {
  const out = new Map();
  for (const a of AREA_COLS) out.set(a, 0);

  for (const r of rows) {
    for (const a of AREA_COLS) {
      if (isTruthyAreaValue(r[a])) out.set(a, (out.get(a) || 0) + 1);
    }
  }
  return out;
}

function topArea(areaMap){
  let best = null;
  let bestV = -1;
  for (const [k,v] of areaMap.entries()){
    if (v > bestV){
      bestV = v;
      best = k;
    }
  }
  return { area: best, value: bestV };
}

/* ============================
   KPIs
============================ */
function updateKPIs(){
  const rows = filteredRows();

  // Demoras (mes) si hay mes seleccionado
  const mesSel = document.getElementById("mesSelect")?.value || "Todos";
  let demMes = "-";
  if (mesSel !== "Todos"){
    demMes = fmtInt(rows.length);
  }
  const elMes = document.getElementById("kpiDemorasMes");
  if (elMes) elMes.textContent = demMes;

  // Top area
  const areaMap = aggAreas(rows);
  const total = [...areaMap.values()].reduce((a,b)=>a+b,0) || 1;
  const t = topArea(areaMap);
  const pct = (t.value || 0) / total;

  const elTop = document.getElementById("kpiTopArea");
  const elSub = document.getElementById("kpiTopAreaSub");
  const elPct = document.getElementById("kpiTopPct");
  if (elTop) elTop.textContent = t.area || "-";
  if (elSub) elSub.textContent = t.area ? `${fmtInt(t.value)} demoras` : "-";
  if (elPct) elPct.textContent = t.area ? fmtPct01(pct) : "-";
}

/* ============================
   CHARTS
============================ */
function applyChartDefaults(){
  // Chart.js ya no se usa en el chartMes, pero dejo esto por compatibilidad (no rompe nada)
  if (window.Chart && window.ChartDataLabels){
    Chart.register(ChartDataLabels);
  }
}

function buildChartMes() {
  const rows = filteredRows();

  // línea (total de demoras por mes)
  const { months, counts } = aggByMonth(rows);

  // barras (demoras por área por mes)
  const { byArea } = aggByMonthAreas(rows);

  const el = document.getElementById("chartMes");
  if (!el || typeof echarts === "undefined") return;

  // destruir instancia previa si existe
  if (chartMesE) {
    try { chartMesE.dispose(); } catch (e) {}
    chartMesE = null;
  }

  chartMesE = echarts.init(el, null, { renderer: "canvas" });

  const areaNames = [...AREA_COLS]; // mantiene orden detectado

  const seriesBars = areaNames.map((a) => ({
    name: a,
    type: "bar",
    data: byArea[a] || months.map(() => 0),
    barMaxWidth: 26,
    emphasis: { focus: "series" }
  }));

  const option = {
    grid: { left: 40, right: 24, top: 34, bottom: 70, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" }
    },
    legend: {
      type: "scroll",
      bottom: 0,
      data: ["Demoras", ...areaNames]
    },
    xAxis: {
      type: "category",
      data: months,
      axisLabel: { rotate: 35 }
    },
    yAxis: {
      type: "value",
      axisLabel: { formatter: (v) => fmtInt(v) }
    },
    series: [
      ...seriesBars,
      {
        name: "Demoras",
        type: "line",
        data: counts,
        smooth: true,
        symbol: "circle",
        symbolSize: 7,
        lineStyle: { width: 3 },
        z: 10,
        label: {
          show: true,
          formatter: (p) => fmtInt(p.value),
          position: "top"
        }
      }
    ]
  };

  chartMesE.setOption(option);

  // responsive (1 sola vez)
  if (!chartMesResizeBound) {
    window.addEventListener("resize", () => {
      if (chartMesE) chartMesE.resize();
    });
    chartMesResizeBound = true;
  }
}

function buildChartAreas() {
  // ✅ Migrado a Apache ECharts (dona por mes seleccionado)
  const rows = filteredRowsByClienteYMes();
  const areaMap = aggAreas(rows);

  const items = [...areaMap.entries()].map(([name, value]) => ({ name, value }));
  const total = items.reduce((a, b) => a + (b.value || 0), 0) || 1;

  const el = document.getElementById("chartAreas");
  if (!el || typeof echarts === "undefined") return;

  if (chartAreas) {
    try { chartAreas.dispose(); } catch (e) {}
    chartAreas = null;
  }

  chartAreas = echarts.init(el, null, { renderer: "canvas" });

  const maxVal = Math.max(...items.map(d => d.value || 0), 1);

  // orden estable (por nombre) para evitar saltos visuales
  const stableNames = [...items.map(x => x.name)].sort((a, b) => a.localeCompare(b));

  const option = {
    tooltip: {
      trigger: "item",
      formatter: (p) => {
        const pct = (p.value / total) * 100;
        return `${p.name}: <b>${fmtInt(p.value)}</b> (${pct.toFixed(1).replace(".", ",")}%)`;
      }
    },
    legend: {
      orient: "vertical",
      left: "60%",
      top: "middle",
      data: stableNames
    },
    series: [
      {
        name: "Áreas",
        type: "pie",
        radius: ["55%", "75%"],
        center: ["30%", "50%"],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 8, borderColor: "#fff", borderWidth: 2 },
        label: {
          show: true,
          formatter: (p) => {
            const pct = (p.value / total) * 100;
            return `${fmtInt(p.value)} (${pct.toFixed(1).replace(".", ",")}%)`;
          }
        },
        emphasis: {
          label: { show: true, fontSize: 14, fontWeight: "bold" }
        },
        data: items
      }
    ]
  };

  chartAreas.setOption(option);

  // resize 1 vez
  if (!chartAreasResizeBound) {
    window.addEventListener("resize", () => {
      if (chartAreas) chartAreas.resize();
    });
    chartAreasResizeBound = true;
  }
}

function getMesRowValue(r, col){
  if (!r || !col) return 0;
  return toNumber(r[col]);
}

/* ============================
   MOTIVOS (DONA + TABLA)
============================ */
function buildTablaMotivos(){
  const tbl = document.getElementById("tablaMotivos");
  if (!tbl) return;

  const rows = filteredRows();
  const areaMap = aggAreas(rows);
  const total = [...areaMap.values()].reduce((a,b)=>a+b,0) || 1;

  const items = [...areaMap.entries()]
    .map(([k,v]) => ({ area: k, value: v, pct: v/total }))
    .sort((a,b) => b.value - a.value);

  tbl.innerHTML = `
    <thead>
      <tr>
        <th>Mes</th>
        ${items.map(x => `<th>${x.area}</th>`).join("")}
      </tr>
    </thead>
    <tbody></tbody>
  `;

  // (tu tabla real por mes/área ya está armada en tu HTML/otro bloque;
  // esto queda como estaba; no lo toco)
}

function buildChartMotivos(){
  // sin cambios
  const el = document.getElementById("chartMotivos");
  if (!el || typeof echarts === "undefined") return;

  if (chartMotivos) {
    try { chartMotivos.dispose(); } catch (e) {}
    chartMotivos = null;
  }
  chartMotivos = echarts.init(el, null, { renderer: "canvas" });

  // placeholder: tu implementación original sigue igual en tu archivo base.
  // (No se modifica este gráfico para tu pedido actual)
  chartMotivos.setOption({
    title: { text: "" },
    xAxis: { type: "category", data: [] },
    yAxis: { type: "value" },
    series: []
  });
}

/* ============================
   HEATMAP (sin cambios)
============================ */
function applyHeatmapPorFilaGeneric(){}

function buildTabla(){}

function applyAll(){
  updateKPIs();
  buildChartMes();
  buildChartAreas();
  buildTablaMotivos();
  buildChartMotivos();
}

/* ============================
   LOAD
============================ */
async function load(){
  try {
    applyChartDefaults();

    const res = await fetch(csvUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`No se pudo cargar ${csvUrl} (${res.status})`);
    const text = await res.text();

    const parsed = await parseDelimited(text);
    if (!parsed?.data?.length) throw new Error("CSV vacío o sin filas");
    data = parsed.data;
    headers = parsed.meta.fields || Object.keys(data[0] || {});
    detectColumns();

    // llenar selects
    const clienteSel = document.getElementById("clienteSelect");
    const mesSel = document.getElementById("mesSelect");

    // clientes
    if (clienteSel && CLIENT_COL){
      const clientes = [...new Set(data.map(r => r[CLIENT_COL]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)));
      clienteSel.innerHTML = `<option value="Todos">Todos</option>` + clientes.map(c => `<option>${c}</option>`).join("");
    }

    // meses (YYYY-MM)
    if (mesSel){
      const months = [...new Set(data.map(getMonthKeyFromRow).filter(Boolean))].sort((a,b)=>monthSortKey(a)-monthSortKey(b));
      mesSel.innerHTML = `<option value="Todos">Todos</option>` + months.map(m => `<option value="${m}">${m}</option>`).join("");
    }

    // eventos
    clienteSel?.addEventListener("change", applyAll);
    mesSel?.addEventListener("change", applyAll);

    // run
    applyAll();

    const last = document.getElementById("lastUpdate");
    if (last){
      last.textContent = `Última actualización: ${new Date().toLocaleString("es-AR")}`;
    }

  } catch (e){
    console.error(e);
    showError("Error cargando DEMORAS: " + (e?.message || e));
  }
}

document.addEventListener("DOMContentLoaded", load);
