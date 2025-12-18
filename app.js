const PATH_MM = "data/ANALISIS-MM.csv";
const PATH_CUMP = "data/CUMPLIMIENTO.csv";

const $ = id => document.getElementById(id);
let mmChart;

/* ===== CSV parser inteligente ===== */
function parseCSV(text) {
  text = text.replace(/\r\n/g, "\n");
  const first = text.split("\n")[0];
  const delim = (first.split(";").length > first.split(",").length) ? ";" : ",";

  const rows = text.split("\n").map(r => r.split(delim));
  const headers = rows.shift().map(h => h.trim());

  return rows
    .filter(r => r.length === headers.length)
    .map(r => {
      const o = {};
      headers.forEach((h,i) => o[h] = r[i].trim());
      return o;
    });
}

async function loadCSV(path) {
  const res = await fetch(path + "?v=" + Date.now());
  if (!res.ok) throw new Error("No se pudo cargar " + path);
  return parseCSV(await res.text());
}

/* ===== Tabs ===== */
document.querySelectorAll(".tab").forEach(b => {
  b.onclick = () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    b.classList.add("active");

    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    $(b.dataset.view).classList.remove("hidden");
  };
});

/* ===== ANALISIS MM ===== */
async function loadMM() {
  const data = await loadCSV(PATH_MM);

  const clientes = [...new Set(data.map(r => r.ALMACEN))];
  $("mmCliente").innerHTML = `<option value="ALL">Todos</option>` +
    clientes.map(c => `<option>${c}</option>`).join("");

  $("mmCliente").onchange = () => renderMM(data);

  renderMM(data);
}

function renderMM(data) {
  const cli = $("mmCliente").value;
  const f = cli === "ALL" ? data : data.filter(r => r.ALMACEN === cli);

  const mats = [...new Set(f.map(r => r.Material))];
  const disp = [...new Set(f.filter(r => Number(r["Libre utilizacion"].replace(",", ".")) !== 0)
                         .map(r => r.Material))];

  $("kpiMat").textContent = mats.length;
  $("kpiDisp").textContent = disp.length;
  $("kpiPct").textContent = mats.length ? Math.round(disp.length / mats.length * 100) + "%" : "0%";

  const byEstado = {};
  f.forEach(r => byEstado[r.estado] = (byEstado[r.estado] || 0) + 1);

  $("mmTable").querySelector("thead").innerHTML =
    "<tr><th>Estado</th><th>Registros</th></tr>";
  $("mmTable").querySelector("tbody").innerHTML =
    Object.entries(byEstado).map(e =>
      `<tr><td>${e[0]}</td><td>${e[1]}</td></tr>`).join("");

  if (mmChart) mmChart.destroy();
  mmChart = new Chart($("mmChart"), {
    type: "doughnut",
    data: { labels: Object.keys(byEstado), datasets: [{ data: Object.values(byEstado) }] }
  });
}

/* ===== CUMPLIMIENTO ===== */
async function loadCumplimiento() {
  const data = await loadCSV(PATH_CUMP);
  const headers = Object.keys(data[0]);

  $("cumpTable").querySelector("thead").innerHTML =
    "<tr>" + headers.map(h => `<th>${h}</th>`).join("") + "</tr>";

  $("cumpTable").querySelector("tbody").innerHTML =
    data.slice(0, 30).map(r =>
      "<tr>" + headers.map(h => `<td>${r[h]}</td>`).join("") + "</tr>"
    ).join("");
}

/* ===== Init ===== */
(async () => {
  try {
    await loadMM();
    await loadCumplimiento();
    $("lastUpdate").textContent = new Date().toLocaleDateString("es-AR");
  } catch (e) {
    $("globalStatus").textContent = "ERROR";
    alert(e.message);
  }
})();


