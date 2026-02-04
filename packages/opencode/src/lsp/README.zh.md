# Language Server Protocol (LSP) 集成

## 概述

提供 LSP 客户端管理和捆绑的 LSP 服务器配置，用于代码智能功能。

## 架构

### 组件

- **index.ts** - LSP 客户端管理
- **server.ts** - 捆绑的 LSP 服务器配置（~63KB）
- **client.ts** - LSP 客户端包装器
- **language.ts** - 语言到 LSP 的映射

## 支持的语言

系统包含许多语言服务器的配置：

| 语言 | 服务器 ID | 命令 |
|----------|-----------|---------|
| TypeScript | `typescript-language-server` | `typescript-language-server` |
| Python | `pylsp` | `pylsp` |
| Rust | `rust-analyzer` | `rust-analyzer` |
| Go | `gopls` | `gopls` |
| C/C++ | `clangd` | `clangd` |
| Java | `jdtls` | `jdtls` |
| 以及更多... | | |

## API

### 语言检测

```typescript
import { LSP } from "@/lsp"

const servers = LSP.language("file.ts")
// 返回匹配的 LSP 服务器数组
```

### 客户端管理

```typescript
import { LSPClient } from "@/lsp/client"

const client = new LSPClient(command, args, options)
await client.start()
const result = await client.request("textDocument/codeCompletion", params)
await client.stop()
```

### 服务器配置

```typescript
import { LSPServer } from "@/lsp/server"

const config = LSPServer["typescript-language-server"]
// 返回 { id, command, args, ... }
```

## 配置

LSP 服务器可以在 `opencode.json` 中配置：

```json
{
  "lsp": {
    "typescript-language-server": {
      "command": ["typescript-language-server", "--stdio"],
      "extensions": [".ts", ".tsx"],
      "disabled": false
    },
    "custom-server": {
      "command": ["my-lsp", "--stdio"],
      "extensions": [".custom"]
    }
  }
}
```

## 功能

- 基于文件扩展名的自动检测
- 并发请求处理
- 进程生命周期管理
- 初始化选项支持
- 环境变量支持

## 捆绑的服务器

`server.ts` 文件包含 50+ 语言服务器的预配置设置，包括：
- TypeScript/JavaScript
- Python
- Rust
- Go
- Java
- C/C++
- Ruby
- PHP
- 以及更多

## 相关文件

- **src/lsp/index.ts**：客户端管理
- **src/lsp/server.ts**：服务器配置
- **src/lsp/client.ts**：客户端包装器
- **src/lsp/language.ts**：语言映射
- **src/config/config.ts**：LSP 配置加载
