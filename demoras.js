(function() {
  /* ============================
     DEMORAS - CONFIG
  ============================ */
  const csvUrl = "DEMORAS.csv";
  const DELIM = ";";

  const CLIENT_CANDIDATES = ["CLIENTE", "CLIENTE / OBRA", "CLIENTE NRO.", "OBRA", "ALMACEN", "ALMACÉN"];
  const GC_CANDIDATES = ["CARACTER DE GC", "CARÁCTER DE GC", "CARACTER GC", "CARACTER_DE_GC", "CARACTER"];
  const MES_CANDIDATES = ["AÑOMES", "AñoMes", "MES", "Mes", "MES ENTREGA", "MES DE ENTREGA"];

  const FECHA_CANDIDATES = [
      "FECHA", "Fecha", "FECHA ENTREGA", "Fecha entrega",
      "FECHA ENTREGA ESPERADA", "FECHA ENTREGA OC", "Fecha OC"
  ];

  const AREA_EXPECTED = [
      "PROYECTO",
      "ALMACEN",
      "ALMACÉN",
      "TRASLADO",
      "EXPEDICION",
      "EQUIPOS MENORES",
      "COMPRAS",
      "COMPRAS EQUIPOS",
      "COMPRAS AGV"
  ];

  const MOTIVO_EXPECTED = [
      "LIBERACION SOLPED CS",
      "COLOCACION OC CS",
      "LIBERACION OC CS",
      "PLAZO DE ENTREGA EXCEDIDO CS",
      "ENTREGA DEL PROVEEDOR CS",
      "FECHA ENTREGA MUY CERCANA",
      "FECHAENTREGAMUYCERCANA"
  ];

  const MONTH_NAMES = {
      "01": "ENERO", "02": "FEBRERO", "03": "MARZO", "04": "ABRIL",
      "05": "MAYO", "06": "JUNIO", "07": "JULIO", "08": "AGOSTO",
      "09": "SEPTIEMBRE", "10": "OCTUBRE", "11": "NOVIEMBRE", "12": "DICIEMBRE"
  };

  /* ============================
     GLOBAL (Isolated inside IIFE)
  ============================ */
  let data = [];
  let headers = [];

  let CLIENT_COL = null;
  let GC_COL = null;
  let MES_COL = null;
  let FECHA_COL = null;
  let AREA_COLS = [];
  let MOTIVO_COLS = [];

  let chartMes = null;
  let chartAreas = null;
  let chartMotivos = null;
  let chartAreasResizeBound = false;
  let chartMesResizeBound = false;
  let chartMotivosResizeBound = false;

  /* ============================
     HELPERS
  ============================ */
  const clean = (v) => (v ?? "")
      .toString()
      .replace(/^\uFEFF/, "")
      .replace(/\s+/g, " ")
      .trim();

  function norm(s) {
      return clean(s)
          .toUpperCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ")
          .trim();
  }

  function getDisplayName(name) {
      if (name === "FECHAENTREGAMUYCERCANA CON PRIORIDAD") {
          return "FECHA ENTREGA MUY CERCANA (CON PRIORIDAD)";
      }
      if (name === "FECHAENTREGAMUYCERCANA SIN PRIORIDAD") {
          return "FECHA ENTREGA MUY CERCANA (SIN PRIORIDAD)";
      }
      const normalized = norm(name);
      if (normalized === norm("CADENA DE SUMINISTRO") || normalized === norm("CADENA DE SUMINISTROS")) {
          return "PROYECTO";
      }
      if (normalized === norm("BLEN")) {
          return "BLEND";
      }
      return name;
  }

  function getMotivosList() {
      const list = [];
      for (const m of MOTIVO_COLS) {
          if (norm(m) === norm("FECHAENTREGAMUYCERCANA")) {
              list.push("FECHAENTREGAMUYCERCANA SIN PRIORIDAD");
              list.push("FECHAENTREGAMUYCERCANA CON PRIORIDAD");
          } else {
              list.push(m);
          }
      }
      return list;
  }

  function enforceAllOption(sel) {
      if (!sel) return;
      const allOpt = [...sel.options].find(o => o.value === "__ALL__");
      if (!allOpt) return;

      const selected = [...sel.selectedOptions].map(o => o.value);
      if (selected.includes("__ALL__") && selected.length > 1) {
          [...sel.options].forEach(o => { o.selected = (o.value === "__ALL__"); });
          return;
      }
      if (!selected.length) {
          allOpt.selected = true;
      } else if (!selected.includes("__ALL__")) {
          allOpt.selected = false;
      }
  }

  function getSelValues(id) {
      const sel = getEl(id);
      if (!sel) return [];
      enforceAllOption(sel);
      const vals = [...sel.selectedOptions].map(o => o.value);
      if (!vals.length) return [];
      if (vals.includes("__ALL__")) return [];
      return vals.filter(v => v !== "");
  }

  function selLabel(id) {
      const v = getSelValues(id);
      return v.length ? v.join("-") : "Todos";
  }

  function toNumber(v) {
      let x = clean(v);
      if (!x) return 0;
      x = x.replace(/\s/g, "");
      if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
      const n = Number(x);
      return Number.isFinite(n) ? n : 0;
  }

  function isTruthyAreaValue(v) {
      const t = clean(v);
      if (!t) return false;
      if (t === "0" || t === "0,0" || t === "0.0") return false;
      if (["NO", "FALSE"].includes(norm(t))) return false;
      return true;
  }

  function fmtInt(n) {
      return Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
  }

  function fmtPct01(x) {
      if (!isFinite(x)) return "-";
      return (x * 100).toFixed(1).replace(".", ",") + "%";
  }

  function showError(msg) {
      const el = document.getElementById("dem_msg");
      if (el) el.innerHTML = `<div class="error">${msg}</div>`;
  }

  /* ============================
     DOWNLOAD (CSV filtrado)
  ============================ */
  function escapeCsvCell(v, delimiter = ";") {
      const s = (v ?? "").toString();
      const mustQuote = s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(delimiter);
      const out = s.replace(/"/g, '""');
      return mustQuote ? `"${out}"` : out;
  }

  function rowsToCsv(rows, delimiter = ";") {
      const head = headers.map(h => escapeCsvCell(h, delimiter)).join(delimiter);
      const lines = rows.map(r => headers.map(h => escapeCsvCell(r[h], delimiter)).join(delimiter));
      return [head, ...lines].join("\n");
  }

  async function downloadFilteredCsv() {
      if (!headers.length || !data.length) return;

      const rows = filteredRowsByClienteYMes();

      const cliente = selLabel("dem2_clienteSelect").replace(/[^\w\-]+/g, "_");
      const mes = selLabel("dem2_mesSelect").replace(/[^\w\-]+/g, "_");

      const filename = `DEMORAS_filtrado_${cliente}_${mes}.xlsx`;
      await window.saveAsExcel(filename, "Demoras", headers, rows);
  }

  function monthSortKey(m) {
      if (!m) return new Date(0);

      const ym = m.match(/^(\d{4})-(\d{2})$/);
      if (ym) return new Date(+ym[1], +ym[2] - 1, 1);

      const meses = {
          "enero": 0, "febrero": 1, "marzo": 2, "abril": 3,
          "mayo": 4, "junio": 5, "julio": 6, "agosto": 7,
          "septiembre": 8, "octubre": 9, "noviembre": 10, "diciembre": 11
      };

      const k = norm(m).toLowerCase();
      if (k in meses) return new Date(2000, meses[k], 1);

      return new Date(0);
  }

  /* ============================
     DATE / MONTH
  ============================ */
  function parseDateAny(s) {
      const t = clean(s);
      if (!t) return null;

      let m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (m) return new Date(+m[3], +m[2] - 1, +m[1]);

      m = t.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

      return null;
  }

  function monthKey(d) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function getMonthKeyFromRow(r) {
      if (MES_COL) {
          const m = clean(r[MES_COL]);
          return m || null;
      }
      if (FECHA_COL) {
          const d = parseDateAny(r[FECHA_COL]);
          return d ? monthKey(d) : null;
      }
      return null;
  }

  /* ============================
     CSV PARSER (quotes safe)
  ============================ */
  function parseDelimited(text, delimiter = ";") {
    const result = Papa.parse(text, { delimiter: delimiter, skipEmptyLines: true });
    return result.data;
  }

  /* ============================
     DETECT COLUMNS
  ============================ */
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
      GC_COL = findCol(GC_CANDIDATES);
      MES_COL = findCol(MES_CANDIDATES);
      FECHA_COL = findCol(FECHA_CANDIDATES);

      const expectedNorm = new Set(AREA_EXPECTED.map(norm));
      const found = [];

      for (const h of headers) {
          const hn = norm(h);
          if (expectedNorm.has(hn)) found.push(h);
      }

      AREA_COLS = found.filter(c => norm(c) !== "TOTAL");

      if (!AREA_COLS.length) {
          const keys = ["COMPRAS", "ALMACEN", "PROYECTO", "EQUIPOS", "TRASLADO", "EXPEDICION", "AGV"];
          AREA_COLS = headers.filter(h => keys.some(k => norm(h).includes(k)));
      }

      const motExpected = new Set(MOTIVO_EXPECTED.map(norm));
      const motFound = [];
      for (const h of headers) {
          const hn = norm(h);
          if (motExpected.has(hn)) motFound.push(h);
      }
      if (!motFound.length) {
          const exclude = new Set([CLIENT_COL, MES_COL, FECHA_COL, ...AREA_COLS].filter(Boolean).map(norm));
          MOTIVO_COLS = headers.filter(h => {
              const hn = norm(h);
              if (exclude.has(hn)) return false;
              return hn.includes(" CS") || hn.endsWith("CS") || hn.includes("OBRA") || hn.includes("CERCANA");
          });
      } else {
          MOTIVO_COLS = motFound;
      }
  }

  /* ============================
     FILTERS
  ============================ */
  function filteredRows() {
      let rows = data;

      const cs = getSelValues("dem2_clienteSelect");
      if (cs.length && CLIENT_COL) {
          const set = new Set(cs);
          rows = rows.filter(r => set.has(clean(r[CLIENT_COL])));
      }

      const gcs = getCheckedClasif();
      if (gcs.length && GC_COL) {
          const set = new Set(gcs);
          rows = rows.filter(r => set.has(norm(r[GC_COL])));
      }

      return rows;
  }

  function filteredRowsByClienteYMes() {
      const rows = filteredRows();
      const ms = getSelValues("dem2_mesSelect");
      if (!ms.length) return rows;
      const set = new Set(ms);
      return rows.filter(r => set.has(getMonthKeyFromRow(r)));
  }

  /* ============================
     SELECTS
  ============================ */
  function renderClientes() {
      const sel = getEl("dem2_clienteSelect");
      if (!sel) return;

      if (!sel.querySelector("option[value='__ALL__']")) {
          const optAll = document.createElement("option");
          optAll.value = "__ALL__";
          optAll.textContent = "Todos";
          sel.appendChild(optAll);
      }

      const prevSet = new Set([...sel.selectedOptions].map(o => o.value));
      sel.querySelectorAll("option:not([value='__ALL__'])").forEach(o => o.remove());

      if (!CLIENT_COL) return;

      const clientes = [...new Set(data.map(r => clean(r[CLIENT_COL])).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, "es"));

      for (const c of clientes) {
          const o = document.createElement("option");
          o.value = c;
          o.textContent = c;
          if (prevSet.has(c)) o.selected = true;
          sel.appendChild(o);
      }

      enforceAllOption(sel);
  }

  function renderGC() {
      const sel = getEl("dem2_clasifSelect");
      if (!sel) return;

      if (!sel.querySelector("option[value='__ALL__']")) {
          const optAll = document.createElement("option");
          optAll.value = "__ALL__";
          optAll.textContent = "Todos";
          sel.appendChild(optAll);
      }

      const prevSet = new Set([...sel.selectedOptions].map(o => o.value));
      sel.querySelectorAll("option:not([value='__ALL__'])").forEach(o => o.remove());

      if (!GC_COL) return;

      const gcs = [...new Set(data.map(r => norm(r[GC_COL])).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, "es"));

      for (const g of gcs) {
          const o = document.createElement("option");
          o.value = g;
          o.textContent = g;
          if (prevSet.has(g)) o.selected = true;
          sel.appendChild(o);
      }

      enforceAllOption(sel);

      const hint = getEl("dem2_clasifHint");
      if (hint) hint.textContent = `Columna: ${GC_COL}`;
  }

  function getCheckedClasif() {
      return getSelValues("dem2_clasifSelect");
  }

  function buildMesSelect(rows) {
      const sel = getEl("dem2_mesSelect");
      if (!sel) return [];

      const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))]
          .sort((a, b) => monthSortKey(a) - monthSortKey(b));

      const prevSet = new Set([...sel.selectedOptions].map(o => o.value));

      sel.innerHTML = "";

      const oAll = document.createElement("option");
      oAll.value = "__ALL__";
      oAll.textContent = "Todos";
      sel.appendChild(oAll);

      for (const m of months) {
          const o = document.createElement("option");
          o.value = m;

          let displayText = m;
          const parts = m.split("-");
          if (parts.length === 2) {
              const [year, monthNum] = parts;
              const name = MONTH_NAMES[monthNum];
              if (name) displayText = `${name} ${year}`;
          }

          o.textContent = displayText;
          if (prevSet.has(m)) o.selected = true;
          sel.appendChild(o);
      }

      const hasPrevValid = [...prevSet].some(v => v && v !== "__ALL__" && months.includes(v));
      if (!hasPrevValid) {
          const allOpt = sel.querySelector("option[value='__ALL__']");
          if (allOpt) allOpt.selected = true;
      }

      enforceAllOption(sel);
      return months;
  }

  /* ============================
     AGG CALCS
  ============================ */
  function countDemoras(rows) {
      return rows.length;
  }

  function aggByMonth(rows) {
      const m = new Map();

      for (const r of rows) {
          const mk = getMonthKeyFromRow(r);
          if (!mk) continue;
          m.set(mk, (m.get(mk) || 0) + 1);
      }
      const months = [...m.keys()].sort((a, b) => monthSortKey(a) - monthSortKey(b));
      const counts = months.map(k => m.get(k) || 0);
      return { months, counts };
  }

  function aggAreas(rows) {
      const out = new Map();

      for (const a of AREA_COLS) {
          out.set(a, 0);
      }

      for (const r of rows) {
          for (const [a, currentVal] of out.entries()) {
              if (isTruthyAreaValue(r[a])) out.set(a, currentVal + 1);
          }
      }
      return out;
  }

  function topArea(areaMap) {
      let best = null;
      let bestVal = -1;
      let total = 0;

      for (const [k, v] of areaMap.entries()) {
          total += v;
          if (v > bestVal) { bestVal = v; best = k; }
      }
      return { best, bestVal, total };
  }

  /* ============================
     KPIs UI
  ============================ */
  function updateKPIs() {
      const rowsMes = filteredRowsByClienteYMes();
      const dem = countDemoras(rowsMes);

      document.getElementById("dem_kpiDemorasMes").textContent = fmtInt(dem);

      const areaMap = aggAreas(rowsMes);
      const t = topArea(areaMap);

      if (!t.best || dem === 0) {
          document.getElementById("dem_kpiTopArea").textContent = "-";
          document.getElementById("dem_kpiTopAreaSub").textContent = "-";
          document.getElementById("dem_kpiTopPct").textContent = "-";
          return;
      }

      const pct = t.total ? (t.bestVal / t.total) : NaN;

      document.getElementById("dem_kpiTopArea").textContent = t.best;
      document.getElementById("dem_kpiTopAreaSub").textContent = `Cant: ${fmtInt(t.bestVal)}`;
      document.getElementById("dem_kpiTopPct").textContent = fmtPct01(pct);

      const elSum = getEl("dem2_kpiSumDemoras");
      if (elSum) elSum.textContent = fmtInt(t.total);
  }

  /* ============================
     CHART DEFAULTS
  ============================ */
  function applyChartDefaults() {
      Chart.register(ChartDataLabels);

      Chart.defaults.color = "#0b1220";
      Chart.defaults.font.family = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
      Chart.defaults.font.weight = "800";

      Chart.defaults.interaction.mode = "index";
      Chart.defaults.interaction.intersect = false;

      Chart.defaults.plugins.tooltip.backgroundColor = "rgba(255,255,255,0.97)";
      Chart.defaults.plugins.tooltip.titleColor = "#0b1220";
      Chart.defaults.plugins.tooltip.bodyColor = "#0b1220";
      Chart.defaults.plugins.tooltip.borderColor = "rgba(2,8,20,.18)";
      Chart.defaults.plugins.tooltip.borderWidth = 1;
      Chart.defaults.plugins.tooltip.padding = 10;
  }

  /* ============================
     CHARTS
  ============================ */
  function buildChartMes() {
      const el = document.getElementById("dem_chartMes");
      if (!el || typeof echarts === "undefined") return;

      const rows = filteredRows();
      let months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))]
          .sort((a, b) => monthSortKey(a) - monthSortKey(b));

      if (!months.length || !AREA_COLS.length) {
          if (chartMes && typeof chartMes.dispose === "function") { chartMes.dispose(); chartMes = null; }
          el.innerHTML = "<div class='hint'>Sin datos para graficar.</div>";
          return;
      }

      const montlyTotals = new Map();
      const maxByMonth = new Map();

      months.forEach(m => {
          const rowsM = rows.filter(r => getMonthKeyFromRow(r) === m);
          let sum = 0;
          let maxVal = -1;
          let maxArea = "";
          const mp = aggAreas(rowsM);

          for (const [area, v] of mp.entries()) {
              sum += v;
              if (v > maxVal) {
                  maxVal = v;
                  maxArea = area;
              }
          }
          montlyTotals.set(m, sum);
          maxByMonth.set(m, { val: maxVal, area: maxArea });
      });

      const basePalette = [
          "#0d6efd", "#20c997", "#ffc107", "#6f42c1", "#fd7e14", "#198754", "#0dcaf0", "#6c757d"
      ];

      const sortedNames = [...AREA_COLS].sort();
      const colorMap = new Map();
      sortedNames.forEach((name, i) => {
          colorMap.set(name, basePalette[i % basePalette.length]);
      });

      const visibleAreas = AREA_COLS.filter(area => {
          const na = norm(area);
          if (na === norm("EQUIPOS MENORES")) return false;
          return true;
      });

      const seriesBars = visibleAreas.map((areaName) => ({
          name: getDisplayName(areaName),
          type: "bar",
          itemStyle: {
              color: colorMap.get(areaName)
          },
          barGap: '10%',
          barCategoryGap: '30%',
          data: months.map(m => {
              const rowsM = rows.filter(r => getMonthKeyFromRow(r) === m);
              const mp = aggAreas(rowsM);
              const val = mp.get(areaName) || 0;

              const monMax = maxByMonth.get(m);
              const isMax = (monMax && monMax.area === areaName && val > 0);

              const areaColor = colorMap.get(areaName);

              return {
                  value: val,
                  month: m,
                  isMax: isMax,
                  area: areaName,
                  itemStyle: {
                      color: isMax ? "#dc3545" : areaColor
                  }
              };
          }),
          label: {
              show: true,
              rotate: 90,
              align: 'left',
              verticalAlign: 'middle',
              position: 'insideBottom',
              distance: 12,
              formatter: (params) => {
                  const v = params.value;
                  if (!v) return "";
                  const d = params.data;
                  const total = montlyTotals.get(d.month) || 0;
                  const pct = total ? ((v / total) * 100).toFixed(1).replace('.', ',') + '%' : '0%';

                  if (d.isMax) {
                      return `{max|${v} - ${pct} - ${getDisplayName(params.seriesName)}}`;
                  }
                  return ` {norm|${v} - ${pct} - ${getDisplayName(params.seriesName)}} `;
              },
              rich: {
                  max: {
                      color: '#fff',
                      backgroundColor: '#dc3545',
                      padding: [4, 6],
                      borderRadius: 4,
                      fontWeight: 800,
                      fontSize: 11,
                      shadowBlur: 2,
                      shadowColor: 'rgba(0,0,0,0.3)'
                  },
                  norm: {
                      color: '#000',
                      backgroundColor: 'rgba(255,255,255, 0.85)',
                      padding: [3, 4],
                      borderRadius: 3,
                      fontWeight: 700,
                      fontSize: 10,
                      borderColor: 'rgba(0,0,0,0.1)',
                      borderWidth: 1
                  }
              }
          }
      }));

      if (chartMes && typeof chartMes.dispose === "function") { chartMes.dispose(); chartMes = null; }
      chartMes = echarts.init(el, null, { renderer: "canvas" });

      const option = {
          tooltip: {
              trigger: "item",
              formatter: (p) => {
                  const m = p.data.month;
                  const total = montlyTotals.get(m) || 0;
                  const pct = total ? ((p.value / total) * 100).toFixed(1) + '%' : '-';
                  return `<b>${p.seriesName}</b><br/>
                  Mes: ${m}<br/>
                  Cantidad: <b>${p.value}</b> (${pct})`;
              }
          },
          legend: { bottom: 0, type: "scroll", textStyle: { fontWeight: 600 } },
          grid: {
              left: 50, right: 30, top: 30, bottom: 85,
              containLabel: true
          },
          dataZoom: [
              {
                  type: 'slider',
                  show: true,
                  xAxisIndex: 0,
                  startValue: 0,
                  endValue: 4,
                  bottom: 40,
                  height: 22,
                  zoomLock: true,
                  brushSelect: false
              },
              {
                  type: 'inside',
                  xAxisIndex: 0,
                  zoomOnMouseWheel: false,
                  moveOnMouseWheel: true
              }
          ],
          xAxis: {
              type: "category",
              data: months,
              axisLabel: { fontWeight: 700, interval: 0 },
              axisTick: { alignWithLabel: true }
          },
          yAxis: { type: "value", splitLine: { lineStyle: { type: 'dashed' } } },
          series: seriesBars
      };

      chartMes.setOption(option, true);

      if (!chartMesResizeBound) {
          chartMesResizeBound = true;
          window.addEventListener("resize", () => {
              if (chartMes) chartMes.resize();
          }, { passive: true });
      }
  }

  function buildChartAreas() {
      const el = document.getElementById("dem_chartAreas");
      if (!el || typeof echarts === "undefined") return;

      const rows = filteredRowsByClienteYMes();
      const areaMap = aggAreas(rows);

      const items = [];
      for (const [k, v] of areaMap.entries()) {
          if (!v) continue;
          items.push({ name: k, value: v });
      }

      if (!items.length) {
          if (chartAreas && typeof chartAreas.dispose === "function") {
              chartAreas.dispose();
              chartAreas = null;
          }
          el.innerHTML = "<div class='hint'>Sin datos para el mes seleccionado.</div>";
          return;
      }

      if (chartAreas && typeof chartAreas.dispose === "function") chartAreas.dispose();
      chartAreas = echarts.init(el, null, { renderer: "canvas" });

      const maxVal = Math.max(...items.map(d => d.value));
      const total = items.reduce((a, b) => a + (Number(b.value) || 0), 0) || 1;

      const palette = [
          "#0d6efd", "#20c997", "#ffc107", "#6f42c1", "#fd7e14", "#198754", "#0dcaf0", "#6c757d"
      ];

      const stableNames = [...items.map(x => x.name)].sort((a, b) => a.localeCompare(b, "es"));
      const colorByName = new Map();
      stableNames.forEach((name, i) => colorByName.set(name, palette[i % palette.length]));

      const dataWithColors = items.map((it) => {
          const isMax = it.value === maxVal;
          const baseColor = colorByName.get(it.name) || "#6c757d";
          return {
              ...it,
              itemStyle: {
                  color: isMax ? "#dc3545" : baseColor,
                  borderWidth: isMax ? 4 : 2,
                  shadowBlur: isMax ? 14 : 0,
                  shadowColor: isMax ? "rgba(0,0,0,0.30)" : "rgba(0,0,0,0)"
              }
          };
      });

      const option = {
          tooltip: {
              trigger: "item",
              formatter: (p) => {
                  const pct = (p.value / total) * 100;
                  return `${getDisplayName(p.name)}: <b>${fmtInt(p.value)}</b> (${pct.toFixed(1).replace(".", ",")}%)`;
              }
          },
          legend: {
              orient: "vertical",
              right: 10,
              top: "middle",
              itemWidth: 18,
              itemHeight: 10,
              formatter: (name) => {
                  const it = items.find(x => x.name === name);
                  const v = it ? it.value : 0;
                  const pct = (v / total) * 100;
                  return `${getDisplayName(name)} - ${pct.toFixed(1).replace(".", ",")}%`;
              }
          },
          series: [
              {
                  name: "% demoras por área",
                  type: "pie",
                  radius: ["40%", "72%"],
                  center: ["40%", "50%"],
                  avoidLabelOverlap: true,
                  itemStyle: {
                      borderColor: "#fff",
                      borderWidth: 2
                  },
                  label: {
                      show: true,
                      position: "outside",
                      fontSize: 12,
                      fontWeight: "bold",
                      formatter: (p) => `${getDisplayName(p.name)}\n${p.value} (${p.percent.toFixed(1).replace(".", ",")}%)`
                  },
                  labelLine: {
                      length: 12,
                      length2: 8,
                      smooth: true
                  },
                  data: dataWithColors
              }
          ]
      };

      chartAreas.setOption(option, true);

      if (!chartAreasResizeBound) {
          chartAreasResizeBound = true;
          window.addEventListener("resize", () => {
              if (chartAreas) chartAreas.resize();
          }, { passive: true });
      }
  }

  function aggMotivosProyecto(rows) {
      const out = new Map();
      const motivos = getMotivosList();
      for (const m of motivos) {
          out.set(m, 0);
      }

      for (const r of rows) {
          for (const m of MOTIVO_COLS) {
              if (isTruthyAreaValue(r[m])) {
                  if (norm(m) === norm("FECHAENTREGAMUYCERCANA")) {
                      const hasPriority = toNumber(r["PRIORIDAD"]) !== 0;
                      const key = hasPriority ? "FECHAENTREGAMUYCERCANA CON PRIORIDAD" : "FECHAENTREGAMUYCERCANA SIN PRIORIDAD";
                      out.set(key, (out.get(key) || 0) + 1);
                  } else {
                      out.set(m, (out.get(m) || 0) + 1);
                  }
              }
          }
      }
      return out;
  }

  function buildChartMotivos() {
      const el = document.getElementById("dem_chartMotivos");
      if (!el || typeof echarts === "undefined") return;

      const rows = filteredRowsByClienteYMes();
      const sumsMap = aggMotivosProyecto(rows);

      const sums = [];
      for (const [k, v] of sumsMap.entries()) {
          if (!v) continue;
          sums.push({ name: k, value: v });
      }

      if (!sums.length) {
          if (chartMotivos && typeof chartMotivos.dispose === "function") {
              chartMotivos.dispose();
              chartMotivos = null;
          }
          el.innerHTML = "<div class='hint'>Sin datos para el mes seleccionado en la subcategoría Proyecto.</div>";
          return;
      }

      if (chartMotivos && typeof chartMotivos.dispose === "function") chartMotivos.dispose();
      chartMotivos = echarts.init(el, null, { renderer: "canvas" });

      const total = sums.reduce((a, b) => a + (Number(b.value) || 0), 0) || 1;
      const maxVal = Math.max(...sums.map(d => d.value));

      const palette = [
          "#0d6efd", "#20c997", "#ffc107", "#6f42c1", "#fd7e14", "#198754", "#0dcaf0", "#6c757d"
      ];

      const stableNames = [...sums.map(x => x.name)].sort((a, b) => a.localeCompare(b, "es"));
      const colorByName = new Map();
      stableNames.forEach((name, i) => {
          if (name === "FECHAENTREGAMUYCERCANA CON PRIORIDAD") {
              colorByName.set(name, "#dc3545");
          } else if (name === "FECHAENTREGAMUYCERCANA SIN PRIORIDAD") {
              colorByName.set(name, "#e4606d");
          } else {
              colorByName.set(name, palette[i % palette.length]);
          }
      });

      const dataPie = sums.map((it) => {
          const isMax = it.value === maxVal;
          const baseColor = colorByName.get(it.name) || "#6c757d";
          return {
              ...it,
              itemStyle: {
                  color: baseColor,
                  borderWidth: isMax ? 4 : 2,
                  shadowBlur: isMax ? 14 : 0,
                  shadowColor: isMax ? "rgba(0,0,0,0.30)" : "rgba(0,0,0,0)"
              }
          };
      });

      chartMotivos.setOption({
          tooltip: {
              trigger: "item",
              formatter: (p) => {
                  const pct = (p.value / total) * 100;
                  return `${getDisplayName(p.name)}: <b>${fmtInt(p.value)}</b> (${pct.toFixed(1).replace(".", ",")}%)`;
              }
          },
          legend: {
              orient: "vertical",
              right: 10,
              top: "middle",
              itemWidth: 18,
              itemHeight: 10,
              formatter: (name) => {
                  const it = sums.find(x => x.name === name);
                  const v = it ? it.value : 0;
                  const pct = (v / total) * 100;
                  return `${getDisplayName(name)} - ${pct.toFixed(1).replace(".", ",")}%`;
              },
              textStyle: { fontSize: 12 }
          },
          series: [{
              name: "Demoras proyecto",
              type: "pie",
              radius: ["60%", "86%"],
              center: ["40%", "50%"],
              avoidLabelOverlap: true,
              itemStyle: {
                  borderColor: "#ffffff",
                  borderWidth: 2
              },
              emphasis: {
                  scale: true,
                  scaleSize: 10,
                  itemStyle: {
                      shadowBlur: 18,
                      shadowColor: "rgba(0,0,0,0.35)"
                  }
              },
              label: {
                  show: true,
                  backgroundColor: "rgba(255,255,255,0.85)",
                  borderRadius: 4,
                  padding: [4, 6],
                  fontSize: 13,
                  fontWeight: "bold",
                  color: "#0b1220",
                  formatter: (p) =>
                      `${getDisplayName(p.name)}\n${fmtInt(p.value)} (${String(p.percent).replace(".", ",")}%)`
              },
              labelLine: {
                  length: 16,
                  length2: 10,
                  smooth: true
              },
              data: dataPie
          }]
      }, true);

      chartMotivos.on('legendselectchanged', (params) => {
          const selected = params.selected;
          let vTotal = 0;
          sums.forEach(s => {
              if (selected[s.name] !== false) vTotal += s.value;
          });

          chartMotivos.setOption({
              legend: {
                  formatter: (name) => {
                      const it = sums.find(x => x.name === name);
                      const v = it ? it.value : 0;
                      const pct = vTotal > 0 ? (v / vTotal) * 100 : 0;
                      return `${getDisplayName(name)} - ${pct.toFixed(1).replace(".", ",")}%`;
                  }
              }
          });
      });
      chartMotivos.resize();

      if (!chartMotivosResizeBound) {
          chartMotivosResizeBound = true;
          window.addEventListener("resize", () => {
              if (chartMotivos) chartMotivos.resize();
          }, { passive: true });
      }
  }

  function applyHeatmapPorFilaGeneric(tbl) {
      const trs = Array.from(tbl.querySelectorAll("tbody tr"));
      trs.forEach(tr => {
          const cells = Array.from(tr.querySelectorAll("td.td-num"));
          const vals = cells.map(td => Number(td.dataset.v ?? 0));
          if (!vals.length) return;
          const min = Math.min(...vals);
          const max = Math.max(...vals);
          const range = max - min;
          cells.forEach((td, i) => {
              const v = vals[i];
              const t = range === 0 ? 0 : (v - min) / range;
              td.style.setProperty("background-color", heatColorWhiteOrangeRed(t), "important");
              td.style.setProperty("color", t >= 0.72 ? "#ffffff" : "#0b1220", "important");
              td.style.fontWeight = t >= 0.85 ? "800" : "600";
          });
      });
  }

  /* ============================
     TABLE
  ============================ */
  function buildTabla() {
      const rows = filteredRows();
      const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))]
          .sort((a, b) => monthSortKey(a) - monthSortKey(b));

      const thead = document.querySelector("#dem_tablaAreas thead");
      const tbody = document.querySelector("#dem_tablaAreas tbody");
      if (!thead || !tbody) return;

      const visibleAreas = AREA_COLS.filter(area => {
          const na = norm(area);
          if (na === norm("EQUIPOS MENORES")) return false;
          return true;
      });
      const cols = ["Mes", ...visibleAreas.map(getDisplayName)];
      thead.innerHTML = `<tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr>`;

      const lines = [];
      for (const m of months) {
          const rowsM = rows.filter(r => getMonthKeyFromRow(r) === m);
          const areaMap = aggAreas(rowsM);

          const tds = [
              `<td class="td-strong">${m}</td>`,
              ...visibleAreas.map(a => {
                  const v = areaMap.get(a) || 0;
                  return `<td class="td-num" data-v="${v}">${fmtInt(v)}</td>`;
              })
          ];
          lines.push(`<tr>${tds.join("")}</tr>`);
      }

      tbody.innerHTML = lines.join("");
      applyHeatmapPorFila();
  }

  function buildTablaMotivos() {
      const rows = filteredRows();
      const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))]
          .sort((a, b) => monthSortKey(a) - monthSortKey(b));

      const thead = document.querySelector("#dem_tablaMotivos thead");
      const tbody = document.querySelector("#dem_tablaMotivos tbody");
      if (!thead || !tbody) return;

      const motivos = getMotivosList();
      const cols = ["Mes", ...motivos.map(getDisplayName)];
      thead.innerHTML = `<tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr>`;

      const lines = [];
      for (const m of months) {
          const rowsM = rows.filter(r => getMonthKeyFromRow(r) === m);
          const sumsMap = aggMotivosProyecto(rowsM);

          const tds = [
              `<td class="td-strong">${m}</td>`,
              ...motivos.map(a => {
                  const v = sumsMap.get(a) || 0;
                  return `<td class="td-num" data-v="${v}">${fmtInt(v)}</td>`;
              })
          ];
          lines.push(`<tr>${tds.join("")}</tr>`);
      }

      tbody.innerHTML = lines.join("");
      const tbl = document.getElementById("dem_tablaMotivos");
      if (tbl) applyHeatmapPorFilaGeneric(tbl);
  }



  function getEl(id) {
      let el = document.getElementById(id);
      if (el) return el;
      const altIds = [
          id.replace(/^dem2_/, "dem_"),
          id.replace(/^dem2_/, ""),
          id.replace(/^dem_/, "dem2_"),
          id.replace(/^dem_/, ""),
          "dem2_" + id,
          "dem_" + id
      ];
      for (const alt of altIds) {
          el = document.getElementById(alt);
          if (el) return el;
      }
      return null;
  }

  function generateSparklineSVG(values) {
      if (!values || values.length < 2) return '';
      const width = 80;
      const height = 20;
      const padding = 2;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;
      
      const points = values.map((val, index) => {
          const x = padding + (index / (values.length - 1)) * (width - padding * 2);
          const y = height - padding - ((val - min) / range) * (height - padding * 2);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      
      return `
        <svg class="sparkline-svg" width="${width}" height="${height}">
          <polyline fill="none" stroke="#0d9488" stroke-width="1.5" points="${points}" />
          <circle cx="${points.split(' ')[points.split(' ').length - 1].split(',')[0]}" 
                  cy="${points.split(' ')[points.split(' ').length - 1].split(',')[1]}" 
                  r="2" fill="#0f766e" />
        </svg>
      `;
  }

  function buildSparklinesTable() {
      const tbody = getEl("dem2_tbodySparklines");
      if (!tbody) return;

      const rowsAll = filteredRows();
      const rowsMes = filteredRowsByClienteYMes();
      const totalDem = countDemoras(rowsMes);

      const areaMap = aggAreas(rowsMes);

      const months = [...new Set(rowsAll.map(getMonthKeyFromRow).filter(Boolean))]
          .sort((a, b) => monthSortKey(a) - monthSortKey(b));

      const trends = {};
      AREA_COLS.forEach(area => {
          trends[area] = months.map(m => {
              const rowsM = rowsAll.filter(r => getMonthKeyFromRow(r) === m);
              let count = 0;
              rowsM.forEach(r => {
                  if (isTruthyAreaValue(r[area])) count++;
              });
              return count;
          });
      });

      const sortedAreas = [...AREA_COLS].sort((a, b) => {
          const countA = areaMap.get(a) || 0;
          const countB = areaMap.get(b) || 0;
          return countB - countA;
      });

      let sumDemoras = 0;
      sortedAreas.forEach(area => {
          sumDemoras += areaMap.get(area) || 0;
      });

      const trs = [];
      sortedAreas.forEach(area => {
          const count = areaMap.get(area) || 0;
          const pct = sumDemoras > 0 ? (count / sumDemoras) : 0;
          const trendVals = trends[area] || [];
          const sparklineSVG = generateSparklineSVG(trendVals);

          const dispName = getDisplayName(area);
          
          trs.push(`
              <tr>
                  <td class="td-strong" style="font-weight: 600; color: #0f172a; padding: 12px; text-align: left;">${dispName}</td>
                  <td style="text-align: center; font-weight: 700; color: #1e293b; padding: 12px;">${fmtInt(count)}</td>
                  <td style="text-align: center; padding: 12px;">
                      <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                          <span style="font-weight: 600; color: #047857; min-width: 45px; text-align: right;">${fmtPct01(pct)}</span>
                          ${sparklineSVG}
                      </div>
                  </td>
                  <td style="text-align: center; padding: 12px;">
                      <button class="btn-action-detail" onclick="window.showAreaDetails('${area.replace(/'/g, "\\'")}')">Ver Detalle</button>
                  </td>
              </tr>
          `);
      });

      tbody.innerHTML = trs.join("");
  }

  
  // === CONFIGURACION DE COLUMNAS EXTRAS POR AREA ===
  window.getAreaConfig = function(areaName) {
    let extraHeaders = [];
    let extraFields = [];
    let extraColors = [];
    
    // Helper para limpiar números
    const getCleanVal = (v) => {
      if (v === null || v === undefined || v === "") return null;
      const cleanStr = String(v).replace(/\s/g, "");
      if (cleanStr === "" || cleanStr === "None") return null;
      const n = Number(cleanStr.replace(",", "."));
      return Number.isFinite(n) ? n : null;
    };
    
    // Helper para calcular diferencia de días dinámicamente si el campo en la BD está vacío
    const getDaysDiff = (d1Str, d2Str) => {
      const d1 = parseDateAny(d1Str);
      const d2 = parseDateAny(d2Str);
      if (!d1 || !d2) return null;
      const diffTime = d2.getTime() - d1.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 ? diffDays : 0;
    };

    if (areaName === "COMPRAS" || areaName === "COMPRAS EQUIPOS" || areaName === "COMPRAS AGV") {
      let sufix = areaName === "COMPRAS" ? "SEDE" : (areaName === "COMPRAS EQUIPOS" ? "EQUIPOS" : "AGV");
      extraHeaders = [
        "F. APROB. SOLPED", "T. APROBACION SOLPED", "F. EMISION OC", "TOTAL COLOC. OC", "DEMORA COLOC. OC", 
        "F. APROB. FIN. OC", "TOTAL LIB. OC", "DEMORA LIB. OC", 
        "F. ENTREGA ESPER.", "F. SELLO", "TOTAL DEMORA PROV.", "DEMORA PROV."
      ];
      extraFields = [
        r => r["FECHA APROBACION SOLPED"],
        r => {
          const rawVal = r["dTIEMPO DE APROBACION SOLPED"] !== undefined ? r["dTIEMPO DE APROBACION SOLPED"] : r["TIEMPO DE APROBACION SOLPED"];
          const cleaned = getCleanVal(rawVal);
          if (cleaned !== null) return cleaned;
          return getDaysDiff(r["FECHA EMISION SOLPED"], r["FECHA APROBACION SOLPED"]);
        },
        r => r["FECHA EMISION OC"],
        r => {
          const rawVal = r["dCOLOCACION OC"] !== undefined ? r["dCOLOCACION OC"] : r["COLOCACION OC"];
          const cleaned = getCleanVal(rawVal);
          if (cleaned !== null) return cleaned;
          return getDaysDiff(r["FECHA APROBACION SOLPED"], r["FECHA EMISION OC"]);
        },
        r => {
          if (r[`COLOCACION OC ${sufix}`] !== null && r[`COLOCACION OC ${sufix}`] !== undefined && r[`COLOCACION OC ${sufix}`] !== "") return r[`COLOCACION OC ${sufix}`];
          if (r["COLOCACION OC CS"] || r["COLOCACION OC SEDE"] || r["COLOCACION OC EQUIPOS"] || r["COLOCACION OC AGV"]) return r["COLOCACION OC CS"] || r["COLOCACION OC SEDE"] || r["COLOCACION OC EQUIPOS"] || r["COLOCACION OC AGV"];
          const cd = String(r["CLASE DE DOC"] || r["CLASE DE DOCUMENTO COMPRAS"] || r["CLASE DE DOCUMENTO"] || "").toUpperCase().trim();
          const valOC = r["dCOLOCACION OC"] !== undefined ? r["dCOLOCACION OC"] : r["COLOCACION OC"];
          let valOCParsed = getCleanVal(valOC);
          if (valOCParsed === null) {
            valOCParsed = getDaysDiff(r["FECHA APROBACION SOLPED"], r["FECHA EMISION OC"]);
          }
          if (valOCParsed !== null) {
            if (cd === "ZPAN" && valOCParsed > 5) return valOCParsed - 5;
            if (cd === "ZPAI" && valOCParsed > 2) return valOCParsed - 2;
          }
          return null;
        },
        r => r["FECHA APROBACION FINAL OC"],
        r => {
          const rawVal = r["dTIEMPOS DE APROBACION OC"] !== undefined ? r["dTIEMPOS DE APROBACION OC"] : r["TIEMPOS DE APROBACION OC"];
          const cleaned = getCleanVal(rawVal);
          if (cleaned !== null) return cleaned;
          return getDaysDiff(r["FECHA EMISION OC"], r["FECHA APROBACION FINAL OC"]);
        },
        r => {
          if (r[`LIBERACION OC ${sufix}`] !== null && r[`LIBERACION OC ${sufix}`] !== undefined && r[`LIBERACION OC ${sufix}`] !== "") return r[`LIBERACION OC ${sufix}`];
          if (r["LIBERACION OC CS"] || r["LIBERACION OC SEDE"] || r["LIBERACION OC EQUIPOS"] || r["LIBERACION OC AGV"]) return r["LIBERACION OC CS"] || r["LIBERACION OC SEDE"] || r["LIBERACION OC EQUIPOS"] || r["LIBERACION OC AGV"];
          const cd = String(r["CLASE DE DOC"] || r["CLASE DE DOCUMENTO COMPRAS"] || r["CLASE DE DOCUMENTO"] || "").toUpperCase().trim();
          const valApro = r["dTIEMPOS DE APROBACION OC"] !== undefined ? r["dTIEMPOS DE APROBACION OC"] : r["TIEMPOS DE APROBACION OC"];
          let valAproParsed = getCleanVal(valApro);
          if (valAproParsed === null) {
            valAproParsed = getDaysDiff(r["FECHA EMISION OC"], r["FECHA APROBACION FINAL OC"]);
          }
          if (["ZPAN", "ZPAI"].includes(cd) && valAproParsed !== null && valAproParsed > 2) return valAproParsed - 2;
          return null;
        },
        r => r["FECHA ENTREGA ESPERADA"],
        r => r["FECHA SELLO"],
        r => {
          const rawVal = r["DIF_ENTREGA_SELLO"];
          const cleaned = getCleanVal(rawVal);
          if (cleaned !== null) return cleaned;
          return getDaysDiff(r["FECHA ENTREGA ESPERADA"], r["FECHA SELLO"]);
        },
        r => {
          if (r[`ENTREGA DEL PROVEEDOR ${sufix}`] !== null && r[`ENTREGA DEL PROVEEDOR ${sufix}`] !== undefined && r[`ENTREGA DEL PROVEEDOR ${sufix}`] !== "") return r[`ENTREGA DEL PROVEEDOR ${sufix}`];
          if (r["ENTREGA DEL PROVEEDOR CS"] || r["ENTREGA DEL PROVEEDOR SEDE"] || r["ENTREGA DEL PROVEEDOR EQUIPOS"] || r["ENTREGA DEL PROVEEDOR AGV"]) return r["ENTREGA DEL PROVEEDOR CS"] || r["ENTREGA DEL PROVEEDOR SEDE"] || r["ENTREGA DEL PROVEEDOR EQUIPOS"] || r["ENTREGA DEL PROVEEDOR AGV"];
          const valDif = r["DIF_ENTREGA_SELLO"] && !isNaN(r["DIF_ENTREGA_SELLO"]) ? parseFloat(r["DIF_ENTREGA_SELLO"].toString().replace(",", ".")) : null;
          if (valDif !== null && valDif < 0) return Math.abs(valDif);
          return null;
        }
      ];
      extraColors = [
        {bg: "#e0f2fe", text: "#0369a1", cell: "rgba(224, 242, 254, 0.4)", hex: "FFE0F2FE", cellHex: "FFF0F9FF"}, 
        {bg: "#e0f2fe", text: "#0369a1", cell: "rgba(224, 242, 254, 0.4)", hex: "FFE0F2FE", cellHex: "FFF0F9FF"}, 
        {bg: "#e0f2fe", text: "#0369a1", cell: "rgba(224, 242, 254, 0.4)", hex: "FFE0F2FE", cellHex: "FFF0F9FF"}, 
        {bg: "#e0f2fe", text: "#0369a1", cell: "rgba(224, 242, 254, 0.4)", hex: "FFE0F2FE", cellHex: "FFF0F9FF"}, 
        {bg: "#e0f2fe", text: "#0369a1", cell: "rgba(224, 242, 254, 0.4)", hex: "FFE0F2FE", cellHex: "FFF0F9FF"},
        {bg: "#dcfce3", text: "#166534", cell: "rgba(220, 252, 227, 0.4)", hex: "FFDCFCE3", cellHex: "FFF0FDF4"}, 
        {bg: "#dcfce3", text: "#166534", cell: "rgba(220, 252, 227, 0.4)", hex: "FFDCFCE3", cellHex: "FFF0FDF4"}, 
        {bg: "#dcfce3", text: "#166534", cell: "rgba(220, 252, 227, 0.4)", hex: "FFDCFCE3", cellHex: "FFF0FDF4"},
        {bg: "#ffedd5", text: "#9a3412", cell: "rgba(255, 237, 213, 0.4)", hex: "FFFFEDD5", cellHex: "FFFFF7ED"}, 
        {bg: "#ffedd5", text: "#9a3412", cell: "rgba(255, 237, 213, 0.4)", hex: "FFFFEDD5", cellHex: "FFFFF7ED"}, 
        {bg: "#ffedd5", text: "#9a3412", cell: "rgba(255, 237, 213, 0.4)", hex: "FFFFEDD5", cellHex: "FFFFF7ED"}, 
        {bg: "#ffedd5", text: "#9a3412", cell: "rgba(255, 237, 213, 0.4)", hex: "FFFFEDD5", cellHex: "FFFFF7ED"}
      ];
    } else if (areaName === "PROYECTO") {
      extraHeaders = [
        "F. EMISION SOLPED", "F. APROBACION SOLPED", "T. APROBACION SOLPED", "DEMORA LIB. SOLPED",
        "F. EMISION OC", "T. COLOCACION", "DEMORA COLOCACION",
        "F. APROB. FINAL OC", "T. LIBERACION OC", "DEMORA LIBERACION",
        "FECHA SELLO", "T. DEMORA PROVEEDOR", "DEMORA PROVEEDOR",
        "PLAZO DE ENTREGA EXCEDIDO", "DEMORA PLAZO", "ENTREGA CERCANA"
      ];
      extraFields = [
        r => r["FECHA EMISION SOLPED"], r => r["FECHA APROBACION SOLPED"], 
        r => {
          const rawVal = r["dTIEMPO DE APROBACION SOLPED"] !== undefined ? r["dTIEMPO DE APROBACION SOLPED"] : r["TIEMPO DE APROBACION SOLPED"];
          const cleaned = getCleanVal(rawVal);
          if (cleaned !== null) return cleaned;
          return getDaysDiff(r["FECHA EMISION SOLPED"], r["FECHA APROBACION SOLPED"]);
        },
        r => r["LIBERACION SOLPED CS"],
        r => r["FECHA EMISION OC"], 
        r => {
          const rawVal = r["dCOLOCACION OC"] !== undefined ? r["dCOLOCACION OC"] : r["COLOCACION OC"];
          const cleaned = getCleanVal(rawVal);
          if (cleaned !== null) return cleaned;
          return getDaysDiff(r["FECHA APROBACION SOLPED"], r["FECHA EMISION OC"]);
        },
        r => {
          if (r["COLOCACION OC CS"] !== null && r["COLOCACION OC CS"] !== undefined && r["COLOCACION OC CS"] !== "") return r["COLOCACION OC CS"];
          if (r["COLOCACION OC SEDE"] || r["COLOCACION OC EQUIPOS"] || r["COLOCACION OC AGV"]) return r["COLOCACION OC SEDE"] || r["COLOCACION OC EQUIPOS"] || r["COLOCACION OC AGV"];
          const cd = String(r["CLASE DE DOC"] || r["CLASE DE DOCUMENTO COMPRAS"] || r["CLASE DE DOCUMENTO"] || "").toUpperCase().trim();
          const valOC = r["dCOLOCACION OC"] !== undefined ? r["dCOLOCACION OC"] : r["COLOCACION OC"];
          let valOCParsed = getCleanVal(valOC);
          if (valOCParsed === null) {
            valOCParsed = getDaysDiff(r["FECHA APROBACION SOLPED"], r["FECHA EMISION OC"]);
          }
          if (valOCParsed !== null) {
            if (cd === "ZPAN" && valOCParsed > 5) return valOCParsed - 5;
            if (cd === "ZPAI" && valOCParsed > 2) return valOCParsed - 2;
          }
          return null;
        },
        r => r["FECHA APROBACION FINAL OC"], 
        r => {
          const rawVal = r["dTIEMPOS DE APROBACION OC"] !== undefined ? r["dTIEMPOS DE APROBACION OC"] : r["TIEMPOS DE APROBACION OC"];
          const cleaned = getCleanVal(rawVal);
          if (cleaned !== null) return cleaned;
          return getDaysDiff(r["FECHA EMISION OC"], r["FECHA APROBACION FINAL OC"]);
        },
        r => {
          if (r["LIBERACION OC CS"] !== null && r["LIBERACION OC CS"] !== undefined && r["LIBERACION OC CS"] !== "") return r["LIBERACION OC CS"];
          if (r["LIBERACION OC SEDE"] || r["LIBERACION OC EQUIPOS"] || r["LIBERACION OC AGV"]) return r["LIBERACION OC SEDE"] || r["LIBERACION OC EQUIPOS"] || r["LIBERACION OC AGV"];
          const cd = String(r["CLASE DE DOC"] || r["CLASE DE DOCUMENTO COMPRAS"] || r["CLASE DE DOCUMENTO"] || "").toUpperCase().trim();
          const valApro = r["dTIEMPOS DE APROBACION OC"] !== undefined ? r["dTIEMPOS DE APROBACION OC"] : r["TIEMPOS DE APROBACION OC"];
          let valAproParsed = getCleanVal(valApro);
          if (valAproParsed === null) {
            valAproParsed = getDaysDiff(r["FECHA EMISION OC"], r["FECHA APROBACION FINAL OC"]);
          }
          if (["ZPAN", "ZPAI"].includes(cd) && valAproParsed !== null && valAproParsed > 2) return valAproParsed - 2;
          return null;
        },
        r => r["FECHA SELLO"], r => r["DIF_ENTREGA_SELLO"], r => {
          if (r["ENTREGA DEL PROVEEDOR CS"] !== null && r["ENTREGA DEL PROVEEDOR CS"] !== undefined && r["ENTREGA DEL PROVEEDOR CS"] !== "") return r["ENTREGA DEL PROVEEDOR CS"];
          if (r["ENTREGA DEL PROVEEDOR SEDE"] || r["ENTREGA DEL PROVEEDOR EQUIPOS"] || r["ENTREGA DEL PROVEEDOR AGV"]) return r["ENTREGA DEL PROVEEDOR SEDE"] || r["ENTREGA DEL PROVEEDOR EQUIPOS"] || r["ENTREGA DEL PROVEEDOR AGV"];
          const valDif = r["DIF_ENTREGA_SELLO"] && !isNaN(r["DIF_ENTREGA_SELLO"]) ? parseFloat(r["DIF_ENTREGA_SELLO"].toString().replace(",", ".")) : null;
          if (valDif !== null && valDif < 0) return Math.abs(valDif);
          return null;
        },
        r => r["dPLAZO DE ENTREGA"] !== undefined ? r["dPLAZO DE ENTREGA"] : r["PLAZO DE ENTREGA"], 
        r => {
          if (r["PLAZO DE ENTREGA EXCEDIDO CS"] !== null && r["PLAZO DE ENTREGA EXCEDIDO CS"] !== undefined && r["PLAZO DE ENTREGA EXCEDIDO CS"] !== "") return r["PLAZO DE ENTREGA EXCEDIDO CS"];
          if (r["PLAZO DE ENTREGA EXCEDIDO SEDE"] || r["PLAZO DE ENTREGA EXCEDIDO EQUIPOS"] || r["PLAZO DE ENTREGA EXCEDIDO AGV"]) return r["PLAZO DE ENTREGA EXCEDIDO SEDE"] || r["PLAZO DE ENTREGA EXCEDIDO EQUIPOS"] || r["PLAZO DE ENTREGA EXCEDIDO AGV"];
          const valPlazo = r["dPLAZO DE ENTREGA"] !== undefined ? r["dPLAZO DE ENTREGA"] : r["PLAZO DE ENTREGA"];
          const valPlazoParsed = valPlazo && !isNaN(valPlazo) ? parseFloat(valPlazo.toString().replace(",", ".")) : null;
          if (valPlazoParsed !== null && valPlazoParsed < 0) return Math.abs(valPlazoParsed);
          return null;
        }, r => r["FECHAENTREGAMUYCERCANA"] ? "Sí" : "-"
      ];
      extraColors = [
        {bg: "#e0f2fe", text: "#0369a1", cell: "rgba(224, 242, 254, 0.4)"}, {bg: "#e0f2fe", text: "#0369a1", cell: "rgba(224, 242, 254, 0.4)"}, {bg: "#e0f2fe", text: "#0369a1", cell: "rgba(224, 242, 254, 0.4)"}, {bg: "#e0f2fe", text: "#0369a1", cell: "rgba(224, 242, 254, 0.4)"},
        {bg: "#dcfce3", text: "#166534", cell: "rgba(220, 252, 227, 0.4)"}, {bg: "#dcfce3", text: "#166534", cell: "rgba(220, 252, 227, 0.4)"}, {bg: "#dcfce3", text: "#166534", cell: "rgba(220, 252, 227, 0.4)"},
        {bg: "#ffedd5", text: "#9a3412", cell: "rgba(255, 237, 213, 0.4)"}, {bg: "#ffedd5", text: "#9a3412", cell: "rgba(255, 237, 213, 0.4)"}, {bg: "#ffedd5", text: "#9a3412", cell: "rgba(255, 237, 213, 0.4)"},
        {bg: "#f3e8ff", text: "#6b21a8", cell: "rgba(243, 232, 255, 0.4)"}, {bg: "#f3e8ff", text: "#6b21a8", cell: "rgba(243, 232, 255, 0.4)"}, {bg: "#f3e8ff", text: "#6b21a8", cell: "rgba(243, 232, 255, 0.4)"},
        {bg: "#fce7f3", text: "#be185d", cell: "rgba(252, 231, 243, 0.4)"}, {bg: "#fce7f3", text: "#be185d", cell: "rgba(252, 231, 243, 0.4)"}, {bg: "#f3f4f6", text: "#374151", cell: "rgba(243, 244, 246, 0.4)"}
      ];
    } else if (areaName === "ALMACÉN" || areaName === "ALMACEN" || areaName === "ALMACN") {
      extraHeaders = ["F. SELLO", "F. RECEPCION", "F. PICKING", "F. CARGA", "T. RECEPCIÓN", "T. PICKING", "DEMORA ALM. ROS.", "DEMORA ALM. SJ"];
      extraFields = [
        r => r["FECHA SELLO"],
        r => r["FECHA RECEPCION"],
        r => r["FECHA PICKING"],
        r => r["FECHA DE CARGA"],
        r => r["PRIMERA RECEPCIÓN - TIEMPOS RECEPCIÓN"] !== undefined ? r["PRIMERA RECEPCIÓN - TIEMPOS RECEPCIÓN"] : r["dREGISTRO DE RECEPCION"],
        r => r["TIEMPO PICKING"] !== undefined ? r["TIEMPO PICKING"] : r["dPICKING"],
        r => {
          if (r["ALMACEN ROSARIO"] !== null && r["ALMACEN ROSARIO"] !== undefined && r["ALMACEN ROSARIO"] !== "") return r["ALMACEN ROSARIO"];
          const dAlm = getCleanVal(r["dALMACEN"]);
          const carAlm = String(r["CARACTER ALMACEN RECEPCION 1"] || r["CARACTER ALMACEN"] || r["ALMACEN RECEPCION 1"] || r["ALMACÉN"] || r["ALMACEN"] || "").toUpperCase();
          const cd = String(r["CLASE DE DOC"] || r["CLASE DE DOCUMENTO COMPRAS"] || r["CLASE DE DOCUMENTO"] || "").toUpperCase().trim();
          const opRos = getCleanVal(r["OPERADOR PICKING ROSARIO"]);
          if (dAlm !== null) {
            if (["ZPAN", "ZPAI"].includes(cd) && carAlm.includes("ROSARIO") && dAlm > 6) return dAlm - 6;
            if (cd === "ZPAS" && opRos === 1 && dAlm > 10) return dAlm - 10;
          }
          return null;
        },
        r => {
          if (r["ALMACEN SAN JUAN"] !== null && r["ALMACEN SAN JUAN"] !== undefined && r["ALMACEN SAN JUAN"] !== "") return r["ALMACEN SAN JUAN"];
          const dAlm = getCleanVal(r["dALMACEN"]);
          const carAlm = String(r["CARACTER ALMACEN RECEPCION 1"] || r["CARACTER ALMACEN"] || r["ALMACEN RECEPCION 1"] || r["ALMACÉN"] || r["ALMACEN"] || "").toUpperCase();
          const cd = String(r["CLASE DE DOC"] || r["CLASE DE DOCUMENTO COMPRAS"] || r["CLASE DE DOCUMENTO"] || "").toUpperCase().trim();
          const opSj = getCleanVal(r["OPERADOR PICKING SJ"]);
          if (dAlm !== null) {
            if (["ZPAN", "ZPAI"].includes(cd) && carAlm.includes("SAN JUAN") && dAlm > 6) return dAlm - 6;
            if (cd === "ZPAS" && opSj === 1 && dAlm > 10) return dAlm - 10;
          }
          return null;
        }
      ];
      extraColors = [
        {bg: "#e0f2fe", text: "#0369a1", cell: "rgba(224, 242, 254, 0.4)"}, {bg: "#e0f2fe", text: "#0369a1", cell: "rgba(224, 242, 254, 0.4)"}, {bg: "#e0f2fe", text: "#0369a1", cell: "rgba(224, 242, 254, 0.4)"}, {bg: "#e0f2fe", text: "#0369a1", cell: "rgba(224, 242, 254, 0.4)"}, 
        {bg: "#dcfce3", text: "#166534", cell: "rgba(220, 252, 227, 0.4)"}, {bg: "#dcfce3", text: "#166534", cell: "rgba(220, 252, 227, 0.4)"}, 
        {bg: "#ffedd5", text: "#9a3412", cell: "rgba(255, 237, 213, 0.4)"}, {bg: "#ffedd5", text: "#9a3412", cell: "rgba(255, 237, 213, 0.4)"}
      ];    } else if (areaName === "EQUIPOS MENORES") {
      extraHeaders = ["F. EMISION", "F. PICKING", "F. CONTAB. VL", "DÍAS PREP.", "DEMORA PREP.", "DÍAS TRANSP.", "DEMORA TRANSP."];
      extraFields = [
        r => r["FECHA DE EMISION NECESIDAD"],
        r => r["FECHA PICKING"],
        r => r["FECHA CONTABILIZACION VL"],
        r => r["dPREPARACION"],
        r => {
          if (r["PREPARACION"] !== null && r["PREPARACION"] !== undefined && r["PREPARACION"] !== "") return r["PREPARACION"];
          const dPrep = r["dPREPARACION"] && !isNaN(r["dPREPARACION"]) ? parseFloat(r["dPREPARACION"].toString().replace(",", ".")) : null;
          return (dPrep !== null && dPrep > 0) ? dPrep : null;
        },
        r => r["dTRANSPORTEyALM"],
        r => {
          if (r["TRANSPORTEyALM"] !== null && r["TRANSPORTEyALM"] !== undefined && r["TRANSPORTEyALM"] !== "") return r["TRANSPORTEyALM"];
          const dTra = r["dTRANSPORTEyALM"] && !isNaN(r["dTRANSPORTEyALM"]) ? parseFloat(r["dTRANSPORTEyALM"].toString().replace(",", ".")) : null;
          return (dTra !== null && dTra > 0) ? dTra : null;
        }
      ];
      extraColors = [
        {bg: "#e0f2fe", text: "#0369a1", cell: "rgba(224, 242, 254, 0.4)"}, {bg: "#e0f2fe", text: "#0369a1", cell: "rgba(224, 242, 254, 0.4)"}, {bg: "#e0f2fe", text: "#0369a1", cell: "rgba(224, 242, 254, 0.4)"}, 
        {bg: "#dcfce3", text: "#166534", cell: "rgba(220, 252, 227, 0.4)"}, {bg: "#dcfce3", text: "#166534", cell: "rgba(220, 252, 227, 0.4)"}, 
        {bg: "#ffedd5", text: "#9a3412", cell: "rgba(255, 237, 213, 0.4)"}, {bg: "#ffedd5", text: "#9a3412", cell: "rgba(255, 237, 213, 0.4)"}
      ];
    } else if (areaName === "TRASLADO" || areaName.toUpperCase().includes("TRASLADO")) {
      extraHeaders = ["F. CONTAB. VL", "F. ALM./SELLO", "DÍAS TRASLADO", "DEMORA TRASLADO"];
      extraFields = [
        r => r["FECHA CONTABILIZACION VL"],
        r => r["FECHA DE ALMACENAMIENTO SELLO"] || r["FECHA ALMACENAMIENTO (LOGIN)"],
        r => r["dTRASLADO"] !== undefined ? r["dTRASLADO"] : r["TRASLADO"],
        r => r["demora TRASLADO ALMACEN OBRA"] !== undefined ? r["demora TRASLADO ALMACEN OBRA"] : r["TRASLADO CS"]
      ];
      extraColors = [
        {bg: "#f3e8ff", text: "#6b21a8", cell: "rgba(243, 232, 255, 0.4)", hex: "FFF3E8FF", cellHex: "FFF9F5FF"},
        {bg: "#f3e8ff", text: "#6b21a8", cell: "rgba(243, 232, 255, 0.4)", hex: "FFF3E8FF", cellHex: "FFF9F5FF"},
        {bg: "#f3e8ff", text: "#6b21a8", cell: "rgba(243, 232, 255, 0.4)", hex: "FFF3E8FF", cellHex: "FFF9F5FF"},
        {bg: "#f3e8ff", text: "#6b21a8", cell: "rgba(243, 232, 255, 0.4)", hex: "FFF3E8FF", cellHex: "FFF9F5FF"}
      ];
    } else if (areaName === "EXPEDICION" || areaName === "EXPEDICIÓ" || areaName === "EXPEDICIÓN" || areaName.toUpperCase().includes("EXPEDIC")) {
      extraHeaders = ["F. DE CARGA", "F. CONTAB. VL", "DÍAS EXPEDICION", "DEMORA EXPEDICION"];
      extraFields = [
        r => r["FECHA DE CARGA"],
        r => r["FECHA CONTABILIZACION VL"],
        r => r["dEXPEDICION"] !== undefined ? r["dEXPEDICION"] : r["EXPEDICION"],
        r => r["EXPEDICION CS"] !== undefined ? r["EXPEDICION CS"] : null
      ];
      extraColors = [
        {bg: "#fce7f3", text: "#be185d", cell: "rgba(252, 231, 243, 0.4)", hex: "FFFCE7F3", cellHex: "FFFFF5F9"},
        {bg: "#fce7f3", text: "#be185d", cell: "rgba(252, 231, 243, 0.4)", hex: "FFFCE7F3", cellHex: "FFFFF5F9"},
        {bg: "#fce7f3", text: "#be185d", cell: "rgba(252, 231, 243, 0.4)", hex: "FFFCE7F3", cellHex: "FFFFF5F9"},
        {bg: "#fce7f3", text: "#be185d", cell: "rgba(252, 231, 243, 0.4)", hex: "FFFCE7F3", cellHex: "FFFFF5F9"}
      ];
    }
    
    return { extraHeaders, extraFields, extraColors };
  };window.showAreaDetails = function(areaName) {
    const lastFilteredData = filteredRowsByClienteYMes();
    if (lastFilteredData.length === 0) return;
    
    const areaData = lastFilteredData.filter(row => {
      const isAlmacen = (areaName === "ALMACÉN" || areaName === "ALMACEN" || areaName === "ALMACN" || areaName.toUpperCase().includes("ALMAC"));
      if (isAlmacen) {
        return isTruthyAreaValue(row["ALMACÉN"]) || isTruthyAreaValue(row["ALMACEN"]) || isTruthyAreaValue(row["ALMACN"]);
      }
      return isTruthyAreaValue(row[areaName]);
    });
    if (areaData.length === 0) {
      alert("No hay pedidos para esta área en los filtros actuales.");
      return;
    }

    const titleText = `Pedidos con demoras en: ${areaName} (${areaData.length} pedidos)`;
    
    let explicacionArea = "";
    if (areaName.startsWith("COMPRAS")) {
      explicacionArea = "Un pedido tiene demoras en COMPRAS cuando los tiempos de Colocación de OC, Aprobación de OC o la Entrega del Proveedor superan los plazos máximos tolerados (según la clase de documento).";
    } else if (areaName === "PROYECTO") {
      explicacionArea = "Un pedido tiene demoras en PROYECTO cuando la Liberación de Solped, Colocación/Liberación de OC o Entrega del Proveedor exceden los plazos para el Centro de Servicios.";
    } else if (areaName === "ALMACÉN") {
      explicacionArea = "Un pedido tiene demoras en ALMACÉN cuando los procesos internos (Registro de Recepción, Picking o Embalaje) demoran más de lo pactado (ej. > 4 días en Rosario, o > 8 días para repuestos ZPAS).";
    } else if (areaName === "EQUIPOS MENORES") {
      explicacionArea = "Un pedido tiene demoras en EQUIPOS MENORES cuando el tiempo de Preparación (desde la emisión hasta el picking) supera el límite establecido (ej. > 2 días para ZPAN).";
    } else if (areaName === "TRASLADO" || areaName.toUpperCase().includes("TRASLADO")) {
      explicacionArea = "Un pedido tiene demoras en TRASLADO cuando el tiempo de viaje a la obra supera los límites del cliente (ej. > 12 días para Añelo, > 10 días para San Luis).";
    } else if (areaName === "EXPEDICION" || areaName.toUpperCase().includes("EXPEDIC")) {
      explicacionArea = "Un pedido tiene demoras en EXPEDICIÓN cuando el tiempo de expedición (contabilización VL a carga) supera los 2 días.";
    }

    const config = window.getAreaConfig(areaName);
    let extraHeaders = config.extraHeaders;
    let extraFields = config.extraFields;
    let extraColors = config.extraColors;

    let theadHtml = `
      <th style="background:#f8fafc; padding: 8px; border: 1px solid #cbd5e1; text-align: left; font-weight: 600; color: #475569;">CLIENTE</th>
      <th style="background:#f8fafc; padding: 8px; border: 1px solid #cbd5e1; text-align: left; font-weight: 600; color: #475569;">NRO. VA01/VA21</th>
      <th style="background:#f8fafc; padding: 8px; border: 1px solid #cbd5e1; text-align: left; font-weight: 600; color: #475569;">POS VA01/VA21</th>
      <th style="background:#f8fafc; padding: 8px; border: 1px solid #cbd5e1; text-align: left; font-weight: 600; color: #475569;">CLASE DE DOC</th>
      <th style="background:#f8fafc; padding: 8px; border: 1px solid #cbd5e1; text-align: left; font-weight: 600; color: #475569;">GRUPO DE COMPRA</th>
      <th style="background:#f8fafc; padding: 8px; border: 1px solid #cbd5e1; text-align: left; font-weight: 600; color: #475569;">PRIORIDAD</th>
      <th style="background:#f8fafc; padding: 8px; border: 1px solid #cbd5e1; text-align: left; font-weight: 600; color: #475569;">DESCRIPCION ITEM</th>
      <th style="background:#f8fafc; padding: 8px; border: 1px solid #cbd5e1; text-align: left; font-weight: 600; color: #475569;">CANTIDAD SOLICITADA</th>
      <th style="background:#f8fafc; padding: 8px; border: 1px solid #cbd5e1; text-align: left; font-weight: 600; color: #475569;">CENTRO</th>
      <th style="background:#f8fafc; padding: 8px; border: 1px solid #cbd5e1; text-align: left; font-weight: 600; color: #475569;">FECHA DE EMISION NECESIDAD</th>
      <th style="background:#f8fafc; padding: 8px; border: 1px solid #cbd5e1; text-align: left; font-weight: 600; color: #475569;">FECHA ENTREGA ESPERADA</th>
    `;
    extraHeaders.forEach((h, i) => {
      let bg = "#e0f2fe";
      let text = "#0369a1";
      if (extraColors && extraColors[i]) {
         bg = extraColors[i].bg;
         text = extraColors[i].text;
      }
      theadHtml += `<th style="background:${bg}; color:${text}; padding: 8px; border: 1px solid #cbd5e1; text-align: left; font-weight: 600;">${h}</th>`;
    });

    let tbodyHtml = "";
    areaData.forEach(row => {
      const cliente = row["CLIENTE"] || "";
      const va = row["NRO. VA01/VA21"] || "";
      const pos = row["POS VA01/VA21"] || "";
      const claseDoc = row["CLASE DE DOC"] || row["CLASE DE DOCUMENTO COMPRAS"] || row["CLASE DE DOCUMENTO"] || "";
      const gpoCompra = row["GRUPO DE COMPRA"] || row["GRUPO DE COMPRA OC"] || "";
      const prio = row["PRIORIDAD"] || "";
      const desc = row["DESCRIPCION ITEM"] || "";
      const cant = row["CANTIDAD SOLICITADA"] || "";
      const centro = row["CENTRO"] || "";
      const fEmi = row["FECHA DE EMISION NECESIDAD"] || "";
      const fEnt = row["FECHA ENTREGA ESPERADA"] || "";

      let extrasHtml = "";
      extraFields.forEach((f, i) => {
        let val = f(row);
        val = (val === null || val === undefined) ? "-" : val;
        let cellBg = "";
        if (extraColors && extraColors[i] && extraColors[i].cell) {
           cellBg = `background-color: ${extraColors[i].cell};`;
        }
        extrasHtml += `<td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155; ${cellBg}">${val}</td>`;
      });
      tbodyHtml += `
        <tr style="transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f1f5f9';" onmouseout="this.style.backgroundColor='transparent';">
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 500; color: #0f172a; max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${cliente}">${cliente}</td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155;">${va}</td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155;">${pos}</td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155;">${claseDoc}</td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155;">${gpoCompra}</td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155; text-align: center;">${prio}</td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${desc}">${desc}</td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155; text-align: right;">${cant}</td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155;">${centro}</td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155; white-space: nowrap;">${fEmi}</td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155; white-space: nowrap;">${fEnt}</td>
          ${extrasHtml}
        </tr>
      `;
    });

    const newWin = window.open('', '_blank');
    if (!newWin) {
      alert("Por favor habilita las ventanas emergentes (pop-ups) para ver el detalle.");
      return;
    }
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Detalles de Demoras - ${areaName}</title>
        <style>
          body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background: #f8fafc; margin: 30px; font-size: 13px; }
          .header-container { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
          h2 { color: #0f172a; margin: 0; font-size: 20px; }
          table { width: 100%; border-collapse: collapse; background: #fff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); overflow-x: auto; border: 1px solid #cbd5e1; display: table; }
          th { padding: 10px; border: 1px solid #cbd5e1; text-align: left; }
          td { padding: 8px; border: 1px solid #cbd5e1; text-align: left; }
          .btn-download { background-color: #10b981; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: background 0.2s; font-size: 14px; display: flex; align-items: center; gap: 8px; }
          .btn-download:hover { background-color: #059669; }
        </style>
      </head>
      <body>
        <div class="header-container">
          <div>
            <h2>${titleText}</h2>
            <button onclick="document.getElementById('areaExplicacion').style.display = document.getElementById('areaExplicacion').style.display === 'none' ? 'block' : 'none'" style="background: #3b82f6; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; margin-top: 10px;">Fórmulas</button>
            <div id="areaExplicacion" style="display: none; margin-top: 10px; background: #f1f5f9; padding: 15px; border-radius: 6px; border-left: 4px solid #3b82f6; font-family: monospace; font-size: 12px; white-space: pre-wrap; overflow-x: auto; max-width: 800px;">
${(areaName === 'TRASLADO' || areaName.toUpperCase().includes('TRASLADO')) ? `<b>Lógica de Cálculo TRASLADO (Power Query M):</b>

dTRASLADO = if ([CLASE DE DOC] = "ZPAN" or [CLASE DE DOC] = "ZPAI" or [CLASE DE DOC] = "ZPAS")
         and [FECHA DE ALMACENAMIENTO SELLO] <> null
         and [FECHA CONTABILIZACION VL] <> null
    then Duration.Days([FECHA DE ALMACENAMIENTO SELLO] - [FECHA CONTABILIZACION VL])
    else null

demora TRASLADO ALMACEN OBRA = (según CLI):
   00038 (>1 => -1), 00223 (>5 => -5), 00357 (>5 => -5), 00359 (>5 => -5), 
   00341 (>10 => -10), 00314 (>5 => -5), UTE 363 (>14 => -14), 00364 (>12 => -12), 
   00029MM (>5 => -5), 00029MR (>5 => -5), 00298 (>12 => -12), 00365 (>9 => -9), 
   00367 (>14 => -14), 00369 (>5 => -5), 00371 (>1 => -1), 00372 (>9 => -9), 
   00374 (>11 => -11), 00375 (>3 => -3), 00376 (>2 => -2), 00368 (>2 => -2), 
   00377 (>12 => -12), 00378 (>3 => -3), 00379 (>2 => -2)

TRASLADO = if [TRASLADO CS] = 1 then 1 else null`

: (areaName === 'EXPEDICION' || areaName === 'EXPEDICIÓ' || areaName === 'EXPEDICIÓN' || areaName.toUpperCase().includes('EXPEDIC')) ? `<b>Lógica de Cálculo EXPEDICION (Power Query M):</b>

dEXPEDICION = if ([CLASE DE DOC] = "ZPAN" or [CLASE DE DOC] = "ZPAI" or [CLASE DE DOC] = "ZPAS")
         and [FECHA CONTABILIZACION VL] <> null
         and [FECHA DE CARGA] <> null
    then Duration.Days([FECHA CONTABILIZACION VL] - [FECHA DE CARGA])
    else null

EXPEDICION = if [EXPEDICION CS] = 1 then 1 else null` 

: areaName === 'PROYECTO' ? `<b>Lógica de Cálculo PROYECTO (Power Query M):</b>

LIBERACION SOLPED CS = if ([CLASE DE DOC] = "ZPAN" or "ZPAI" or "ZPAS") and [TIEMPO DE APROBACION SOLPED] > 2 
                       then [TIEMPO DE APROBACION SOLPED] - 2 else null

FECHAENTREGAMUYCERCANA = let d = Duration.Days([FECHA ENTREGA ESPERADA] - [FECHA DE EMISION NECESIDAD]), c = Text.Trim(Text.From([CLI])) in
  if d = null then null
  else if List.Contains({"ZPOE","ZPAS"}, [CLASE DE DOC]) then
      if c="00038" and d<=12 then 1 else if c="00223" and d<16 then 1 else if c="00357" and d<5 then 1 else if c="00359" and d<5 then 1
      else if c="00341" and d<21 then 1 else if c="00314" and d<16 then 1 else if c="UTE 363" and d<14 then 1 else if c="00364" and d<23 then 1
      else if c="00029MM" and d<5 then 1 else if c="00029MR" and d<5 then 1 else if c="00298" and d<23 then 1 else if c="00365" and d<20 then 1
      else if c="00367" and d<25 then 1 else if c="00369" and d<16 then 1 else if c="00371" and d<12 then 1 else if c="00372" and d<20 then 1
      else if c="00374" and d<22 then 1 else if c="00375" and d<14 then 1 else if c="00376" and d<13 then 1 else if c="00368" and d<13 then 1
      else if c="00377" and d<13 then 1 else null
  else if List.Contains({"ZPAN","ZPAI"}, [CLASE DE DOC]) then
      if c="00038" and d<=8 then 1 else if c="00223" and d<=12 then 1 else if c="00357" and d<=5 then 1 else if c="00359" and d<=5 then 1
      else if c="00341" and d<=17 then 1 else if c="00314" and d<=12 then 1 else if c="UTE 363" and d<=14 then 1 else if c="00364" and d<=19 then 1
      else if c="00029MM" and d<=5 then 1 else if c="00029MR" and d<=5 then 1 else if c="00298" and d<=19 then 1 else if c="00365" and d<=16 then 1
      else if c="00367" and d<=21 then 1 else if c="00369" and d<=12 then 1 else if c="00371" and d<=8 then 1 else if c="00372" and d<=16 then 1
      else if c="00374" and d<=18 then 1 else if c="00375" and d<=10 then 1 else if c="00376" and d<=8 then 1 else if c="00368" and d<=8 then 1
      else if c="00377" and d<13 then 1 else null
  else null

COLOCACION OC CS = if [CARACTER DE GC]="LOCAL CS" and [CLASE DE DOC]="ZPAN" and [COLOCACION OC]<>null and [COLOCACION OC]>5 then [COLOCACION OC]-5
                   else if [CARACTER DE GC]="LOCAL CS" and [CLASE DE DOC]="ZPAI" and [COLOCACION OC]<>null and [COLOCACION OC]>2 then [COLOCACION OC]-2 else null

LIBERACION OC CS = if ([CLASE DE DOC]="ZPAN" or [CLASE DE DOC]="ZPAI") and [CARACTER DE GC]="LOCAL CS" and [TIEMPOS DE APROBACION OC]<>null and [TIEMPOS DE APROBACION OC]>2 then [TIEMPOS DE APROBACION OC]-2 else null

ENTREGA DEL PROVEEDOR CS = if ([CLASE DE DOC]="ZPAN" or [CLASE DE DOC]="ZPAI") and [CARACTER DE GC]="LOCAL CS" and [DIF_ENTREGA_SELLO]<>null and [DIF_ENTREGA_SELLO]<0 then Number.Abs([DIF_ENTREGA_SELLO]) else null

PLAZO DE ENTREGA EXCEDIDO CS = if [CARACTER DE GC]="LOCAL CS" and [PLAZO DE ENTREGA]<>null and [PLAZO DE ENTREGA]<0 then Number.Abs([PLAZO DE ENTREGA]) else null

PROYECTO = if List.Sum({[LIBERACION SOLPED CS], [FECHAENTREGAMUYCERCANA], [COLOCACION OC CS], [LIBERACION OC CS], [ENTREGA DEL PROVEEDOR CS], [PLAZO DE ENTREGA EXCEDIDO CS]}) > 0 then 1 else null`

: areaName.startsWith('COMPRAS') ? (function(){
  const isSede = areaName === "COMPRAS";
  const sufix = isSede ? "SEDE" : (areaName === "COMPRAS EQUIPOS" ? "EQUIPOS" : "AGV");
  const gc = isSede ? "COMPRAS ABASTECIMIENTO" : areaName;
  return `<b>Lógica de Cálculo ${areaName} (Power Query M):</b>

COLOCACION OC ${sufix} = if (([CLASE DE DOC]="ZPAN" or [CLASE DE DOC]="ZPAI") and [CARACTER DE GC]="${gc}" and [dCOLOCACION OC]<>null and (([CLASE DE DOC]="ZPAN" and [dCOLOCACION OC]>5) or ([CLASE DE DOC]="ZPAI" and [dCOLOCACION OC]>2))) then if [CLASE DE DOC]="ZPAN" then [dCOLOCACION OC]-5 else [dCOLOCACION OC]-2 else null

LIBERACION OC ${sufix} = if ([CLASE DE DOC]="ZPAN" or [CLASE DE DOC]="ZPAI") and [CARACTER DE GC]="${gc}" and [dTIEMPOS DE APROBACION OC]<>null and [dTIEMPOS DE APROBACION OC]>2 then [dTIEMPOS DE APROBACION OC]-2 else null

ENTREGA DEL PROVEEDOR ${sufix} = if ([CLASE DE DOC]="ZPAN" or [CLASE DE DOC]="ZPAI") and [CARACTER DE GC]="${gc}" and [DIF_ENTREGA_SELLO]<>null and [DIF_ENTREGA_SELLO]<0 then Number.Abs([DIF_ENTREGA_SELLO]) else null

PLAZO DE ENTREGA EXCEDIDO ${sufix} = if [CARACTER DE GC]="${gc}" and [dPLAZO DE ENTREGA]<>null and [dPLAZO DE ENTREGA]<0 then Number.Abs([dPLAZO DE ENTREGA]) else null

${areaName} = if List.Sum({[COLOCACION OC ${sufix}], [LIBERACION OC ${sufix}], [ENTREGA DEL PROVEEDOR ${sufix}], [PLAZO DE ENTREGA EXCEDIDO ${sufix}]}) > 0 then 1 else null`;
})()

: areaName === 'ALMACÉN' ? `<b>Lógica de Cálculo ALMACÉN (Power Query M):</b>

ALMACEN ROSARIO = if ([CLASE DE DOC] = "ZPAN" or "ZPAI") and ALMACEN="TRANSITORIO ROSARIO" and [dALMACEN] > 4 then [dALMACEN] - 4 
                  else if [CLASE DE DOC]="ZPAS" and [OPERADOR PICKING ROSARIO]=1 and [dALMACEN] > 8 then [dALMACEN] - 8 else null

ALMACEN SAN JUAN = if ([CLASE DE DOC] = "ZPAN" or "ZPAI") and ALMACEN="TRANSITORIO SAN JUAN" and [dALMACEN] > 4 then [dALMACEN] - 4 
                   else if [CLASE DE DOC]="ZPAS" and [OPERADOR PICKING SJ]=1 and [dALMACEN] > 8 then [dALMACEN] - 8 else null

ALMACÉN = if List.Sum({[ALMACEN ROSARIO], [ALMACEN SAN JUAN]}) > 0 then 1 else null`

: areaName === 'EQUIPOS MENORES' ? `<b>Lógica de Cálculo EQUIPOS MENORES (Power Query M):</b>

PREPARACION = if [dPREPARACION] <> null and [dPREPARACION] > 2 then [dPREPARACION] - 2 else null

TRANSPORTEyALM = let d=[dTRANSPORTEyALM], c=[CLI] in
  if d = null then null
  else if c="00038" and d>10 then d-10 else if c="00223" and d>16 then d-16 else if c="00357" and d>5 then d-5 else if c="00359" and d>5 then d-5
  else if c="00341" and d>21 then d-21 else if c="00314" and d>11 then d-11 else if c="UTE 363" and d>14 then d-14 else if c="00364" and d>10 then d-10
  else if c="00029MM" and d>5 then d-5 else if c="00029MR" and d>5 then d-5 else if c="00298" and d>12 then d-12 else if c="00365" and d>16 then d-16
  else if c="00367" and d>25 then d-25 else if c="00369" and d>15 then d-15 else if c="00371" and d>5 then d-5 else if c="00372" and d>16 then d-16
  else if c="00374" and d>15 then d-15 else if c="00375" and d>14 then d-14 else if c="00376" and d>12 then d-12 else if c="00368" and d>7 then d-7
  else if c="00377" and d>12 then d-12 else null

EQUIPOS MENORES = if List.Sum({[PREPARACION], [TRANSPORTEyALM]}) > 0 then 1 else null`

: `<strong>¿Por qué aparecen aquí?</strong><br/>${explicacionArea}`}
            </div>
          </div>
          <button class="btn-download" onclick="window.opener.downloadAreaExcel('${areaName}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Descargar Reporte (Excel)
          </button>
        </div>
        <table>
          <thead>
            <tr>${theadHtml}</tr>
          </thead>
          <tbody>
            ${tbodyHtml}
          </tbody>
        </table>
      </body>
      </html>
    `;
    
    newWin.document.open();
    newWin.document.write(htmlContent);
    newWin.document.close();
  };

  // === EXPORTAR AREA A EXCEL ===
  window.downloadAreaExcel = async function(areaName) {
    const lastFilteredData = filteredRowsByClienteYMes();
    if (!lastFilteredData || lastFilteredData.length === 0) return;
    const areaOrders = lastFilteredData.filter(r => {
      const isAlmacen = (areaName === "ALMACÉN" || areaName === "ALMACEN" || areaName === "ALMACN" || areaName.toUpperCase().includes("ALMAC"));
      if (isAlmacen) {
        return isTruthyAreaValue(r["ALMACÉN"]) || isTruthyAreaValue(r["ALMACEN"]) || isTruthyAreaValue(r["ALMACN"]);
      }
      return isTruthyAreaValue(r[areaName]);
    });
    if (areaOrders.length === 0) return;
    
    if (typeof ExcelJS === 'undefined') {
      alert("Error: No se pudo cargar la librería ExcelJS. Refresque la página."); 
      return;
    }
    
    try {
      const config = window.getAreaConfig(areaName);
      
      const baseHeaders = [
        "CLIENTE", "NRO. VA01/VA21", "POS VA01/VA21", "CLASE DE DOC", "GRUPO DE COMPRA", "PRIORIDAD",
        "DESCRIPCION ITEM", "CANTIDAD SOLICITADA", "CENTRO", "FECHA DE EMISION NECESIDAD", "FECHA ENTREGA ESPERADA"
      ];
      
      const allHeaders = baseHeaders.concat(config.extraHeaders);

      const workbook = new ExcelJS.Workbook();
      const sheetName = areaName.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 31);
      const worksheet = workbook.addWorksheet(sheetName);
      
      worksheet.columns = allHeaders.map(h => ({ header: h, key: h, width: 20 }));
      
      worksheet.getRow(1).eachCell((cell, colNumber) => {
        if (colNumber <= baseHeaders.length) {
          cell.font = { bold: true, color: { argb: 'FF475569' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        } else {
          const extraIdx = colNumber - baseHeaders.length - 1;
          const colorConfig = config.extraColors[extraIdx];
          if (colorConfig && colorConfig.hex) {
             cell.font = { bold: true, color: { argb: 'FF000000' } };
             cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorConfig.hex } };
          } else {
             cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
             cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } };
          }
        }
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
      
      areaOrders.forEach(row => {
        let excelRow = {};
        excelRow["CLIENTE"] = row["CLIENTE"];
        excelRow["NRO. VA01/VA21"] = row["NRO. VA01/VA21"];
        excelRow["POS VA01/VA21"] = row["POS VA01/VA21"];
        excelRow["CLASE DE DOC"] = row["CLASE DE DOC"] || row["CLASE DE DOCUMENTO COMPRAS"] || row["CLASE DE DOCUMENTO"];
        excelRow["GRUPO DE COMPRA"] = row["GRUPO DE COMPRA"] || row["GRUPO DE COMPRA OC"] || "-";
        excelRow["PRIORIDAD"] = row["PRIORIDAD"];
        excelRow["DESCRIPCION ITEM"] = row["DESCRIPCION ITEM"];
        excelRow["CANTIDAD SOLICITADA"] = row["CANTIDAD SOLICITADA"];
        excelRow["CENTRO"] = row["CENTRO"];
        excelRow["FECHA DE EMISION NECESIDAD"] = row["FECHA DE EMISION NECESIDAD"];
        excelRow["FECHA ENTREGA ESPERADA"] = row["FECHA ENTREGA ESPERADA"];
        
        config.extraFields.forEach((f, idx) => {
           let val = f(row);
           excelRow[config.extraHeaders[idx]] = (val === null || val === undefined) ? "-" : val;
        });
        
        const rowObj = worksheet.addRow(excelRow);
        
        rowObj.eachCell((cell, colNumber) => {
           if (colNumber > baseHeaders.length) {
              const extraIdx = colNumber - baseHeaders.length - 1;
              const colorConfig = config.extraColors[extraIdx];
              if (colorConfig && colorConfig.cellHex) {
                 cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorConfig.cellHex } };
              }
           }
        });
      });
      
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = `Detalle_Demoras_${areaName.replace(/\\s+/g, '_')}.xlsx`;
      link.click();
    } catch(e) {
      console.error(e);
      alert("Hubo un error al generar el archivo Excel.");
    }
  };


  /* ============================
     APPLY ALL
  ============================ */
  function applyAll() {
      const rows = filteredRows();
      buildMesSelect(rows);

      updateKPIs();
      buildChartMes();
      buildChartAreas();
      buildChartMotivos();
      buildTablaMotivos();
      buildTabla();
      buildSparklinesTable();
  }

  /* ============================
     EXPOSE DEFERRED INITIALIZATION LIFE CYCLE HOOK
  =========================== */
  window.initDemoras = function() {
      if (window.demorasInitialized) return;
      window.demorasInitialized = true;

      applyChartDefaults();

      const _lu = (window.LAST_UPDATE || "").toString().trim();
      const _elLU = document.getElementById("lastUpdate");
      if (_elLU) _elLU.textContent = _lu || "--/--/----";

      // fetchWithCache optimized
      fetchWithCache(csvUrl + "?t=" + window.CACHE_BUSTER)
          .then(text => {
              const m = parseDelimited(text, DELIM);
              if (!m.length || m.length < 2) {
                  showError("El CSV está vacío o no tiene filas.");
                  return;
              }

              headers = m[0].map(clean);
              detectColumns();

              if (!CLIENT_COL) {
                  showError("No encontré columna CLIENTE/OBRA/ALMACÉN. Probé: " + CLIENT_CANDIDATES.join(" / "));
                  return;
              }

              if (!MES_COL && !FECHA_COL) {
                  showError(
                      "No encontré MES ni FECHA para armar el eje temporal."
                  );
                  return;
              }

              if (!AREA_COLS.length) {
                  showError("No pude detectar columnas de ÁREA.");
                  return;
              }

              data = m.slice(1).map(row => {
                  const o = {};
                  headers.forEach((h, i) => (o[h] = clean(row[i])));
                  return o;
              });

              getEl("dem2_clienteHint").textContent = `Columna cliente: ${CLIENT_COL}`;

              renderClientes();
              renderGC();
              applyAll();

              getEl("dem2_btnDownloadFiltrado")?.addEventListener("click", downloadFilteredCsv);
              
              getEl("dem2_clienteSelect")?.addEventListener("change", (e) => { 
                enforceAllOption(e.target); 
                applyAll(); 
              });

              getEl("dem2_clasifSelect")?.addEventListener("change", (e) => { 
                enforceAllOption(e.target); 
                applyAll(); 
              });

              getEl("dem2_mesSelect")?.addEventListener("change", (e) => {
                  enforceAllOption(e.target);
                  updateKPIs();
                  buildChartAreas();
                  buildChartMotivos();
                  buildTablaMotivos();
                  buildTabla();
                  buildSparklinesTable();
              });
          })
          .catch(err => {
              console.error(err);
              showError("Error cargando CSV: " + err.message);
          });
  };

  /* =========================================================
     HEATMAP (POR FILA / POR MES) — blanco → naranja → rojo
   ========================================================= */
  function lerp(a, b, t) {
      return a + (b - a) * t;
  }

  function mixRGB(c1, c2, t) {
      const r = Math.round(lerp(c1[0], c2[0], t));
      const g = Math.round(lerp(c1[1], c2[1], t));
      const b = Math.round(lerp(c1[2], c2[2], t));
      return `rgb(${r},${g},${b})`;
  }

  function heatColorWhiteOrangeRed(t) {
      t = Math.max(0, Math.min(1, t));

      const WHITE = [255, 255, 255];
      const ORANGE = [255, 165, 0];
      const RED = [220, 53, 69];

      if (t <= 0.5) {
          return mixRGB(WHITE, ORANGE, t / 0.5);
      }
      return mixRGB(ORANGE, RED, (t - 0.5) / 0.5);
  }

  function applyHeatmapPorFila() {
      const trs = document.querySelectorAll("#dem_tablaAreas tbody tr");

      trs.forEach(tr => {
          const cells = Array.from(tr.querySelectorAll("td.td-num"));
          const vals = cells.map(td => Number(td.dataset.v ?? 0));
          if (!vals.length) return;

          const min = Math.min(...vals);
          const max = Math.max(...vals);
          const range = max - min;

          cells.forEach((td, i) => {
              const v = vals[i];
              const t = range === 0 ? 0 : (v - min) / range;

              td.style.setProperty("background-color", heatColorWhiteOrangeRed(t), "important");
              td.style.setProperty("color", t >= 0.72 ? "#ffffff" : "#0b1220", "important");
              td.style.fontWeight = t >= 0.85 ? "800" : "600";
          });
      });
  }

})();
