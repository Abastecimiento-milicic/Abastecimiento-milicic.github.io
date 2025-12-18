// mm.js — lee ANALISIS-MM.csv y muestra preview (primera fila + 30 filas)
(function () {
  const CSV_URL = "./ANALISIS-MM.csv";
  const DELIM = ";";

  let loaded = false;
  let cacheRows = [];

  const clean = (v) => (v ?? "").toString().trim();

  function parseDelimited(text, delimiter = ";") {
    const rows = [];
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
        row.push(cur); rows.push(row);
        row = []; cur = "";
      } else {
        cur += ch;
      }
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }

    return rows.filter(r => r.some(c => clean(c) !== ""));
  }

  function setText(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  function renderFirstRow(headers, first) {
    const tbl = document.getElementById("mmFirstRow");
    if (!tbl) return;

    tbl.innerHTML = `
      <thead>
        <tr><th>Columna</th><th>Valor</th></tr>
      </thead>
      <tbody>
        ${headers.map((h, i) => `
          <tr>
            <td class="k">${escapeHtml(h)}</td>
            <td>${escapeHtml(first[i] ?? "")}</td>
          </tr>
        `).join("")}
      </tbody>
    `;
  }

  function renderTable(headers, rows) {
    const tbl = document.getElementById("mmTable");
    if (!tbl) return;

    const head = `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
    const body = `
      <tbody>
        ${rows.map(r => `<tr>${headers.map((_, i) => `<td>${escapeHtml(r[i] ?? "")}</td>`).join("")}</tr>`).join("")}
      </tbody>
    `;
    tbl.innerHTML = head + body;
  }

  function escapeHtml(s) {
    return (s ?? "").toString()
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  async function load() {
    setText("mmStatus", `Cargando: ${CSV_URL} ...`);
    const resp = await fetch(CSV_URL, { cache: "no-store" });
    if (!resp.ok) throw new Error(`No pude abrir ${CSV_URL} (HTTP ${resp.status})`);

    const text = await resp.text();
    const matrix = parseDelimited(text, DELIM);
    if (matrix.length < 2) throw new Error("El CSV está vacío o no tiene filas.");

    const headers = matrix[0].map(clean);
    const rows = matrix.slice(1).map(r => r.map(clean));

    cacheRows = rows;
    loaded = true;

    renderFirstRow(headers, rows[0]);
    renderTable(headers, rows.slice(0, 30));

    setText("mmStatus", `OK: ${rows.length.toLocaleString("es-AR")} filas cargadas`);
  }

  function bind() {
    const btn = document.getElementById("mmReload");
    if (btn) btn.addEventListener("click", async () => {
      loaded = false;
      try { await load(); } catch (e) { setText("mmStatus", "Error: " + (e.message || e)); }
    });
  }

  // API pública para router.js
  window.MM = {
    ensureLoaded: async function () {
      if (!document.getElementById("mmReload")) bind();
      if (loaded) return;
      try { await load(); } catch (e) { setText("mmStatus", "Error: " + (e.message || e)); }
    },
    getRows: () => cacheRows
  };
})();
