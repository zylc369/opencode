# oc-theme-preload.js 分析

## 概述

`oc-theme-preload.js` 是一个预加载脚本，它在主应用程序加载**之前**运行。其目的是通过在页面开始加载时立即应用用户的主题设置来防止"未样式化内容的闪烁"（FOUC）。

## 为什么需要预加载

如果没有这个脚本，页面会：
1. 以默认（浅色）主题加载
2. 执行 JavaScript
3. 读取用户的主题偏好
4. 切换到深色主题

这会导致明显的闪烁，页面在切换到深色模式之前短暂显示为浅色模式。

预加载脚本在 HTML 解析期间**同步**运行，允许它在渲染任何内容之前应用样式。

---

## 代码分析

### 1. IIFE 包装器

```javascript
;(function () {
  // ... 代码
})()
```

- **目的**：创建立即调用的函数表达式
- **前导分号**：防止与其他脚本连接时出现问题
- **无异步操作**：所有操作同步运行以立即生效

---

### 2. 从存储中读取主题 ID

```javascript
var themeId = localStorage.getItem("opencode-theme-id")
if (!themeId) return
```

| 步骤 | 描述 |
|------|-------------|
| 读取 `opencode-theme-id` | 用户选择的主题标识符 |
| 如果未设置则提前返回 | 未设置主题，使用默认样式 |

---

### 3. 确定颜色方案（深色/浅色）

```javascript
var scheme = localStorage.getItem("opencode-color-scheme") || "system"
var isDark = scheme === "dark" || (scheme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
var mode = isDark ? "dark" : "light"
```

| 方案值 | 结果 |
|--------------|--------|
| `"dark"` | `mode = "dark"` |
| `"light"` | `mode = "light"` |
| `"system"` | 跟随系统偏好 |
| (未设置) | 默认为 `"system"` → 跟随系统偏好 |

---

### 4. 应用数据属性

```javascript
document.documentElement.dataset.theme = themeId
document.documentElement.dataset.colorScheme = mode
```

设置 HTML 属性：
```html
<html data-theme="oc-2" data-color-scheme="dark">
```

这些属性被 CSS 用于特定主题的样式设置。

---

### 5. 跳过内置主题 "oc-1"

```javascript
if (themeId === "oc-1") return
```

- **"oc-1"** 是默认的内置主题
- 不需要自定义 CSS — 样式已在主样式表中
- 提前返回优化性能

---

### 6. 注入自定义主题 CSS

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

### 生成的 CSS 结构

```css
:root {
  color-scheme: dark;          /* 或 "light" */
  --text-mix-blend-mode: plus-lighter;  /* 或 "multiply" */
  /* 来自 localStorage 的自定义主题 CSS 变量 */
}
```

| 变量 | 浅色模式 | 深色模式 |
|----------|------------|-----------|
| `color-scheme` | `light` | `dark` |
| `--text-mix-blend-mode` | `multiply` | `plus-lighter` |

---

## 数据流图

```
localStorage                          DOM
───────────────────────────────────────────────────────────
opencode-theme-id      ────────>  <html data-theme="...">
opencode-color-scheme  ────────>  <html data-color-scheme="...">
opencode-theme-css-...  ────────>  <style id="oc-theme-preload">
                                            :root {
                                              color-scheme: ...;
                                              --text-mix-blend-mode: ...;
                                              /* 自定义 CSS */
                                            }
                                          </style>
```

---

## 时序对比

### 没有预加载脚本

```
1. HTML 解析 → <html>
2. 内容渲染（默认浅色主题）
3. <script> 加载 → main.js
4. JS 执行 → 读取 localStorage
5. DOM 更新 → <html data-color-scheme="dark">
6. CSS 重新计算 → 深色主题应用

结果: 浅色主题闪烁（100-500ms）
```

### 有预加载脚本

```
1. HTML 解析 → <script src="oc-theme-preload.js">
2. 脚本同步执行
3. <html data-theme="..." data-color-scheme="dark">  ← 在内容渲染之前
4. <style> 注入主题 CSS  ← 在内容渲染之前
5. 内容渲染（立即显示正确的深色主题）

结果: 无闪烁，从第一帧开始就是正确的主题
```

---

## 使用的存储键

| 键 | 示例值 | 用途 |
|-----|---------------|---------|
| `opencode-theme-id` | `"oc-2"` | 选定的主题标识符 |
| `opencode-color-scheme` | `"dark"` / `"light"` / `"system"` | 颜色方案偏好 |
| `opencode-theme-css-{themeId}-{mode}` | CSS 变量声明 | 深色/浅色模式的自定义主题 CSS |

---

## 浏览器兼容性

| 特性 | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| `localStorage` | ✅ | ✅ | ✅ | ✅ |
| `dataset` | ✅ | ✅ | ✅ | ✅ |
| `matchMedia` | ✅ | ✅ | ✅ | ✅ |
| `prefers-color-scheme` | ✅ 76+ | ✅ 67+ | ✅ 12.1+ | ✅ 79+ |

---

## 关键设计决策

### 1. 同步执行
- 无 `async`/`await`
- 无外部依赖
- 在 HTML 解析期间立即运行

### 2. 渐进增强
- 如果未设置主题则提前返回
- 即使 localStorage 不可用也不会中断
- 优雅地处理缺失的 CSS

### 3. 性能优化
- 最小化 DOM 操作（单个样式标签）
- 无布局抖动
- 内联 CSS 避免额外的网络请求

### 4. 混合模式策略
```javascript
--text-mix-blend-mode: isDark ? "plus-lighter" : "multiply"
```
- **浅色模式**：`multiply` 使浅色背景上的文字变暗
- **深色模式**：`plus-lighter` 使深色背景上的文字变亮

---

## 相关文件

| 文件 | 用途 |
|------|---------|
| `public/oc-theme-preload.js` | 此预加载脚本 |
| `src/context/theme.tsx` | 主题提供者上下文 |
| `src/i18n/en.ts` | 主题名称翻译 |

---

## 总结

`oc-theme-preload.js` 是一个关键的性能优化，确保用户的主题偏好立即应用，防止视觉闪烁并提高感知性能。它在 HTML 解析期间同步运行，在渲染任何内容之前注入主题 CSS。
