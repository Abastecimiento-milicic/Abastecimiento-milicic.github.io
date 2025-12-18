(function () {
  const tabs = Array.from(document.querySelectorAll(".tabs .tab"));
  const views = {
    cumplimiento: document.getElementById("view-cumplimiento"),
    mm: document.getElementById("view-mm"),
    demoras: document.getElementById("view-demoras"),
  };

  function setActive(viewKey) {
    tabs.forEach(t => t.classList.toggle("active", t.dataset.view === viewKey));
    Object.entries(views).forEach(([k, el]) => {
      if (!el) return;
      el.classList.toggle("hidden", k !== viewKey);
    });

    if (viewKey === "mm" && window.MM && typeof window.MM.ensureLoaded === "function") {
      window.MM.ensureLoaded();
    }
  }

  tabs.forEach(btn => btn.addEventListener("click", () => setActive(btn.dataset.view)));

  // default
  setActive("cumplimiento");
})();
