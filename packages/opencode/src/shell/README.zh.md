# Shell 模块

## 概述

Shell 检测和执行工具。

## API

```typescript
import { Shell } from "@/shell"

// 检测 shell
const shell = Shell.detect()
// 返回 "bash"、"zsh"、"fish" 等

// 执行命令
const result = await Shell.exec(command, args)
```

## 相关文件

- **src/shell/shell.ts**：Shell 工具
