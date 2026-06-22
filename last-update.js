// Editá SOLO este archivo para cambiar la fecha mostrada en el header.
// Formato sugerido: dd/mm/aaaa
window.LAST_UPDATE = "22/06/2026";

// Genera un número único nuevo en cada recarga, forzando la lectura real
window.CACHE_BUSTER = new Date().getTime();

window.forceRefreshData = function() {
  // Mantenemos la función por compatibilidad con el botón de refresco
  if (typeof window.clearDataCache === 'function') {
    window.clearDataCache().finally(() => window.location.reload());
  } else {
    window.location.reload();
  }
};
