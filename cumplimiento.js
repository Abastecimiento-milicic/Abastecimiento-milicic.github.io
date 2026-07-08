(function() {
  function _fmtPct(v) { if (v == null || isNaN(v)) return ""; const n = Math.round(v * 10) / 10; return n.toString().replace(".", ",") + "%"; }
  function _fmtNum1(v) { if (v == null || isNaN(v)) return ""; const n = Math.round(v * 10) / 10; return n.toString().replace(".", ","); }

  function makeDemoraAnnotations(xs, ys) {
    const ann = [];
    for (let i = 0; i < xs.length; i++) {
      const y = ys[i];
      if (y == null || isNaN(y)) continue;
      ann.push({
        x: xs[i],
        y: y,
        xref: "x",
        yref: "y2",
        text: Math.round(y) + " d",
        showarrow: true,
        arrowhead: 2,
        arrowsize: 1,
        arrowwidth: 1,
        ax: 0,
        ay: -18,
        bgcolor: "rgba(255,255,255,0.85)",
        bordercolor: "rgba(0,0,0,0.25)",
        borderwidth: 1,
        borderpad: 3,
        font: { size: 11, color: "#111" },
        align: "center"
      });
    }
    return ann;
  }

  function toNumAny(v) {
    if (v == null) return NaN;
    if (typeof v === "number") return v;
    const s = String(v).trim();
    if (!s) return NaN;
    const norm = s.replace(/\./g, "").replace(/,/g, ".");
    const n = parseFloat(norm);
    return isNaN(n) ? NaN : n;
  }

  /* ============================
     CONFIG
  ============================ */
  const csvUrl = "./CUMPLIMIENTO_2025.csv";
  const DELIM = ";";

  const FECHA_COL = "FECHA ENTREGA ESPERADA";
  const DEMORA_COL = "DIAS DE DEMORA";

  const CONDICION_ALMACEN_CANDIDATES = ["CONDICION ALMACEN", "CONDICIÒN ALMACEN", "CONDICIÓN ALMACEN", "SOLO ALMACEN"];
  let CONDICION_ALMACEN_COL = null;

  function avgDelay(rows) {
    let s = 0, c = 0;
    for (const r of rows) {
      const v = toNumAny(r[DEMORA_COL]);
      if (!isNaN(v)) { s += v; c++; }
    }
    return c ? (s / c) : NaN;
  }
  const CLIENT_CANDIDATES = ["CLIENTE / OBRA", "CLIENTE NRO.", "CLIENTE"];

  const CLASIF2_CANDIDATES = ["CLASIFICACION 2", "CLASIFICACIÓN 2", "CLASIFICACION2", "CLASIFICACION_2"];
  const GCOC_CANDIDATES = ["GRUPO DE COMPRAS OC", "GRUPO DE COMPRAS_OC", "GRUPO DE COMPRA OC"];
  const CENTRO_CANDIDATES = ["CENTRO"];

  const AT_COL = "ENTREGADOS AT";
  const FT_COL = "ENTREGADOS FT";
  const NO_COL = "NO ENTREGADOS";

  /* ============================
     COLORES (match KPIs)
  ============================ */
  const COLORS = {
    blue: "#3b82f6",
    green: "#10b981",
    amber: "#f59e0b",
    red: "#ef4444",
    grid: "rgba(15, 23, 42, 0.10)",
    text: "#0f172a",
    muted: "#64748b",
  };

  /* ============================
     GLOBAL (Isolated inside IIFE)
  ============================ */
  let data = [];
  let headers = [];

  let CLIENT_COL = null;
  let CLASIF2_COL = null;
  let GCOC_COL = null;
  let CENTRO_COL = null;

  let chartMes = null;
  let chartTendencia = null;

  /* ============================
     HELPERS
  ============================ */
  const clean = (v) => (v ?? "").toString().trim();

  function setText(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt ?? "";
  }

  function setHTML(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html ?? "";
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

  // Delta color helpers (restored from cumplimiento.js)
  function deltaInfo(curr, prev) {
    if (!isFinite(curr) || !isFinite(prev)) return { text: "Sin mes anterior", diff: NaN };
    const diff = curr - prev;
    const eps = 0.000001;
    if (Math.abs(diff) < eps) return { text: "• 0,0% vs mes anterior", diff: 0 };
    const arrow = diff > 0 ? "▲" : "▼";
    const txt = `${arrow} ${(Math.abs(diff) * 100).toFixed(1).replace(".", ",")}% vs mes anterior`;
    return { text: txt, diff };
  }

  function setDelta(el, text, cls) {
    if (!el) return;
    el.className = "kpi-sub"; // Reset classes but keep base style
    if (cls) el.classList.add(cls);
    el.textContent = text;
  }

  function fmtPct01(x) {
    if (!isFinite(x)) return "-";
    return (x * 100).toFixed(1).replace(".", ",") + "%";
  }

  function safeFilePart(s) {
    return clean(s).replace(/[^\w\-]+/g, "_").slice(0, 80) || "Todos";
  }

  function showError(msg) {
    setHTML("cumpl_msg", `<div class="error">${msg}</div>`);
  }

  /* ============================
     DATE PARSING
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
    const d = parseDateAny(r[FECHA_COL]);
    return d ? monthKey(d) : null;
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
     SELECT UTIL
  ============================ */
  function fillSelect(selectId, values, placeholder = "Todos") {
    const sel = document.getElementById(selectId);
    if (!sel) return;

    const prevSet = new Set([...sel.selectedOptions].map(o => o.value));

    sel.innerHTML = "";

    const optAll = document.createElement("option");
    optAll.value = "__ALL__";
    optAll.textContent = placeholder;
    sel.appendChild(optAll);

    for (const v of values) {
      const o = document.createElement("option");
      o.value = v;
      const normVal = clean(v).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const displayText = normVal === "PANOL" ? "ALMACÉN" : v;
      o.textContent = displayText;
      sel.appendChild(o);
    }

    const hasPrev = [...prevSet].some(v => v && v !== "__ALL__");
    if (!hasPrev) {
      optAll.selected = true;
    } else {
      [...sel.options].forEach(o => {
        if (prevSet.has(o.value)) o.selected = true;
      });
      enforceAllOption(sel);
    }
  }

  function uniqSorted(arr) {
    return [...new Set(arr.map(clean).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  }

  /* ============================
     FILTERS (Renamed element IDs)
  ============================ */
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
    const sel = document.getElementById(id);
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

  const MONTH_NAMES = {
    "01": "ENERO", "02": "FEBRERO", "03": "MARZO", "04": "ABRIL",
    "05": "MAYO", "06": "JUNIO", "07": "JULIO", "08": "AGOSTO",
    "09": "SEPTIEMBRE", "10": "OCTUBRE", "11": "NOVIEMBRE", "12": "DICIEMBRE"
  };

  function updateMesTitleFromSelect() {
    const titleEl = document.getElementById("cumpl_panelMesTitle");
    if (!titleEl) return;

    const ms = getSelValues("cumpl_mesSelect");

    if (!ms.length) {
      titleEl.textContent = "CUMPLIMIENTO - TODOS LOS MESES";
      return;
    }

    if (ms.length > 1) {
      titleEl.textContent = "CUMPLIMIENTO - MESES SELECCIONADOS";
      return;
    }

    const [year, month] = String(ms[0]).split("-");
    const mesTxt = MONTH_NAMES[month] || month || ms[0];

    titleEl.textContent = `CUMPLIMIENTO - MES DE ${mesTxt} ${year || ""}`.trim();
  }

  function getSingleMes(months) {
    const ms = getSelValues("cumpl_mesSelect");
    if (!months || !months.length) {
      return ms.length ? ms[ms.length - 1] : "";
    }
    if (!ms.length) return months[months.length - 1] || "";
    const set = new Set(ms);
    let last = "";
    for (const m of months) {
      if (set.has(m)) last = m;
    }
    return last || ms[ms.length - 1] || "";
  }

  function rowsByClienteBase() {
    const cs = getSelValues("cumpl_clienteSelect");
    let rows = cs.length ? data.filter(r => cs.includes(clean(r[CLIENT_COL]))) : data;

    if (CLASIF2_COL) {
      const equiposNorm = "EQUIPOS MENORES".normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const almacenNorm = "ALMACEN".normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      rows = rows.map(r => {
        const val = clean(r[CLASIF2_COL]).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (val === equiposNorm || val === almacenNorm) {
          return { ...r, [CLASIF2_COL]: "ALMACÉN" };
        }
        return r;
      });
    }

    return rows;
  }

function filteredRowsNoMes() {
    let rows = rowsByClienteBase();

    const c2s = getCheckedClasif2();
    if (c2s.length && CLASIF2_COL) rows = rows.filter(r => c2s.includes(clean(r[CLASIF2_COL])));
    const gcs = getSelValues("cumpl_gcocSelect");
    if (gcs.length && GCOC_COL) rows = rows.filter(r => gcs.includes(clean(r[GCOC_COL])));
    
    const cents = getSelValues("centroSelect");
    if (cents.length && CENTRO_COL) rows = rows.filter(r => cents.includes(clean(r[CENTRO_COL])));
    
    // 🌟 LÓGICA EN CASCADA: Solo filtra si el botón principal está activado
    const chkSoloAlmacen = document.getElementById("chkSoloAlmacen");
    if (chkSoloAlmacen && chkSoloAlmacen.checked && CONDICION_ALMACEN_COL) {
      const conds = getSelValues("condicionAlmacenSelect");
      if (conds.length) {
        // Si el usuario eligió opciones específicas (ej: Reposición directa)
        rows = rows.filter(r => conds.includes(clean(r[CONDICION_ALMACEN_COL])));
      } else {
        // Si activó el botón pero no marcó nada abajo, por defecto mostramos 
        // cualquier fila de almacén que NO esté vacía para que no se rompa la vista
        rows = rows.filter(r => clean(r[CONDICION_ALMACEN_COL]) !== "");
      }
    }
    
    return rows;
  }
  function filteredRowsByAll() {
    const rows = filteredRowsNoMes();
    const ms = getSelValues("cumpl_mesSelect");
    if (!ms.length) return rows;
    const set = new Set(ms);
    return rows.filter(r => set.has(getMonthKeyFromRow(r)));
  }

  /* ============================
     SELECTS
  ============================ */
  function renderClientes() {
    const clientes = uniqSorted(data.map(r => r[CLIENT_COL]));
    fillSelect("cumpl_clienteSelect", clientes, "Todos");
  }

  function renderCentros() {
    const hint = document.getElementById("centroHint");
    if (!CENTRO_COL) {
      if (hint) hint.textContent = "Columna: (no encontrada)";
      const sel = document.getElementById("centroSelect");
      if (sel) { sel.disabled = true; sel.innerHTML = `<option value="">Todos</option>`; }
      return;
    }
    if (hint) hint.textContent = `Columna: ${CENTRO_COL}`;
    const vals = uniqSorted(data.map(r => r[CENTRO_COL]));
    const sel = document.getElementById("centroSelect");
    if (sel) sel.disabled = false;
    fillSelect("centroSelect", vals, "Todos");
  }

function renderCondicionAlmacen() {
    const hint = document.getElementById("condicionAlmacenHint");
    if (!CONDICION_ALMACEN_COL) {
      if (hint) hint.textContent = "Columna: (no encontrada)";
      const sel = document.getElementById("condicionAlmacenSelect");
      if (sel) { sel.disabled = true; sel.innerHTML = `<option value="">Todos</option>`; }
      return;
    }
    if (hint) hint.textContent = `Columna: ${CONDICION_ALMACEN_COL}`;
    
    const vals = uniqSorted(data.map(r => r[CONDICION_ALMACEN_COL]));
    fillSelect("condicionAlmacenSelect", vals, "Todos (Almacén)");
    
    // Controlamos el estado inicial basado en el checkbox
    const chk = document.getElementById("chkSoloAlmacen");
    const sel = document.getElementById("condicionAlmacenSelect");
    if (sel && chk) {
      sel.disabled = !chk.checked;
    }
  }

  function renderClasif2(rowsBase) {
    const hint = document.getElementById("cumpl_clasif2Hint");
    if (!CLASIF2_COL) {
      if (hint) hint.textContent = "Columna: (no encontrada)";
      const sel = document.getElementById("cumpl_clasif2Select");
      if (sel) { sel.disabled = true; sel.innerHTML = `<option value="">Todos</option>`; }
      return;
    }
    if (hint) hint.textContent = `Columna: ${CLASIF2_COL}`;
    const vals = uniqSorted(rowsBase.map(r => clean(r[CLASIF2_COL])));
    const sel = document.getElementById("cumpl_clasif2Select");
    if (sel) sel.disabled = false;
    fillSelect("cumpl_clasif2Select", vals, "Todos");
  }

  function getCheckedClasif2() {
    return getSelValues("cumpl_clasif2Select");
  }

  function renderGcoc(rowsBase) {
    const hint = document.getElementById("cumpl_gcocHint");
    if (!GCOC_COL) {
      if (hint) hint.textContent = "Columna: (no encontrada)";
      const sel = document.getElementById("cumpl_gcocSelect");
      if (sel) { sel.disabled = true; sel.innerHTML = `<option value="">Todos</option>`; }
      return;
    }
    if (hint) hint.textContent = `Columna: ${GCOC_COL}`;
    const vals = uniqSorted(rowsBase.map(r => r[GCOC_COL]));
    const sel = document.getElementById("cumpl_gcocSelect");
    if (sel) sel.disabled = false;
    fillSelect("cumpl_gcocSelect", vals, "Todos");
  }

  function buildMesSelect(rows) {
    const sel = document.getElementById("cumpl_mesSelect");
    if (!sel) return [];

    const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))].sort();
    const prevSet = new Set([...sel.selectedOptions].map(o => o.value));

    sel.innerHTML = "";

    const optAll = document.createElement("option");
    optAll.value = "__ALL__";
    optAll.textContent = "Todos";
    sel.appendChild(optAll);

    for (const m of months) {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = m;
      sel.appendChild(o);
    }

    const prevValid = [...prevSet].filter(v => v && v !== "__ALL__" && months.includes(v));
    if (prevValid.length) {
      [...sel.options].forEach(o => { if (prevSet.has(o.value)) o.selected = true; });
    } else {
      const last = months[months.length - 1];
      if (last) {
        const optLast = [...sel.options].find(o => o.value === last);
        if (optLast) optLast.selected = true;
      } else {
        optAll.selected = true;
      }
    }

    enforceAllOption(sel);

    const hint = document.getElementById("cumpl_mesHint");
    if (hint) {
      const label = selLabel("cumpl_mesSelect");
      hint.textContent = label === "Todos" ? "Mes seleccionado: Todos" : `Mes seleccionado: ${label}`;
    }

    updateMesTitleFromSelect();

    return months;
  }

  /* ============================
     KPI CALCS
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

    return { at, ft, no, total, pctAT, pctFT, pctNO };
  }

  /* ============================
     KPIs UI (Updated unique IDs)
  ============================ */
  function updateKPIsGeneral(rows) {
    const t = calcTotals(rows);
    const pctAT = t.total ? t.at / t.total : NaN;
    const pctFT = t.total ? t.ft / t.total : NaN;
    const pctNO = t.total ? t.no / t.total : NaN;

    setText("cumpl_kpiTotal", fmtInt(t.total));

    setText("cumpl_kpiATpct", fmtPct01(pctAT));
    setText("cumpl_kpiATqty", `Cantidad: ${fmtInt(t.at)}`);
    const elAT = document.getElementById("cumpl_kpiATpct");
    if (elAT) elAT.style.color = (isFinite(pctAT) && pctAT >= 0.78) ? "#16a34a" : "#ef4444";

    const avgG = avgDelay(rows);
    setText("cumpl_kpiDemoraAvg", isNaN(avgG) ? "-" : (Math.round(avgG) + " d"));
    const elDemG = document.getElementById("cumpl_kpiDemoraAvg");
    if (elDemG) elDemG.style.color = (!isNaN(avgG) && avgG > 7) ? "#ef4444" : "#16a34a";

    setText("cumpl_kpiFTpct", fmtPct01(pctFT));
    setText("cumpl_kpiFTqty", `Cantidad: ${fmtInt(t.ft)}`);

    setText("cumpl_kpiNOpct", fmtPct01(pctNO));
    setText("cumpl_kpiNOqty", `Cantidad: ${fmtInt(t.no)}`);
  }

  function updateKPIsMonthly(rows, months) {
    const ms = getSelValues("cumpl_mesSelect");
    if (!ms.length) {
      const t = calcTotals(rows);
      const pctAT = t.total ? t.at / t.total : NaN;
      const pctFT = t.total ? t.ft / t.total : NaN;
      const pctNO = t.total ? t.no / t.total : NaN;

      setText("cumpl_kpiTotalMes", fmtInt(t.total));

      setText("cumpl_kpiATmes", fmtPct01(pctAT));
      const elATmes = document.getElementById("cumpl_kpiATmes");
      if (elATmes) elATmes.style.color = (isFinite(pctAT) && pctAT >= 0.78) ? "#16a34a" : "#ef4444";

      setText("cumpl_kpiFTmes", fmtPct01(pctFT));
      setText("cumpl_kpiNOmes", fmtPct01(pctNO));

      const avgM = avgDelay(rows);
      setText("cumpl_kpiDemoraMes", isNaN(avgM) ? "-" : (Math.round(avgM) + " d"));
      const elDemM = document.getElementById("cumpl_kpiDemoraMes");
      if (elDemM) elDemM.style.color = (!isNaN(avgM) && avgM > 7) ? "#ef4444" : "#16a34a";

      const atSub = document.getElementById("cumpl_kpiATmesSub");
      const ftSub = document.getElementById("cumpl_kpiFTmesSub");
      const noSub = document.getElementById("cumpl_kpiNOmesSub");

      if (atSub) setDelta(atSub, `Cant: ${fmtInt(t.at)} · Todos los meses`, "delta-neutral");
      if (ftSub) setDelta(ftSub, `Cant: ${fmtInt(t.ft)} · Todos los meses`, "delta-neutral");
      if (noSub) setDelta(noSub, `Cant: ${fmtInt(t.no)} · Todos los meses`, "delta-neutral");
      return;
    }

    const mes = getSingleMes(months);
    if (!mes) return;

    const idx = months.indexOf(mes);
    const prevMes = idx > 0 ? months[idx - 1] : null;

    const cur = calcMonthTotals(rows, mes);
    const prev = prevMes ? calcMonthTotals(rows, prevMes) : null;

    setText("cumpl_kpiTotalMes", fmtInt(cur.total));

    setText("cumpl_kpiATmes", fmtPct01(cur.pctAT));
    const elATmes = document.getElementById("cumpl_kpiATmes");
    if (elATmes) elATmes.style.color = (isFinite(cur.pctAT) && cur.pctAT >= 0.78) ? "#16a34a" : "#ef4444";

    setText("cumpl_kpiFTmes", fmtPct01(cur.pctFT));
    setText("cumpl_kpiNOmes", fmtPct01(cur.pctNO));

    const mesRows = rows.filter(r => getMonthKeyFromRow(r) === mes);
    const avgM = avgDelay(mesRows);
    setText("cumpl_kpiDemoraMes", isNaN(avgM) ? "-" : (Math.round(avgM) + " d"));
    const elDemM = document.getElementById("cumpl_kpiDemoraMes");
    if (elDemM) elDemM.style.color = (!isNaN(avgM) && avgM > 7) ? "#ef4444" : "#16a34a";

    const atSub = document.getElementById("cumpl_kpiATmesSub");
    const ftSub = document.getElementById("cumpl_kpiFTmesSub");
    const noSub = document.getElementById("cumpl_kpiNOmesSub");

    if (!prev) {
      setDelta(atSub, `Cant: ${fmtInt(cur.at)} · Sin mes anterior`, "delta-neutral");
      setDelta(ftSub, `Cant: ${fmtInt(cur.ft)} · Sin mes anterior`, "delta-neutral");
      setDelta(noSub, `Cant: ${fmtInt(cur.no)} · Sin mes anterior`, "delta-neutral");
      return;
    }

    const dAT = deltaInfo(cur.pctAT, prev.pctAT);
    const dFT = deltaInfo(cur.pctFT, prev.pctFT);
    const dNO = deltaInfo(cur.pctNO, prev.pctNO);

    let clsAT = "delta-good";
    if (dAT.diff < 0) clsAT = "delta-bad";

    let clsFT = "delta-bad";
    if (dFT.diff < 0) clsFT = "delta-good";

    let clsNO = "delta-good";
    if (dNO.diff > 0) clsNO = "delta-bad";

    setDelta(atSub, `Cant: ${fmtInt(cur.at)} · ${dAT.text}`, clsAT);
    setDelta(ftSub, `Cant: ${fmtInt(cur.ft)} · ${dFT.text}`, clsFT);
    setDelta(noSub, `Cant: ${fmtInt(cur.no)} · ${dNO.text}`, clsNO);
  }

  /* ============================
     CHART DEFAULTS (ECharts)
  ============================ */
  function applyChartDefaults() {
    // ECharts global settings
  }

  /* ============================
     CHART 1: 100% stacked bar + línea (ECharts)
  ============================ */
  function buildChartMes(rows) {
    const agg = new Map();
    const monthsSet = new Set();

    for (const r of rows) {
      const d = parseDateAny(r[FECHA_COL]);
      if (!d) continue;

      const mk = monthKey(d);
      monthsSet.add(mk);

      if (!agg.has(mk)) agg.set(mk, { at: 0, ft: 0, no: 0, comp: 0, demSum: 0, demCnt: 0 });
      const c = agg.get(mk);

      c.at += toNumber(r[AT_COL]);
      c.ft += toNumber(r[FT_COL]);
      c.no += toNumber(r[NO_COL]);
      c.comp += toNumber(r["COMPROMETIDOS"]) || (toNumber(r[AT_COL]) + toNumber(r[FT_COL]) + toNumber(r[NO_COL]));

      const dem = toNumAny(r[DEMORA_COL]);
      if (!isNaN(dem)) { c.demSum += dem; c.demCnt += 1; }
    }

    const months = [...monthsSet].sort();
    const qAT = months.map(m => agg.get(m)?.at ?? 0);
    const qFT = months.map(m => agg.get(m)?.ft ?? 0);
    const qNO = months.map(m => agg.get(m)?.no ?? 0);

    const pAT = qAT.map((v, i) => { const t = qAT[i] + qFT[i] + qNO[i]; return t ? (v / t) * 100 : 0; });
    const pFT = qFT.map((v, i) => { const t = qAT[i] + qFT[i] + qNO[i]; return t ? (v / t) * 100 : 0; });
    const pNO = qNO.map((v, i) => { const t = qAT[i] + qFT[i] + qNO[i]; return t ? (v / t) * 100 : 0; });

    const avgDem = months.map(m => {
      const c = agg.get(m);
      return (c && c.demCnt) ? (c.demSum / c.demCnt) : null;
    });

    const pAT_acum = [];
    let sumaEntregadosATAcum = 0;
    let sumaComprometidosAcum = 0;

    for (let i = 0; i < months.length; i++) {
      const c = agg.get(months[i]);
      sumaEntregadosATAcum += (c?.at ?? 0);
      sumaComprometidosAcum += (c?.comp ?? 0);
      const pctAcum = sumaComprometidosAcum ? (sumaEntregadosATAcum / sumaComprometidosAcum) * 100 : 0;
      pAT_acum.push(pctAcum);
    }

    const el = document.getElementById("cumpl_chartMes");
    if (!el || !window.echarts) return;

    if (!chartMes) chartMes = echarts.init(el, null, { renderer: "canvas" });

    const lineSegments = [];

    if (months.length === 1) {
      const anoActual = parseInt(months[0].substring(0, 4), 10);
      const hActual = (anoActual >= 2026) ? 78 : 75;
      lineSegments.push({
        yAxis: hActual,
        label: {
          show: true,
          formatter: `Obj ${hActual}%`,
          fontWeight: 800,
          fontSize: 11,
          position: "end",
          backgroundColor: '#374151',
          color: '#fff',
          padding: [4, 6],
          borderRadius: 4
        }
      });
    } else {
      for (let i = 0; i < months.length - 1; i++) {
        const anoActual = parseInt(months[i].substring(0, 4), 10);
        const hActual = (anoActual >= 2026) ? 78 : 75;
        
        const isLastSegment = (i === months.length - 2);

        const anoSig = parseInt(months[i + 1].substring(0, 4), 10);
        const hSig = (anoSig >= 2026) ? 78 : 75;

        const showLabelOnHorizontal = isLastSegment && (hActual === hSig);

        lineSegments.push([
          { 
            xAxis: i, 
            yAxis: hActual, 
            label: showLabelOnHorizontal ? {
              show: true,
              formatter: `Obj ${hSig}%`,
              fontWeight: 800,
              fontSize: 11,
              position: "end",
              offset: [35, 0],
              backgroundColor: '#374151',
              color: '#fff',
              padding: [4, 6],
              borderRadius: 4
            } : { show: false }
          },
          { 
            xAxis: i + 1, 
            yAxis: hActual
          }
        ]);

        if (hActual !== hSig) {
          const showLabelOnVertical = isLastSegment;
          
          lineSegments.push([
            { 
              xAxis: i + 1, 
              yAxis: hActual, 
              label: showLabelOnVertical ? {
                show: true,
                formatter: `Obj ${hSig}%`,
                fontWeight: 800,
                fontSize: 11,
                position: "end",
                offset: [35, 0],
                backgroundColor: '#374151',
                color: '#fff',
                padding: [4, 6],
                borderRadius: 4
              } : { show: false }
            },
            { 
              xAxis: i + 1, 
              yAxis: hSig
            }
          ]);
        }
      }
    }

    const option = {
      animation: true,
      animationDuration: 800,
      animationDurationUpdate: 600,
      animationEasing: "cubicOut",
      animationEasingUpdate: "cubicOut",
      grid: { left: 56, right: 70, top: 40, bottom: 62 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        confine: true,
        backgroundColor: "transparent",
        borderColor: "transparent",
        shadowColor: "transparent",
        shadowBlur: 0,
        borderWidth: 0,
        padding: 0,
        formatter: (params) => {
          const axis = params?.[0]?.axisValue ?? "";
          const byName = Object.fromEntries(params.map(p => [p.seriesName, p]));
          const at = byName["Entregados AT"];
          const ft = byName["Entregados FT"];
          const ne = byName["No entregados"];
          const acum = byName["%AT Acumulado"];
          const dem = byName["Promedio días de demora"];

          let html = `
            <div style="font-family: var(--font-body), sans-serif; padding: 10px 14px; min-width: 190px; background: #ffffff; border-radius: 8px; box-shadow: var(--shadow-xl); border: 1.5px solid var(--border-light); color: var(--text-main);">
              <div style="font-family: var(--font-main), sans-serif; font-weight: 800; font-size: 0.9rem; margin-bottom: 8px; border-bottom: 1.5px solid var(--border-light); padding-bottom: 6px; color: var(--text-main); letter-spacing: 0.02em;">
                📅 ${axis}
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px;">
          `;

          if (at) {
            html += `
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; gap: 15px;">
                <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--text-muted);">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></span>
                  A Tiempo
                </span>
                <span style="font-weight: 800; color: var(--text-main);">${fmtInt(qAT[at.dataIndex])} <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">(${_fmtNum1(at.value)}%)</span></span>
              </div>
            `;
          }
          if (ft) {
            html += `
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; gap: 15px;">
                <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--text-muted);">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;"></span>
                  Fuera Tiempo
                </span>
                <span style="font-weight: 800; color: var(--text-main);">${fmtInt(qFT[ft.dataIndex])} <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">(${_fmtNum1(ft.value)}%)</span></span>
              </div>
            `;
          }
          if (ne) {
            html += `
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; gap: 15px;">
                <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--text-muted);">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #ef4444;"></span>
                  No Entregados
                </span>
                <span style="font-weight: 800; color: #ef4444;">${fmtInt(qNO[ne.dataIndex])} <span style="font-size: 0.75rem; color: #ef4444; font-weight: 600;">(${_fmtNum1(ne.value)}%)</span></span>
              </div>
            `;
          }
          if (acum) {
            html += `
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; border-top: 1.5px solid var(--border-light); padding-top: 6px; margin-top: 2px; gap: 15px;">
                <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--text-muted);">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #7c3aed;"></span>
                  % AT Acum.
                </span>
                <span style="font-weight: 800; color: #7c3aed;">${_fmtNum1(acum.value)}%</span>
              </div>
            `;
          }
          if (dem && dem.value != null && !isNaN(dem.value)) {
            html += `
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; border-top: 1.5px solid var(--border-light); padding-top: 6px; margin-top: 2px; gap: 15px;">
                <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--text-muted);">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #3b82f6;"></span>
                  Demora Prom.
                </span>
                <span style="font-weight: 800; color: #2563eb;">${Math.round(dem.value)} días</span>
              </div>
            `;
          }

          html += `
              </div>
            </div>
          `;
          return html;
        }
      },
      legend: {
        bottom: 12,
        left: "center",
        itemWidth: 14,
        itemHeight: 10,
        textStyle: { fontWeight: 800 }
      },
      xAxis: {
        type: "category",
        data: months,
        axisTick: { alignWithLabel: true },
        axisLabel: { fontWeight: 700 }
      },
      yAxis: [
        {
          type: "value",
          min: 0,
          max: 100,
          axisLabel: { formatter: "{value}%" },
          splitLine: { lineStyle: { color: "rgba(15,23,42,0.10)" } }
        },
        {
          type: "value",
          name: "Días de demora",
          position: "right",
          axisLabel: { fontWeight: 700 },
          splitLine: { show: false },
          boundaryGap: [0, '25%']
        }
      ],
    series: [
        {
          name: "Entregados AT",
          type: "bar",
          stack: "pct",
          data: pAT.map(v => {
            const val = +(+v).toFixed(4);
            if (val < 78) {
              return {
                value: val,
                itemStyle: {
                  borderColor: '#dc2626',
                  borderWidth: 2,
                  borderType: 'solid',
                  borderRadius: [6, 6, 0, 0]
                }
              };
            }
            return val;
          }),
          barMaxWidth: 52,
          itemStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "#10b981" },
                { offset: 1, color: "#047857" }
              ]
            },
            borderRadius: [6, 6, 0, 0]
          },
          label: {
            show: true,
            position: "insideBottom", // <--- Lo bajamos un toque al piso de la barra verde para dejar libre el centro
            distance: 10,
            fontWeight: 900,
            fontSize: 11,
            lineHeight: 12,
            formatter: (p) => {
              const i = p.dataIndex;
              const pct = +p.value || 0;
              const q = (qAT)[i] || 0;
              if (!q) return "";
              if (pct < 6) return "";
              const pctRound = Math.round(pct);
              if (pct < 78) return `{warn|${fmtInt(q)}\n⚠ (${pctRound}%)}`;
              return `${fmtInt(q)}\n(${pctRound}%)`;
            },
            rich: {
              warn: {
                fontWeight: 950,
                color: "#7f1d1d",
                backgroundColor: "rgba(254, 202, 202, 0.9)",
                borderColor: "#b91c1c",
                borderWidth: 1.5,
                borderRadius: 4,
                padding: [2, 4],
                fontSize: 11,
                lineHeight: 14,
                align: 'center'
              }
            },
            color: "#ffffff",
            backgroundColor: "rgba(0,0,0,0.15)",
            borderRadius: 4,
            padding: [2, 4]
          },
          labelLayout: { hideOverlap: true },
          emphasis: { disabled: true },
          markLine: {
            silent: true,
            symbol: ["none", "none"],
            lineStyle: { type: "dashed", width: 2, color: "#374151" },
            clip: false,
            data: lineSegments
          },
          z: 1,
          zlevel: 0
        },
        {
          name: "Entregados FT",
          type: "bar",
          stack: "pct",
          data: pFT.map(v => +(+v).toFixed(4)),
          barMaxWidth: 52,
          itemStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "#f59e0b" },
                { offset: 1, color: "#d97706" }
              ]
            }
          },
          label: {
            show: true,
            position: "insideTop", // <--- Forzamos a que el texto naranja ("630 (19%)") vaya al techo de su bloque, lejos de la línea morada
            distance: 4,
            color: "#111",
            fontWeight: 950,
            fontSize: 11,
            lineHeight: 12,
            formatter: (p) => {
              const i = p.dataIndex;
              const pct = +p.data || 0;
              const q = (qFT)[i] || 0;
              if (!q) return "";
              if (pct < 8) return ""; // Si el bloque es muy chico (menos de 8%), no ponemos etiqueta para que no tape nada
              return `${fmtInt(q)}\n(${Math.round(pct)}%)`;
            }
          },
          labelLayout: { hideOverlap: true },
          emphasis: { disabled: true },
          z: 1,
          zlevel: 0
        },
        {
          name: "No entregados",
          type: "bar",
          stack: "pct",
          data: pNO.map(v => +(+v).toFixed(4)),
          barMaxWidth: 52,
          itemStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "#f87171" },
                { offset: 1, color: "#ef4444" }
              ]
            }
          },
          label: {
            show: true,
            position: "top", // <--- Las alertas rojas van ARRIBA de todo de la barra externa
            distance: 2,
            color: "#fff",
            fontWeight: 900,
            fontSize: 11,
            lineHeight: 12,
            backgroundColor: "rgba(239, 68, 68, 0.9)", // Le da un fondo rojo nítido para que flote limpio
            padding: [2, 4],
            borderRadius: 3,
            formatter: (p) => {
              const i = p.dataIndex;
              const pct = +p.data || 0;
              const q = (qNO)[i] || 0;
              if (!q) return "";
              return `${fmtInt(q)} (${Math.round(pct)}%)`;
            }
          },
          labelLayout: { hideOverlap: true },
          emphasis: { disabled: true },
          z: 1,
          zlevel: 0
        },
       {
          name: "%AT Acumulado",
          type: "line",
          data: pAT_acum.map(v => +(+v).toFixed(2)),
          showSymbol: true,         
          symbol: "circle",         
          symbolSize: 1,            
          showAllSymbol: true,      
          lineStyle: { 
            width: 3.5,         
            type: "solid",      
            color: "#7c3aed"    
          },
          itemStyle: { color: "#7c3aed" },
          label: {
            show: true,             
            position: "bottom",   // <--- Vuelve abajo para no irse al techo
            distance: 6,          // Ajuste fino para que quede pegado abajo de la línea morada
            formatter: (p) => {
              const val = +p.data;
              if (val == null || isNaN(val)) return "";
              return val.toFixed(2).replace(".", ",") + "%";
            },
            backgroundColor: "rgba(255, 255, 255, 0.85)", // Mantiene el cartel blanco para legibilidad
            padding: [2, 4],                             
            borderRadius: 3,                             
            borderColor: "rgba(124, 58, 237, 0.25)",      
            borderWidth: 1,
            textStyle: { fontWeight: 850, color: "#6d28d9", fontSize: 10 }
          },
          emphasis: {
            disabled: false,
            scale: false, 
            label: {
              show: true, 
              position: "bottom",
              formatter: (p) => {
                const val = +p.data;
                if (val == null || isNaN(val)) return "";
                return val.toFixed(2).replace(".", ",") + "%";
              },
              textStyle: { fontWeight: 850, color: "#6d28d9", fontSize: 10 }
            }
          },
          z: 6
        },
        {
          name: "Promedio días de demora",
          type: "line",
          yAxisIndex: 1,
          data: avgDem,
          symbol: "circle",
          symbolSize: 0,          // <--- TRUCO: Hace invisibles los círculos sin romper los textos
          showSymbol: true,       // <--- Mantiene activo el motor de etiquetas
          connectNulls: true,
          lineStyle: { width: 3, color: COLORS.blue },
          itemStyle: { color: COLORS.blue },
          label: {
            show: true,
            position: "top",      // Las etiquetas de días flotan arriba de la línea celeste
            distance: 8,
            backgroundColor: "rgba(255,255,255,0.85)", 
            padding: [2, 4],
            borderRadius: 4,
            fontWeight: 950,
            color: "#0b1220",
            formatter: (p) => (p.data == null || isNaN(p.data)) ? "" : `${Math.round(p.data)} d`
          },
          markLine: {
            silent: true,
            symbol: ["none", "none"],
            label: {
              show: true,
              formatter: "Lím 7 d",
              fontWeight: 800,
              fontSize: 11,
              position: "end",
              backgroundColor: '#374151',
              color: '#fff',
              padding: [4, 6],
              borderRadius: 4
            },
            lineStyle: { type: "dashed", width: 2, color: "#374151" },
            data: [{ yAxis: 7 }]
          },
          z: 10
        }
      ]
    };

    chartMes.setOption(option, true);
    window.addEventListener("resize", () => chartMes && chartMes.resize(), { passive: true });
  }

  /* ============================
     CHART 2: Trend lines (ECharts)
  ============================ */
  function buildChartTendencia(rows) {
    const agg = new Map();
    const monthsSet = new Set();

    for (const r of rows) {
      const d = parseDateAny(r[FECHA_COL]);
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

    const pAT = months.map(m => {
      const c = agg.get(m); const t = (c?.at ?? 0) + (c?.ft ?? 0) + (c?.no ?? 0);
      return t ? ((c.at ?? 0) / t) * 100 : 0;
    });
    const pFT = months.map(m => {
      const c = agg.get(m); const t = (c?.at ?? 0) + (c?.ft ?? 0) + (c?.no ?? 0);
      return t ? ((c.ft ?? 0) / t) * 100 : 0;
    });
    const pNO = months.map(m => {
      const c = agg.get(m); const t = (c?.at ?? 0) + (c?.ft ?? 0) + (c?.no ?? 0);
      return t ? ((c.no ?? 0) / t) * 100 : 0;
    });

    const el = document.getElementById("cumpl_chartTendencia");
    if (!el || !window.echarts) return;
    if (!chartTendencia) chartTendencia = echarts.init(el, null, { renderer: "canvas" });

    const option = {
      animation: true,
      animationDuration: 800,
      animationDurationUpdate: 600,
      animationEasing: "cubicOut",
      animationEasingUpdate: "cubicOut",
      grid: { left: 56, right: 18, top: 16, bottom: 62 },
      tooltip: {
        trigger: "axis",
        confine: true,
        backgroundColor: "transparent",
        borderColor: "transparent",
        shadowColor: "transparent",
        shadowBlur: 0,
        borderWidth: 0,
        padding: 0,
        formatter: (params) => {
          const axis = params?.[0]?.axisValue ?? "";
          let html = `
            <div style="font-family: var(--font-body), sans-serif; padding: 10px 14px; min-width: 190px; background: #ffffff; border-radius: 8px; box-shadow: var(--shadow-xl); border: 1.5px solid var(--border-light); color: var(--text-main);">
              <div style="font-family: var(--font-main), sans-serif; font-weight: 800; font-size: 0.9rem; margin-bottom: 8px; border-bottom: 1.5px solid var(--border-light); padding-bottom: 6px; color: var(--text-main); letter-spacing: 0.02em;">
                📅 Tendencia: ${axis}
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px;">
          `;
          for (const p of params) {
            const color = p.color || "#0d9488";
            html += `
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; gap: 15px;">
                <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--text-muted);">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${color};"></span>
                  ${p.seriesName}
                </span>
                <span style="font-weight: 800; color: var(--text-main);">${_fmtNum1(p.data)}%</span>
              </div>
            `;
          }
          html += `
              </div>
            </div>
          `;
          return html;
        }
      },
      legend: {
        bottom: 12,
        left: "center",
        itemWidth: 14,
        itemHeight: 10,
        textStyle: { fontWeight: 800 }
      },
      xAxis: { type: "category", data: months, axisLabel: { fontWeight: 700 } },
      yAxis: {
        type: "value",
        min: 0,max: 100,
        axisLabel: { formatter: "{value}%" },
        splitLine: { lineStyle: { color: "rgba(15,23,42,0.10)" } }
      },
      series: [
        {
          name: "A Tiempo %",
          type: "line",
          data: pAT.map(v => +(+v).toFixed(2)),
          symbolSize: 7,
          lineStyle: { width: 3, color: COLORS.green },
          itemStyle: { color: COLORS.green, borderColor: "#fff", borderWidth: 2 },
          label: {
            show: true,
            position: "top",
            formatter: (p) => {
              const v = +p.data || 0;
              return (v < 78) ? `{warn|⚠ ${_fmtPct(v)}}` : `{ok|${_fmtPct(v)}}`;
            },
            rich: {
              ok: { fontWeight: 900, color: COLORS.green },
              warn: { fontWeight: 950, color: "#7f1d1d", backgroundColor: "rgba(239,68,68,0.18)", borderColor: "#ef4444", borderWidth: 1, borderRadius: 4, padding: [2, 4] }
            }
          },
          zlevel: 5, z: 5
        },
        {
          name: "Fuera Tiempo %",
          type: "line",
          data: pFT.map(v => +(+v).toFixed(2)),
          symbolSize: 7,
          lineStyle: { width: 3, color: COLORS.amber },
          itemStyle: { color: COLORS.amber, borderColor: "#fff", borderWidth: 2 },
          label: { show: true, position: "top", fontWeight: 900, formatter: (p) => _fmtPct(p.data) },
          zlevel: 5, z: 5
        },
        {
          name: "No Entregados %",
          type: "line",
          data: pNO.map(v => +(+v).toFixed(2)),
          symbolSize: 7,
          lineStyle: { width: 3, color: COLORS.red },
          itemStyle: { color: COLORS.red, borderColor: "#fff", borderWidth: 2 },
          label: { show: true, position: "top", fontWeight: 900, formatter: (p) => _fmtPct(p.data) },
          zlevel: 5, z: 5
        }
      ]
    };

    chartTendencia.setOption(option, true);
    window.addEventListener("resize", () => chartTendencia && chartTendencia.resize(), { passive: true });
  }

  /* ============================
     DOWNLOAD: NO ENTREGADOS
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

  function clearAllFilters() {
    const selects = ["cumpl_clienteSelect", "cumpl_clasif2Select", "cumpl_gcocSelect", "cumpl_mesSelect", "centroSelect"];
    // 🌟 Agregamos "condicionAlmacenSelect" a la lista de restablecimiento
    const chk = document.getElementById("chkSoloAlmacen");
    if (chk) chk.checked = false;
    const selCond = document.getElementById("condicionAlmacenSelect");
    if (selCond) selCond.disabled = true;
    const selects = ["cumpl_clienteSelect", "cumpl_clasif2Select", "cumpl_gcocSelect", "cumpl_mesSelect", "centroSelect", "condicionAlmacenSelect"];
    selects.forEach(id => {
      const sel = document.getElementById(id);
    selects.forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      [...sel.options].forEach((opt, idx) => {
        opt.selected = (idx === 0 || opt.value === "__ALL__" || opt.value === "");
      });
      enforceAllOption(sel);
    });

    updateMesTitleFromSelect();
    applyAll();
  }

  /* ============================
     APPLY ALL (con filtros nuevos)
  ============================ */
  function applyAll() {
    const baseCliente = rowsByClienteBase();

    renderClasif2(baseCliente);

    const baseParaGc = (() => {
      let r = baseCliente;
      const c2s = getCheckedClasif2();
      if (c2s.length && CLASIF2_COL) r = r.filter(x => c2s.includes(clean(x[CLASIF2_COL])));
      return r;
    })();
    renderGcoc(baseParaGc);

    const rows = filteredRowsNoMes();

    const months = buildMesSelect(rows);

    updateKPIsGeneral(rows);
    updateKPIsMonthly(rows, months);

    buildChartMes(rows);
    buildChartTendencia(rows);
  }

  /* ============================
     EXPOSE DEFERRED INITIALIZATION LIFE CYCLE HOOK
  =========================== */
  window.initCumplimiento = function() {
    if (window.cumplimientoInitialized) return;
    window.cumplimientoInitialized = true;

    applyChartDefaults();

    // fecha en header
    setText("lastUpdate", (window.LAST_UPDATE || "").toString().trim() || "--/--/----");
    
    // fetch with cache
    fetchWithCache(csvUrl + "?t=" + window.CACHE_BUSTER)
      .then(text => {
        const m = parseDelimited(text, DELIM);
        if (!m.length || m.length < 2) {
          showError("El CSV está vacío o no tiene filas.");
          return;
        }

        headers = m[0].map(clean);

        CLIENT_COL = CLIENT_CANDIDATES.find(c => headers.includes(c));
        if (!CLIENT_COL) {
          showError("No encuentro columna CLIENTE. Probé: " + CLIENT_CANDIDATES.join(" / "));
          return;
        }

   CLASIF2_COL = CLASIF2_CANDIDATES.find(c => headers.includes(c)) || null;
        GCOC_COL = GCOC_CANDIDATES.find(c => headers.includes(c)) || null;
        CENTRO_COL = CENTRO_CANDIDATES.find(c => headers.includes(c)) || null;
        // 🌟 Detectamos dinámicamente si la columna está presente en el encabezado del CSV
        CONDICION_ALMACEN_COL = CONDICION_ALMACEN_CANDIDATES.find(c => headers.includes(c)) || null;

        
        const required = [FECHA_COL, AT_COL, FT_COL, NO_COL];
        const missing = required.filter(c => !headers.includes(c));
        if (missing.length) {
          showError("Faltan columnas en el CSV: " + missing.join(", "));
          return;
        }

        data = m.slice(1).map(row => {
          const o = {};
          headers.forEach((h, i) => (o[h] = clean(row[i])));
          return o;
        });

        setText("cumpl_clienteHint", `Columna cliente: ${CLIENT_COL}`);
        setText("cumpl_clasif2Hint", CLASIF2_COL ? `Columna: ${CLASIF2_COL}` : "Columna: (no encontrada)");
        setText("cumpl_gcocHint", GCOC_COL ? `Columna: ${GCOC_COL}` : "Columna: (no encontrada)");
        setText("centroHint", CENTRO_COL ? `Columna: ${CENTRO_COL}` : "Columna: (no encontrada)");
        setText("centroHint", CENTRO_COL ? `Columna: ${CENTRO_COL}` : "Columna: (no encontrada)");
        // 🌟 Seteamos el texto e inicializamos las opciones
        setText("condicionAlmacenHint", CONDICION_ALMACEN_COL ? `Columna: ${CONDICION_ALMACEN_COL}` : "Columna: (no encontrada)");

        renderClientes();
        renderCentros();
        // 🌟 Renderizamos las opciones de condición de almacén
        renderCondicionAlmacen();
        applyAll();

        // Listeners con IDs únicos
        document.getElementById("cumpl_clienteSelect")?.addEventListener("change", (e) => {
          enforceAllOption(e.target);
          applyAll();
        });

        document.getElementById("cumpl_clasif2Select")?.addEventListener("change", (e) => {
          enforceAllOption(e.target);
          const gc = document.getElementById("cumpl_gcocSelect");
          if (gc) { gc.selectedIndex = 0; enforceAllOption(gc); }
          applyAll();
        });

        document.getElementById("cumpl_gcocSelect")?.addEventListener("change", (e) => {
          enforceAllOption(e.target);
          applyAll();
        });

        document.getElementById("centroSelect")?.addEventListener("change", (e) => {
          enforceAllOption(e.target);
          applyAll();
          renderCentros();
        renderCondicionAlmacen();
        applyAll();

        // 🌟 LISTENERS DEL NUEVO COMPONENTE EN CASCADA
        const chkSoloAlmacen = document.getElementById("chkSoloAlmacen");
        const condicionSelect = document.getElementById("condicionAlmacenSelect");

        chkSoloAlmacen?.addEventListener("change", (e) => {
          if (condicionSelect) {
            // Habilitamos o deshabilitamos el cuadro de selección
            condicionSelect.disabled = !e.target.checked;
            // Si se desactiva, restablecemos la selección interna a "Todos"
            if (!e.target.checked) {
              condicionSelect.selectedIndex = 0;
              enforceAllOption(condicionSelect);
            }
          }
          applyAll();
        });

        condicionSelect?.addEventListener("change", (e) => {
          enforceAllOption(e.target);
          applyAll();
        });
   

        // 🌟 NUEVO LISTENERS: Ejecutar los cálculos cuando cambie la selección de almacén
        document.getElementById("condicionAlmacenSelect")?.addEventListener("change", (e) => {
          enforceAllOption(e.target);
          applyAll();
        });
        document.getElementById("cumpl_mesSelect")?.addEventListener("change", (e) => {
          enforceAllOption(e.target);
          updateMesTitleFromSelect();
          const rows = filteredRowsNoMes();
          const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))].sort();
          updateKPIsMonthly(rows, months);
        });

        document.getElementById("cumpl_btnDownloadNO")?.addEventListener("click", () => {
          const rowsFilt = filteredRowsByAll();
          const noRows = getNoEntregadosRows(rowsFilt);

          if (!noRows.length) {
            alert("No hay NO ENTREGADOS para el filtro actual.");
            return;
          }

          const cols = headers.slice();

          const cliente = safeFilePart(selLabel("cumpl_clienteSelect"));
          const c2 = "Todos"; // default
          const gc = safeFilePart(selLabel("cumpl_gcocSelect"));
          const centro = safeFilePart(selLabel("centroSelect"));
          const mes = safeFilePart(selLabel("cumpl_mesSelect"));

          const filename = `NO_ENTREGADOS_${cliente}_${c2}_${gc}_${centro}_${mes}.csv`;
          downloadCSV(filename, noRows, cols);
        });

        document.getElementById("cumpl_btnClearFilters")?.addEventListener("click", () => {
          clearAllFilters();
        });

        setHTML("cumpl_msg", "");
      })
      .catch(err => {
        console.error(err);
        showError("Error cargando CSV: " + (err?.message || err));
      })
      .finally(() => {
        const loader = document.getElementById("cumpl_loader");
        if (loader) loader.style.display = "none";
      });
  };

})();
