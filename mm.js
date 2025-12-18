(function () {
  const CSV_URL = "./ANALISIS-MM.csv";
  const DELIM = ";";

  const COLORS = {
    text: "#0f172a",
    red: "#ef4444",
    yellow: "#facc15",
    green: "#22c55e",
    green2: "#16a34a",
  };

  let loaded = false;
  let rows = [];
  let headers = [];
  let col = {};
  let donutChart = null;
  let bound = false;

  const clean = (v) => (v ?? "").toString().trim();
  const norm = (s) => clean(s).toUpperCase().replace(/\s+/g, " ");

  function setText(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  function escapeHtml(s) {
    return (s ?? "")
      .toString()
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
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
        if (inQuotes && text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        row.push(cur); cur = "";
      } else if (ch === "\n" && !inQuotes) {
        row.push(cur); out.push(row);
        row = []; cur = "";
      } else {
        cur += ch;
      }
    }
    if (cur.length || row.length) { row.push(cur); out.push(row); }
    return out.filter(r => r.some(c => clean(c) !== ""));
  }

  function findCol(candidates) {
    const map = new Map();
    headers.forEach((h, idx) => map.set(norm(h), idx));
    for (const c of candidates) {
      const key = norm(c);
      if (map.has(key)) return map.get(key);
    }
    return -1;
  }

  function getValue(r, idx) {
    return idx >= 0 ? (r[idx] ?? "") : "";
  }

  function toNumber(x) {
    const t = clean(x);
    if (!t) return NaN;
    const s = t.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function estadoColor(estado) {
    const e = norm(estado);
    if (e.includes("STOCK NULO")) return COLORS.red;
    if (e.includes("MENOR")) return COLORS.yellow;
    if (e.includes("MAYOR AL PP")) return COLORS.green;
    return COLORS.green2;
  }

  function buildAlmacenOptions() {
    const sel = document.getElementById("mmClienteSelect");
    if (!sel) return;

    const idx = col.ALMACEN;
    const set = new Set();
    for (const r of rows) {
      const a = clean(getValue(r, idx));
      if (a) set.add(a);
    }
    const list = Array.from(set).sort((a, b) => a.localeCompare(b));
    sel.innerHTML = `<option value="">Todos</option>` + list.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join("");
  }

  function filteredRows() {
    const sel = document.getElementById("mmClienteSelect");
    const chosen = sel ? clean(sel.value) : "";
    if (!chosen) return rows;

    const idx = col.ALMACEN;
    return rows.filter(r => clean(getValue(r, idx)) === chosen);
  }

  function distinctSet(rowsIn, idxKey, predicate) {
    const set = new Set();
    for (const r of rowsIn) {
      if (predicate && !predicate(r)) continue;
      const k = clean(getValue(r, idxKey));
      if (k) set.add(k);
    }
    return set;
  }

  function calcKPIs(rowsIn) {
    const totalSet = distinctSet(rowsIn, col.MATERIAL);
    const total = totalSet.size;

    const dispSet = distinctSet(
      rowsIn,
      col.MATERIAL,
      (r) => {
        const v = toNumber(getValue(r, col.LIBRE));
        return Number.isFinite(v) && v > 0;
      }
    );
    const disponible = dispSet.size;

    const pct = total > 0 ? (disponible / total) * 100 : 0;
    return { total, disponible, pct };
  }

  function renderTablaEstados(rowsIn, totalMaterials) {
    // estado -> Set(material)
    const map = new Map();
    for (const r of rowsIn) {
      const estado = clean(getValue(r, col.ESTADO)) || "(Vacío)";
      const mat = clean(getValue(r, col.MATERIAL));
      if (!mat) continue;

      if (!map.has(estado)) map.set(estado, new Set());
      map.get(estado).add(mat);
    }

    const agg = Array.from(map.entries())
      .map(([estado, set]) => ({ estado, cant: set.size }))
      .sort((a, b) => b.cant - a.cant);

    const tbody = agg.map(x => {
      const pct = totalMaterials > 0 ? (x.cant / totalMaterials) * 100 : 0;
      return `
        <tr>
          <td>${escapeHtml(x.estado)}</td>
          <td class="num">${x.cant.toLocaleString("es-AR")}</td>
          <td class="num">${pct.toFixed(2).replace(".", ",")}%</td>
        </tr>
      `;
    }).join("");

    const html = `
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
    `;

    const cont = document.getElementById("mmTablaEstados");
    if (cont) cont.innerHTML = html;

    return agg;
  }

  function renderDonut(estadoAgg) {
    const canvas = document.getElementById("mmDonut");
    if (!canvas || !window.Chart) return;

    const labels = estadoAgg.map(x => x.estado);
    const data = estadoAgg.map(x => x.cant);
    const bg = estadoAgg.map(x => estadoColor(x.estado));

    if (donutChart) { donutChart.destroy(); donutChart = null; }

    donutChart = new Chart(canvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels,
        datasets: [{ data, backgroundColor: bg, borderWidth: 0, hoverOffset: 10 }]
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
    const fr = filteredRows();
    const kpi = calcKPIs(fr);

    setText("mmKpiTotal", kpi.total.toLocaleString("es-AR"));
    setText("mmKpiDisp", kpi.disponible.toLocaleString("es-AR"));
    setText("mmKpiPct", `${kpi.pct.toFixed(0)} %`);

    const estadoAgg = renderTablaEstados(fr, kpi.total);
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

    col.ALMACEN = findCol(["ALMACEN", "ALMACÉN"]);
    col.MATERIAL = findCol(["MATERIAL", "Material"]);
    col.LIBRE = findCol([
      "LIBRE UTILIZACION",
      "LIBRE UTILIZACIÓN",
      "LIBRE UTILIZACION (LOGIN)",
      "LIBRE UTILIZACIÓN (LOGIN)"
    ]);
    col.ESTADO = findCol(["ESTADO", "ESTADOS", "Estado"]);

    if (col.ALMACEN < 0) throw new Error("No encuentro la columna ALMACEN en ANALISIS-MM.csv");
    if (col.MATERIAL < 0) throw new Error("No encuentro la columna Material en ANALISIS-MM.csv");
    if (col.LIBRE < 0) throw new Error("No encuentro la columna Libre utilizacion en ANALISIS-MM.csv");
    if (col.ESTADO < 0) throw new Error("No encuentro la columna estado en ANALISIS-MM.csv");

    buildAlmacenOptions();
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

  window.MM = {
    ensureLoaded: async function () {
      if (!bound) { bind(); bound = true; }
      if (loaded) return;
      try { await load(); } catch (e) { setText("mmStatus", "Error: " + (e.message || e)); }
    }
  };
})();


