// Obtiene la fecha actual formateada explícitamente para Argentina (dd/mm/aaaa)
const opciones = { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric' };
window.LAST_UPDATE = new Date().toLocaleDateString('es-AR', opciones);

// Genera un número único nuevo en cada recarga para romper la caché
window.CACHE_BUSTER = new Date().getTime();

window.forceRefreshData = function() {
  if (typeof window.clearDataCache === 'function') {
    window.clearDataCache().finally(() => window.location.reload());
  } else {
    window.location.reload();
  }
};
