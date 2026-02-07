;(function () {
  var themeId = localStorage.getItem("opencode-theme-id")
  if (!themeId) {
    console.info("[OC Theme Preload] theme id not found")
    return
  }

  var scheme = localStorage.getItem("opencode-color-scheme") || "system"
  var isDark = scheme === "dark" || (scheme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
  var mode = isDark ? "dark" : "light"

  document.documentElement.dataset.theme = themeId
  document.documentElement.dataset.colorScheme = mode

  console.info(`[OC Theme Preload] themeId=${themeId}, mode=${mode}`)

  if (themeId === "oc-1") return

  var css = localStorage.getItem("opencode-theme-css-" + themeId + "-" + mode)
  if (css) {
    console.info(`[OC Theme Preload] css=${css}`)
    var style = document.createElement("style")
    style.id = "oc-theme-preload"
    style.textContent =
      ":root{color-scheme:" +
      mode +
      ";--text-mix-blend-mode:" +
      (isDark ? "plus-lighter" : "multiply") +
      ";" +
      css +
      "}"
    document.head.appendChild(style)
  } else {
    console.info(`[OC Theme Preload] css not found`)
  }
})()
