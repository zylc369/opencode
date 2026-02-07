# oc-theme-preload.js Analysis

## Overview

`oc-theme-preload.js` is a preload script that runs **before** the main application loads. Its purpose is to prevent "flash of unstyled content" (FOUC) by applying the user's theme settings immediately when the page starts loading.

## Why Preload is Necessary

Without this script, the page would:
1. Load with default (light) theme
2. Execute JavaScript
3. Read user's theme preference
4. Switch to dark theme

This causes a visible flash where the page briefly appears in light mode before switching to dark mode.

The preload script runs **synchronously** during HTML parsing, allowing it to apply styles before any content is rendered.

---

## Code Analysis

### 1. IIFE Wrapper

```javascript
;(function () {
  // ... code
})()
```

- **Purpose**: Creates an immediately-invoked function expression
- **Leading semicolon**: Prevents issues when concatenated with other scripts
- **No async operations**: Everything runs synchronously for immediate effect

---

### 2. Read Theme ID from Storage

```javascript
var themeId = localStorage.getItem("opencode-theme-id")
if (!themeId) return
```

| Step | Description |
|------|-------------|
| Read `opencode-theme-id` | User's selected theme identifier |
| Early return if missing | No theme set, use default styles |

---

### 3. Determine Color Scheme (Dark/Light)

```javascript
var scheme = localStorage.getItem("opencode-color-scheme") || "system"
var isDark = scheme === "dark" || (scheme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
var mode = isDark ? "dark" : "light"
```

| Scheme Value | Result |
|--------------|--------|
| `"dark"` | `mode = "dark"` |
| `"light"` | `mode = "light"` |
| `"system"` | Follows OS preference |
| (not set) | Defaults to `"system"` → follows OS preference |

---

### 4. Apply Data Attributes

```javascript
document.documentElement.dataset.theme = themeId
document.documentElement.dataset.colorScheme = mode
```

Sets HTML attributes:
```html
<html data-theme="oc-2" data-color-scheme="dark">
```

These attributes are used by CSS for theme-specific styling.

---

### 5. Skip Built-in Theme "oc-1"

```javascript
if (themeId === "oc-1") return
```

- **"oc-1"** is the default built-in theme
- No custom CSS needed — styles are already in the main stylesheet
- Early return optimizes performance

---

### 6. Inject Custom Theme CSS

```javascript
var css = localStorage.getItem("opencode-theme-css-" + themeId + "-" + mode)
if (css) {
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
}
```

### Generated CSS Structure

```css
:root {
  color-scheme: dark;          /* or "light" */
  --text-mix-blend-mode: plus-lighter;  /* or "multiply" */
  /* custom theme CSS variables from localStorage */
}
```

| Variable | Light Mode | Dark Mode |
|----------|------------|-----------|
| `color-scheme` | `light` | `dark` |
| `--text-mix-blend-mode` | `multiply` | `plus-lighter` |

---

## Data Flow Diagram

```
localStorage                          DOM
───────────────────────────────────────────────────────────
opencode-theme-id      ────────>  <html data-theme="...">
opencode-color-scheme  ────────>  <html data-color-scheme="...">
opencode-theme-css-...  ────────>  <style id="oc-theme-preload">
                                            :root {
                                              color-scheme: ...;
                                              --text-mix-blend-mode: ...;
                                              /* custom CSS */
                                            }
                                          </style>
```

---

## Timing Comparison

### Without Preload Script

```
1. HTML parses → <html>
2. Content renders (default light theme)
3. <script> loads → main.js
4. JS executes → reads localStorage
5. DOM updates → <html data-color-scheme="dark">
6. CSS recalculates → dark theme applied

Result: Flash of light theme (100-500ms)
```

### With Preload Script

```
1. HTML parses → <script src="oc-theme-preload.js">
2. Script executes synchronously
3. <html data-theme="..." data-color-scheme="dark">  ← Before content renders
4. <style> injected with theme CSS  ← Before content renders
5. Content renders (correct dark theme immediately)

Result: No flash, correct theme from first frame
```

---

## Storage Keys Used

| Key | Example Value | Purpose |
|-----|---------------|---------|
| `opencode-theme-id` | `"oc-2"` | Selected theme identifier |
| `opencode-color-scheme` | `"dark"` / `"light"` / `"system"` | Color scheme preference |
| `opencode-theme-css-{themeId}-{mode}` | CSS variable declarations | Custom theme CSS for dark/light mode |

---

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| `localStorage` | ✅ | ✅ | ✅ | ✅ |
| `dataset` | ✅ | ✅ | ✅ | ✅ |
| `matchMedia` | ✅ | ✅ | ✅ | ✅ |
| `prefers-color-scheme` | ✅ 76+ | ✅ 67+ | ✅ 12.1+ | ✅ 79+ |

---

## Key Design Decisions

### 1. Synchronous Execution
- No `async`/`await`
- No external dependencies
- Runs immediately during HTML parsing

### 2. Progressive Enhancement
- Early returns if no theme set
- Doesn't break if localStorage is unavailable
- Gracefully handles missing CSS

### 3. Performance
- Minimal DOM manipulation (single style tag)
- No layout thrashing
- Inline CSS avoids additional network requests

### 4. Blend Mode Strategy
```javascript
--text-mix-blend-mode: isDark ? "plus-lighter" : "multiply"
```
- **Light mode**: `multiply` darkens text on light backgrounds
- **Dark mode**: `plus-lighter` lightens text on dark backgrounds

---

## Related Files

| File | Purpose |
|------|---------|
| `public/oc-theme-preload.js` | This preload script |
| `src/context/theme.tsx` | Theme provider context |
| `src/i18n/en.ts` | Theme name translations |

---

## Summary

`oc-theme-preload.js` is a critical performance optimization that ensures the user's theme preference is applied immediately, preventing visual flashes and improving perceived performance. It runs synchronously during HTML parsing, injecting theme CSS before any content is rendered.
