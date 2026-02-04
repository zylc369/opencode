# CLI 系统

## 概述

CLI（命令行界面）系统为 OpenCode 提供主要的用户交互层。它基于 Yargs 构建，包含 18 个命令，用于各种操作，包括运行 AI 助手、管理身份验证以及控制 HTTP/TUI 服务器。

## 架构

### 目录结构

```
cli/
├── bootstrap.ts    # 实例初始化包装器
├── cmd.ts          # 命令类型助手
├── cmd/            # 单个命令实现
│   ├── tui/        # 终端 UI 应用
│   └── debug/      # 调试/开发命令
├── error.ts        # 错误格式化
├── logo.ts         # ASCII 艺术 logo
├── network.ts      # 网络配置选项
├── ui.ts           # 终端 UI 工具
└── upgrade.ts      # 自动更新逻辑
```

### 命令

位于 `cli/cmd/`，可用命令有：

| 命令 | 文件 | 描述 |
|---------|------|-------------|
| `run` | run.ts | 运行 AI 助手（主命令） |
| `serve` | serve.ts | 启动 HTTP 服务器 |
| `tui` | tui/app.tsx | 启动终端 UI |
| `web` | web.ts | 启动 Web 界面 |
| `auth` | auth.ts | 管理提供商身份验证 |
| `agent` | agent.ts | 管理 AI 代理 |
| `session` | session.ts | 管理会话 |
| `mcp` | mcp.ts | 管理 MCP 服务器 |
| `models` | models.ts | 列出可用模型 |
| `github` | github.ts | GitHub 集成 |
| `pr` | pr.ts | 拉取请求操作 |
| `acp` | acp.ts | ACP 服务器管理 |
| `export` | export.ts | 导出会话数据 |
| `import` | import.ts | 导入会话数据 |
| `uninstall` | uninstall.ts | 卸载 OpenCode |
| `upgrade` | upgrade.ts | 升级到最新版本 |
| `generate` | generate.ts | 生成配置 |
| `stats` | stats.ts | 显示使用统计 |

## 命令定义模式

命令使用 `cmd()` 助手来确保类型安全：

```typescript
import { cmd } from "./cmd"
import type { Argv } from "yargs"

export const MyCommand = cmd({
  command: "my-command <arg>",
  describe: "命令描述",
  builder: (yargs: Argv) => {
    return yargs
      .positional("arg", {
        describe: "参数",
        type: "string",
      })
      .option("option", {
        alias: "o",
        type: "string",
      })
  },
  handler: async (argv) => {
    // 命令逻辑
  },
})
```

## 启动模式

命令使用 `bootstrap()` 函数来初始化项目实例：

```typescript
import { bootstrap } from "../bootstrap"

export const MyCommand = cmd({
  // ...
  handler: async (argv) => {
    await bootstrap(process.cwd(), async () => {
      // 实例在这里初始化
      // 命令逻辑在实例上下文中运行
    })
  },
})
```

启动函数：
1. 通过 `Instance.provide()` 创建实例
2. 运行初始化函数
3. 在 `finally` 块中处置实例

## 终端 UI (TUI)

TUI 是在终端中运行的 SolidJS 应用：

```
cli/cmd/tui/
├── app.tsx          # 主 TUI 应用
├── attach.ts        # 附加到正在运行的会话
├── component/       # UI 组件
├── context/         # 类似 React 的上下文提供者
├── event.ts         # 事件处理
├── routes/          # 路由处理器
├── thread.ts        # 线程管理
├── ui/              # UI 工具
├── util/            # 辅助函数
└── worker.ts        # 用于并行处理的 Web Worker
```

### TUI 框架

- **SolidJS**：响应式 UI 框架
- **@opentui/solid**：终端 UI 组件
- **@opentui/core**：核心 TUI 原语

## 调试命令

位于 `cli/cmd/debug/`，这些命令有助于开发：

| 命令 | 描述 |
|---------|-------------|
| `agent` | 调试代理配置 |
| `config` | 调试配置加载 |
| `file` | 调试文件操作 |
| `lsp` | 调试 LSP 服务器 |
- `ripgrep` | 调试 ripgrep 集成
| `scrap` | 调试 scrap 操作 |
| `skill` | 调试技能加载 |
| `snapshot` | 调试文件快照 |

## UI 工具

### 样式

终端颜色和样式定义在 `cli/ui.ts` 中：

```typescript
UI.Style.TEXT_HIGHLIGHT      // 青色
UI.Style.TEXT_HIGHLIGHT_BOLD // 粗体青色
UI.Style.TEXT_DIM           // 灰色
UI.Style.TEXT_WARNING       // 黄色
UI.Style.TEXT_DANGER        // 红色
UI.Style.TEXT_SUCCESS       // 绿色
UI.Style.TEXT_INFO          // 蓝色
```

### 打印

```typescript
import { UI } from "@/cli/ui"

UI.println("Hello", "world")  // 带换行符打印
UI.print("Hello", "world")    // 不带换行符打印
UI.empty()                    // 打印空行（去重）
UI.error("Error message")     // 打印错误
UI.logo()                     // 打印 ASCII logo
```

### Logo

ASCII logo 定义在 `cli/logo.ts` 中，使用特殊字符：
- `_` = 背景块
- `^` = 前景块
- `~` = 阴影块

## 错误处理

错误由 `cli/error.ts` 格式化：

```typescript
import { FormatError, FormatUnknownError } from "@/cli/error"

try {
  // ...
} catch (error) {
  const message = FormatError(error) ?? FormatUnknownError(error)
  UI.error(message)
}
```

支持的错误类型：
- `MCP.Failed` - MCP 服务器故障
- `Provider.ModelNotFoundError` - 无效的模型名称
- `Provider.InitError` - 提供商初始化失败
- `Config.JsonError` - 配置中的无效 JSON
- `Config.ConfigDirectoryTypoError` - 常见的目录拼写错误
- `ConfigMarkdown.FrontmatterError` - Markdown frontmatter 错误
- `Config.InvalidError` - 配置验证错误
- `UI.CancelledError` - 用户取消操作

## 网络选项

启动服务器的命令使用来自 `cli/network.ts` 的共享网络选项：

```typescript
import { withNetworkOptions, resolveNetworkOptions } from "@/cli/network"

// 在 builder 中
builder: (yargs) => withNetworkOptions(yargs)

// 在 handler 中
const { hostname, port, mdns, mdnsDomain, cors } = await resolveNetworkOptions(args)
```

选项：
- `--port` - 监听端口（默认：0 / 自动）
- `--hostname` - 绑定的主机名（默认：127.0.0.1）
- `--mdns` - 启用 mDNS 发现（将主机名默认为 0.0.0.0）
- `--mdns-domain` - mDNS 域（默认：opencode.local）
- `--cors` - 额外的 CORS 域

## 自动更新

`cli/upgrade.ts` 模块处理自动更新：

1. 通过 `Installation.latest()` 检查新版本
2. 遵守 `config.autoupdate` 设置：
   - `false` - 禁用
   - `"notify"` - 发布 `UpdateAvailable` 事件
   - `true` - 自动升级
3. 成功时发布 `Updated` 事件

## 相关文件

- **src/cli/bootstrap.ts**：实例初始化
- **src/cli/cmd/**：命令实现
- **src/cli/cmd/tui/app.tsx**：TUI 应用
- **src/cli/error.ts**：错误格式化
- **src/cli/ui.ts**：终端 UI 工具
- **src/index.ts**：主 CLI 入口点
- **src/server/server.ts**：HTTP 服务器实现
