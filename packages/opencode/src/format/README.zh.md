# 格式化模块

## 概述

用于终端和 UI 显示的输出格式化，包括语法高亮、差异渲染和文本格式化。

## 组件

### formatter.ts

核心格式化逻辑：
- 语法高亮
- 差异渲染
- Markdown 渲染
- 代码块格式化

### index.ts

格式化操作的公共 API。

## API

```typescript
import { Format } from "@/format"

// 格式化文本
const formatted = Format.format(text, options)

// 渲染差异
const diff = Format.diff(original, modified)
```

## 相关文件

- **src/format/formatter.ts**：核心格式化实现
- **src/format/index.ts**：公共 API
