// Editá SOLO este archivo para cambiar la fecha mostrada en el header.
window.LAST_UPDATE = "13/07/2026";

let cb = sessionStorage.getItem('mi_cache_buster');
if (!cb) {
  cb = new Date().getTime();
  sessionStorage.setItem('mi_cache_buster', cb);
}
window.CACHE_BUSTER = cb;

window.forceRefreshData = function() {
  sessionStorage.removeItem('mi_cache_buster');

  if (typeof window.clearDataCache === 'function') {
    window.clearDataCache().finally(() => window.location.reload());
  } else {
    window.location.reload();
  }
};
