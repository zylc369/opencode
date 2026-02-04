# IDE 检测和集成

## 概述

检测已安装的 IDE 并管理 IDE 扩展安装。

## 支持的 IDE

- **Windsurf** - AI 驱动的 IDE
- **VS Code** - Visual Studio Code
- **Cursor** - AI 代码编辑器
- **VSCodium** - 开源 VS Code

## 检测

IDE 通过环境变量和文件系统检查来检测：

```typescript
import { IDE } from "@/ide"

const detected = await IDE.detect()
// 返回检测到的 IDE 数组
```

## 安装

为检测到的 IDE 安装 OpenCode 扩展：

```typescript
await IDE.install(IDEType.VSCode)
```

## 相关文件

- **src/ide/index.ts**：IDE 检测和安装
