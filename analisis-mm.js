// Página ANÁLISIS MM: por ahora vacía.
// Cuando quieras, acá leemos ANALISIS-MM.csv y armamos los nuevos gráficos.

const d = new Date();
const el = document.getElementById("lastUpdate");
if (el) {
  el.textContent =
    `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

// Si querés probar que el archivo existe (opcional), descomentá esto:
/*
fetch("ANALISIS-MM.csv")
  .then(r => {
    if (!r.ok) throw new Error(`No pude abrir ANALISIS-MM.csv (HTTP ${r.status})`);
    return r.text();
  })
  .then(_ => console.log("ANALISIS-MM.csv OK"))
  .catch(err => {
    const msg = document.getElementById("msg");
    if (msg) msg.innerHTML = `<div class="error">${err.message}</div>`;
  });
*/
