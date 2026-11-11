const themeToggle = document.getElementById("theme-toggle");
const themeStorageKey = "nyc-taxi-theme";

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
}

try {
  if (localStorage.getItem(themeStorageKey) === "light") setTheme("light");
} catch {
  // Storage is optional when the browser blocks it.
}

themeToggle.addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  setTheme(theme);
  try {
    localStorage.setItem(themeStorageKey, theme);
  } catch {
    // Theme changes still apply to the current page.
  }
});
