/* ============================
   DEMORAS - starter
   (vacío a propósito, listo para nuevos gráficos)
============================ */
const FILE_CANDIDATES = ["DEMORAS.CSV", "DEMORAS.csv", "DEMORAS.CVS", "DEMORAS.cvs"];
const DELIM = ";";

function showError(msg) {
  const el = document.getElementById("msg");
  if (el) el.innerHTML = `<div class="error">${msg}</div>`;
}

function setLastUpdate() {
  const d = new Date();
  const el = document.getElementById("lastUpdate");
  if (el) {
    el.textContent =
      `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  }
}

async function fetchFirstAvailable() {
  for (const name of FILE_CANDIDATES) {
    try {
      const r = await fetch(name);
      if (r.ok) return { name, text: await r.text() };
    } catch (_) {}
  }
  return null;
}

window.addEventListener("DOMContentLoaded", async () => {
  setLastUpdate();

  const res = await fetchFirstAvailable();
  if (!res) {
    showError(
      `No pude abrir el archivo de demoras. Subí el CSV a la raíz del repo con nombre exacto: DEMORAS.CSV (recomendado).`
    );
    return;
  }

  const hint = document.getElementById("fileHint");
  if (hint) hint.textContent = `Fuente: ${res.name} (delimitador “${DELIM}”)`;

  // Por ahora: solo confirmación de carga
  console.log("DEMORAS cargado OK:", res.name);
  console.log(res.text.split("\n").slice(0, 5));
});
