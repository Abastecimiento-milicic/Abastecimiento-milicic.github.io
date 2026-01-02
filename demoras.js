const csvUrl = "DEMORAS.csv"; // IMPORTANTE: respeta mayúsculas/minúsculas exactas del repo

let data = [];
let headers = [];

let CLIENT_COL = null;
let MES_COL = null;
let FECHA_COL = null;
let AREA_COLS = [];

let chartMesE = null;
let chartMesResizeBound = false;

function norm(s){
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function showError(msg){
  const el = document.getElementById("msg");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
}

function parseDateAny(v){
  if (!v) return null;
  const s = String(v).trim();
  let d = new Date(s);
  if (!isNaN(d)) return d;

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

function monthSortKey(mk){
  if (/^\d{4}-\d{2}$/.test(mk)){
    const [y,mm] = mk.split("-").map(Number);
    return y*100 + mm;
  }
  return 0;
}

function getMonthKeyFromRow(r){
  if (MES_COL && r[MES_COL]){
    const s = String(r[MES_COL]).trim();
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    const d = parseDateAny(s);
    if (d) return monthKey(d);
  }
  if (FECHA_COL && r[FECHA_COL]){
    const d = parseDateAny(r[FECHA_COL]);
    if (d) return monthKey(d);
  }
  return null;
}

function isTruthyAreaValue(v){
  if (v == null) return false;
  const t = String(v).trim();
  if (!t) return false;
  if (t === "0" || t === "0.0") return false;
  if (t.toLowerCase() === "false") return false;
  return true;
}

function fmtInt(n){
  const x = Number(n) || 0;
  return x.toLocaleString("es-AR");
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

  CLIENT_COL = findCol(["Cliente","CLIENTE"]);
  MES_COL    = findCol(["Mes","MES","MES ENTREGA","MES DE ENTREGA"]);
  FECHA_COL  = findCol(["Fecha","FECHA","FECHA ENTREGA","FECHA DE ENTREGA"]);

  // Detectar columnas de áreas por nombre
  const AREA_EXPECTED = [
    "EQUIPOS MENORES",
    "CADENA DE SUMINISTROS",
    "CADENA D' SUMINISTRO",
    "ALMACÉN",
    "ALMACEN",
    "BLEN",
    "COMPRAS",
    "COMPRAS EQUIPOS",
    "COMPRAS EQUIPOS MENORES",
    "COMPRAS AGV"
  ];

  const expectedNorm = new Set(AREA_EXPECTED.map(norm));
  AREA_COLS = headers.filter(h => expectedNorm.has(norm(h)));

  // Si no encontró nada (por diferencia de nombres), fallback heurístico
  if (!AREA_COLS.length){
    const exclude = new Set([CLIENT_COL, MES_COL, FECHA_COL].filter(Boolean).map(norm));
    AREA_COLS = headers.filter(h =>
      !exclude.has(norm(h)) &&
      /ALMACEN|ALMACÉN|COMPRAS|CADENA|EQUIPOS|BLEN/i.test(h)
    );
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
  const m = new Map(); // monthKey -> Map(area -> count)

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

function buildChartMes() {
  const rows = filteredRows();
  const { months, counts } = aggByMonth(rows);
  const { byArea } = aggByMonthAreas(rows);

  const el = document.getElementById("chartMes");
  if (!el || typeof echarts === "undefined") return;

  if (chartMesE) {
    try { chartMesE.dispose(); } catch(e){}
    chartMesE = null;
  }
  chartMesE = echarts.init(el);

  const areaNames = [...AREA_COLS];

  const seriesBars = areaNames.map((a) => ({
    name: a,
    type: "bar",
    data: byArea[a] || months.map(() => 0),
    barMaxWidth: 24,
    emphasis: { focus: "series" }
  }));

  const option = {
    grid: { left: 45, right: 20, top: 25, bottom: 70, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { type: "scroll", bottom: 0, data: [...areaNames, "Demoras"] },
    xAxis: { type: "category", data: months, axisLabel: { rotate: 35 } },
    yAxis: { type: "value", axisLabel: { formatter: (v) => fmtInt(v) } },
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
        label: { show: true, position: "top", formatter: (p) => fmtInt(p.value) }
      }
    ]
  };

  chartMesE.setOption(option);

  if (!chartMesResizeBound){
    window.addEventListener("resize", () => chartMesE && chartMesE.resize());
    chartMesResizeBound = true;
  }
}

async function load(){
  try {
    // ✅ si falta PapaParse te lo digo explícito
    if (typeof Papa === "undefined") {
      throw new Error("Falta PapaParse. Agregá el script de papaparse en demoras.html (ya te lo pasé corregido).");
    }

    const res = await fetch(csvUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`No se pudo cargar ${csvUrl} (${res.status})`);
    const text = await res.text();

    const parsed = await new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        delimiter: "", // autodetect
        complete: resolve,
        error: reject
      });
    });

    if (!parsed?.data?.length) throw new Error("CSV vacío o sin filas");

    data = parsed.data;
    headers = parsed.meta.fields || Object.keys(data[0] || {});
    detectColumns();

    // llenar selects
    const clienteSel = document.getElementById("clienteSelect");
    const mesSel = document.getElementById("mesSelect");

    if (clienteSel && CLIENT_COL){
      const clientes = [...new Set(data.map(r => r[CLIENT_COL]).filter(Boolean))]
        .sort((a,b)=>String(a).localeCompare(String(b)));
      clienteSel.innerHTML = `<option value="Todos">Todos</option>` + clientes.map(c => `<option>${c}</option>`).join("");
      clienteSel.addEventListener("change", buildChartMes);
    }

    if (mesSel){
      const months = [...new Set(data.map(getMonthKeyFromRow).filter(Boolean))]
        .sort((a,b)=>monthSortKey(a)-monthSortKey(b));
      mesSel.innerHTML = `<option value="Todos">Todos</option>` + months.map(m => `<option value="${m}">${m}</option>`).join("");
      mesSel.addEventListener("change", buildChartMes);
    }

    buildChartMes();

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
