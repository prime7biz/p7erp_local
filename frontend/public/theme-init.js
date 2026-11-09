// Runs before React (loaded from index.html). The app is light-only: dark styles are not
// complete across pages and prints, so ignore the OS setting and any old saved choice.
// Must stay a tiny plain-JS file: it is not bundled by Vite.
(function () {
  document.documentElement.classList.remove("dark");
  try {
    localStorage.removeItem("p7_theme");
  } catch {
    // Storage blocked (private mode): nothing to clear.
  }
})();
