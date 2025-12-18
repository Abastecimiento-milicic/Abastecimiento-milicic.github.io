// mm.js — ANÁLISIS MM (DISPONIBILIDAD) desde ANALISIS-MM.csv
(function () {
  const CSV_URL = "./ANALISIS-MM.csv";
  const DELIM = ";";

  // Colores (tipo Power BI de tu imagen)
  const COLORS = {
    bg: "#0b0f12",
    bar: "#1e40af", // azul encabezados
    red: "#ef4444",
    yellow: "#facc15",
    green: "#22c55e",
    green2: "#16a34a",
    text: "#0f172a",
    muted: "#64748b",
  };

  let loaded = false;
  let rows = [];
  let headers = [];
  let col = {};
  let donutChart = null;

  const clean = (v) => (v ?? "").toString().trim();

  function norm(s) {
    return clean(s).toUpperCase().replace(/\s+/g, " ");
  }

  function findCol(headerList, candidates) {
    const map = new Map();
    headerList.forEach((h, idx) => map.set(norm(h), idx));
    for (const c of candidates) {
      const key = norm(c);
      if (map.has(key)) return map.get(key);
    }
    return -1;
  }

  function toNumber(x) {
    const t = clean(x);
    if (!t) return NaN;
    // soporta "1.234,56" o "1234,56" o "1234.56"
    const s = t.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
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
    if (cur.length || row.length) {
      row.push(cur);
      out.push(row);
    }
    return out.filter((r) => r.some((c) => clean(c) !== ""));
  }

  function setText(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  }
  function setHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function escapeHtml(s) {
    return (s ?? "")
      .toString()
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function getValue(r, idx) {
    if (idx < 0) return "";
    return r[idx] ?? "";
  }

  function distinctCountBy(rowsIn, idxKey) {
    const set = new Set();
    for (const r of rowsIn) {
      const k = clean(getValue(r, idxKey));
      if (k) set.add(k);
    }
    return set.size;
  }

  function distinctSetBy(rowsIn, idxKey, predicate) {
    const set = new Set();
    for (const r of rowsIn) {
      if (predicate && !predicate(r)) continue;
      const k = clean(getValue(r, idxKey));
      if (k) set.add(k);
    }
    return set;
  }

  function groupDistinctMaterialByEstado(rowsIn, idxEstado, idxMaterial) {
    // estado -> Set(material)
    const map = new Map();
    for (const r of rowsIn) {
      const estado = clean(getValue(r, idxEstado)) || "(Vacío)";
      const mat = clean(getValue(r, idxMaterial));
      if (!mat) continue;

      if (!map.has(estado)) map.set(estado, new Set());
      map.get(estado).add(mat);
    }
    return map;
  }

  function buildClienteOptions() {
    const sel = document.getElementById("mmClienteSelect");
    if (!sel) return;

    const idxAlm = col.ALMACEN;
    const set = new Set();
    for (const r of rows) {
      const a = clean(getValue(r, idxAlm));
      if (a) set.add(a);
    }
    const list = Array.from(set).sort((a, b) => a.localeCompare(b));

    sel.innerHTML = `<option value="">Todos</option>` + list.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join("");
  }

  function getFilteredRows() {
    const sel = document.getElementById("mmClienteSelect");
    const cliente = sel ? clean(sel.value) : "";
    if (!cliente) return rows;

    const idxAlm = col.ALMACEN;
    return rows.filter(r => clean(getValue(r, idxAlm)) === cliente);
  }

  function calcKPIs(rowsIn) {
    const idxMat = col.MATERIAL;
    const idxLibre = col.LIBRE;

    const setAll = distinctSetBy(rowsIn, idxMat);
    const total = setAll.size;

    const setDisp = distinctSetBy(
      rowsIn,
      idxMat,
      (r) => {
        const v = toNumber(getValue(r, idxLibre));
        return Number.isFinite(v) && v > 0;
      }
    );
    const disponible = setDisp.size;

    const pct = total > 0 ? (disponible / total) * 100 : 0;
    return { total, disponible, pct };
  }

  function renderTablaEstados(rowsIn, totalMaterials) {
    const idxEstado = col.ESTADO;
    const idxMat = col.MATERIAL;

    const map = groupDistinctMaterialByEstado(rowsIn, idxEstado, idxMat);

    // Orden por cantidad desc
    const arr = Array.from(map.entries())
      .map(([estado, set]) => ({ estado, cant: set.size }))
      .sort((a, b) => b.cant - a.cant);

    const tbody = arr.map((x) => {
      const pct = totalMaterials > 0 ? (x.cant / totalMaterials) * 100 : 0;
      return `
        <tr>
          <td>${escapeHtml(x.estado)}</td>
          <td class="num">${x.cant.toLocaleString("es-AR")}</td>
          <td class="num">${pct.toFixed(2).replace(".", ",")}%</td>
        </tr>
      `;
    }).join("");

    setHtml("mmTablaEstados", `
      <table class="mm-table">
        <thead>
          <tr>
            <th>ESTADOS</th>
            <th class="num">CANT<br/>MATERIALES</th>
            <th class="num">%TG CANT<br/>MATERIALES</th>
          </tr>
        </thead>
        <tbody>
          ${tbody || `<tr><td colspan="3" class="muted">Sin datos</td></tr>`}
        </tbody>
        <tfoot>
          <tr>
            <td><b>Total</b></td>
            <td class="num"><b>${(totalMaterials || 0).toLocaleString("es-AR")}</b></td>
            <td class="num"><b>100,00%</b></td>
          </tr>
        </tfoot>
      </table>
    `);

    // Para dona: usamos mismos estados
    return arr;
  }

  function estadoColor(estado) {
    // podés ajustar si tus estados reales tienen otros nombres
    const e = norm(estado);
    if (e.includes("STOCK NULO")) return COLORS.red;
    if (e.includes("MENOR")) return COLORS.yellow;
    if (e.includes("MAYOR AL PP")) return COLORS.green;
    return COLORS.green2; // "MAYOR AL STO MAX" u otros
  }

  function renderDonut(estadoAgg) {
    const canvas = document.getElementById("mmDonut");
    if (!canvas || !window.Chart) return;

    const labels = estadoAgg.map(x => x.estado);
    const data = estadoAgg.map(x => x.cant);
    const bg = estadoAgg.map(x => estadoColor(x.estado));

    // destroy anterior
    if (donutChart) {
      donutChart.destroy();
      donutChart = null;
    }

    donutChart = new Chart(canvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: bg,
          borderWidth: 0,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: {
            position: "right",
            labels: {
              color: COLORS.text,
              boxWidth: 12,
              boxHeight: 12,
              font: { size: 12, weight: "700" }
            }
          },
          tooltip: {
            backgroundColor: "rgba(15,23,42,.95)",
            titleColor: "#fff",
            bodyColor: "#fff",
            padding: 10,
            displayColors: true,
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed;
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0) || 0;
                const pct = total > 0 ? (v / total) * 100 : 0;
                return ` ${ctx.label}: ${v.toLocaleString("es-AR")} (${pct.toFixed(2).replace(".", ",")}%)`;
              }
            }
          }
        }
      }
    });
  }

  function render() {
    const filtered = getFilteredRows();
    const kpi = calcKPIs(filtered);

    setText("mmKpiTotal", kpi.total.toLocaleString("es-AR"));
    setText("mmKpiDisp", kpi.disponible.toLocaleString("es-AR"));
    setText("mmKpiPct", `${kpi.pct.toFixed(0)} %`);

    const estadoAgg = renderTablaEstados(filtered, kpi.total);
    renderDonut(estadoAgg);
  }

  async function load() {
    setText("mmStatus", `Cargando: ${CSV_URL} ...`);

    const resp = await fetch(CSV_URL, { cache: "no-store" });
    if (!resp.ok) throw new Error(`No pude abrir ${CSV_URL} (HTTP ${resp.status})`);

    const text = await resp.text();
    const matrix = parseDelimited(text, DELIM);
    if (matrix.length < 2) throw new Error("El CSV está vacío o no tiene filas.");

    headers = matrix[0].map(clean);
    rows = matrix.slice(1).map(r => r.map(clean));

    // Map columnas (robusto a mayúsculas/acentos)
    col.ALMACEN = findCol(headers, ["ALMACEN", "ALMACÉN"]);
    col.MATERIAL = findCol(headers, ["MATERIAL", "Material"]);
    col.LIBRE = findCol(headers, ["LIBRE UTILIZACION", "LIBRE UTILIZACIÓN", "LIBRE UTILIZACION (LOGIN)", "LIBRE UTILIZACIÓN (LOGIN)", "LIBRE UTILIZACION LOGIN"]);
    col.ESTADO = findCol(headers, ["ESTADO", "ESTADOS", "Estado"]);

    if (col.ALMACEN < 0) throw new Error(`No encuentro la columna ALMACEN en ANALISIS-MM.csv`);
    if (col.MATERIAL < 0) throw new Error(`No encuentro la columna Material en ANALISIS-MM.csv`);
    if (col.LIBRE < 0) throw new Error(`No encuentro la columna Libre utilizacion en ANALISIS-MM.csv`);
    if (col.ESTADO < 0) throw new Error(`No encuentro la columna estado en ANALISIS-MM.csv`);

    buildClienteOptions();
    loaded = true;

    setText("mmStatus", `OK: ${rows.length.toLocaleString("es-AR")} filas cargadas`);
    render();
  }

  function bind() {
    const sel = document.getElementById("mmClienteSelect");
    if (sel) sel.addEventListener("change", render);

    const btn = document.getElementById("mmReload");
    if (btn) btn.addEventListener("click", async () => {
      loaded = false;
      try { await load(); } catch (e) { setText("mmStatus", "Error: " + (e.message || e)); }
    });
  }

  // API para router.js
  window.MM = {
    ensureLoaded: async function () {
      if (!document.getElementById("mmReload")) return;
      if (!window.__mmBound) { bind(); window.__mmBound = true; }
      if (loaded) return;
      try { await load(); } catch (e) { setText("mmStatus", "Error: " + (e.message || e)); }
    }
  };
})();

