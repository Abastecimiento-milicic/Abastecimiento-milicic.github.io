// Editá SOLO este archivo para cambiar la fecha mostrada en el header.
window.LAST_UPDATE = "03/09/2026";
// Cambia este valor para fijar el mes por defecto en los filtros (ej. "2026-08")
window.MES_POR_DEFECTO = "2026-08";

let cb = sessionStorage.getItem('mi_cache_buster');
if (!cb) {
  cb = new Date().getTime();
  sessionStorage.setItem('mi_cache_buster', cb);
}
window.CACHE_BUSTER = cb + "_v11_periodo_corto";

window.forceRefreshData = function() {
  sessionStorage.removeItem('mi_cache_buster');

  if (typeof window.clearDataCache === 'function') {
    window.clearDataCache().finally(() => window.location.reload());
  } else {
    window.location.reload();
  }
};



