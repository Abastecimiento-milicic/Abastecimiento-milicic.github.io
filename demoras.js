document.addEventListener("DOMContentLoaded", () => {
  aplicarHeatmap();

  // Por si la tabla se carga después (fetch/dinámico)
  const observer = new MutationObserver(() => {
    aplicarHeatmap();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
});

function aplicarHeatmap() {
  const cells = document.querySelectorAll("td.td-num");
  if (!cells.length) return;

  const values = [];

  cells.forEach(td => {
    const v = parseFloat(td.textContent.replace(",", "."));
    if (!isNaN(v)) values.push(v);
  });

  if (!values.length) return;

  const min = Math.min(...values);
  const max = Math.max(...values);

  cells.forEach(td => {
    const v = parseFloat(td.textContent.replace(",", "."));
    if (!isNaN(v)) {
      const color = heatColor(v, min, max);
      td.style.backgroundColor = color;
      td.style.color = v > max * 0.6 ? "#fff" : "#000";
      td.style.fontWeight = "600";
    }
  });
}

// 🎨 Escala blanco -> naranja -> rojo
function heatColor(value, min, max) {
  if (max === min) return "#ffffff";

  const ratio = (value - min) / (max - min);

  if (ratio <= 0.5) {
    const t = ratio / 0.5;
    return interpolateColor([255, 255, 255], [255, 165, 0], t); // blanco a naranja
  } else {
    const t = (ratio - 0.5) / 0.5;
    return interpolateColor([255, 165, 0], [220, 53, 69], t); // naranja a rojo
  }
}

function interpolateColor(c1, c2, t) {
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}
