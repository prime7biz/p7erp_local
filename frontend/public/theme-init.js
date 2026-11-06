// Runs before React (loaded from index.html) so the page never flashes the wrong theme.
// Must stay a tiny plain-JS file: it is not bundled by Vite.
(function () {
  try {
    var stored = localStorage.getItem("p7_theme");
    var dark =
      stored === "dark" ||
      (stored !== "light" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  } catch {
    // Storage blocked (private mode): keep the default light theme.
  }
})();
