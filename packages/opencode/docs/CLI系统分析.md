# CLI 系统分析

## 概述

CLI (Command Line Interface) 系统是 OpenCode 的用户交互入口，提供丰富的命令行工具来管理 AI 助手的各种功能。基于 Yargs 框架构建，支持子命令、参数解析、帮助系统等特性。

## 架构设计

### 入口文件

主入口是 `src/index.ts`，负责：

1. 初始化 Yargs CLI
2. 注册所有命令
3. 配置全局选项
4. 处理错误和异常

### 命令结构

```typescript
import type { Argv } from "yargs"

type WithDoubleDash<T> = T & { "--"?: string[] }

export function cmd<T, U>(input: CommandModule<T, WithDoubleDash<U>>) {
  return input
}
```

每个命令都使用标准的 Yargs CommandModule 接口。

## 核心命令

### Run 命令

```typescript
export const RunCommand = cmd({
  command: "run [message..]",
  describe: "run opencode with a message",
  builder: (yargs: Argv) => {
    return yargs
      .positional("message", {
        describe: "message to send",
        type: "string",
        array: true,
        default: [],
      })
      .option("command", {
        describe: "the command to run, use message for args",
        type: "string",
      })
      .option("continue", {
        alias: ["c"],
        describe: "continue the last session",
        type: "boolean",
      })
    // ... 更多选项
  },
  handler: async (argv) => {
    // 执行逻辑
  },
})
```

### 工具标识

```typescript
const TOOL: Record<string, [string, string]> = {
  todowrite: ["Todo", UI.Style.TEXT_WARNING_BOLD],
  todoread: ["Todo", UI.Style.TEXT_WARNING_BOLD],
  bash: ["Bash", UI.Style.TEXT_DANGER_BOLD],
  edit: ["Edit", UI.Style.TEXT_SUCCESS_BOLD],
  glob: ["Glob", UI.Style.TEXT_INFO_BOLD],
  grep: ["Grep", UI.Style.TEXT_INFO_BOLD],
  list: ["List", UI.Style.TEXT_INFO_BOLD],
  read: ["Read", UI.Style.TEXT_HIGHLIGHT_BOLD],
  write: ["Write", UI.Style.TEXT_SUCCESS_BOLD],
  websearch: ["Search", UI.Style.TEXT_DIM_BOLD],
}
```

## 命令分类

### 核心功能命令

1. **run** - 运行 AI 助手
2. **generate** - 代码生成
3. **auth** - 身份认证
4. **agent** - 代理管理

### 服务器命令

1. **serve** - 启动服务器
2. **web** - Web 界面
3. **tui** - 终端界面

### 开发工具命令

1. **debug** - 调试模式
2. **models** - 模型管理
3. **stats** - 统计信息

### 集成命令

1. **github** - GitHub 集成
2. **pr** - Pull Request 管理
3. **mcp** - MCP 服务器
4. **acp** - ACP 服务器

### 管理命令

1. **upgrade** - 升级系统
2. **uninstall** - 卸载
3. **export/import** - 数据导出导入

## UI 系统

### 样式定义

```typescript
export const Style = {
  TEXT_HIGHLIGHT: "\x1b[96m",
  TEXT_HIGHLIGHT_BOLD: "\x1b[96m\x1b[1m",
  TEXT_DIM: "\x1b[90m",
  TEXT_DIM_BOLD: "\x1b[90m\x1b[1m",
  TEXT_NORMAL: "\x1b[0m",
  TEXT_NORMAL_BOLD: "\x1b[1m",
  TEXT_WARNING: "\x1b[93m",
  TEXT_WARNING_BOLD: "\x1b[93m\x1b[1m",
  TEXT_DANGER: "\x1b[91m",
  TEXT_DANGER_BOLD: "\x1b[91m\x1b[1m",
  TEXT_SUCCESS: "\x1b[92m",
  TEXT_SUCCESS_BOLD: "\x1b[92m\x1b[1m",
  TEXT_INFO: "\x1b[94m",
  TEXT_INFO_BOLD: "\x1b[94m\x1b[1m",
}
```

### 输出函数

```typescript
export function println(...message: string[]) {
  print(...message)
  Bun.stderr.write(EOL)
}

export function print(...message: string[]) {
  blank = false
  Bun.stderr.write(message.join(" "))
}
```

### Logo 显示

```typescript
export function logo(pad?: string) {
  const result: string[] = []
  const reset = "\x1b[0m"
  const left = {
    fg: Bun.color("gray", "ansi") ?? "",
    shadow: "\x1b[38;5;235m",
    bg: "\x1b[48;5;235m",
  }
  // ... Logo 渲染逻辑
  return result.join(EOL)
}
```

## Bootstrap 系统

### 项目初始化

```typescript
export async function bootstrap<T>(directory: string, cb: () => Promise<T>) {
  return Instance.provide({
    directory,
    init: InstanceBootstrap,
    fn: async () => {
      try {
        const result = await cb()
        return result
      } finally {
        await Instance.dispose()
      }
    },
  })
}
```

Bootstrap 负责：

1. 项目实例初始化
2. 依赖注入设置
3. 资源清理

## 错误处理

### 错误类型

```typescript
export namespace UI {
  export const CancelledError = NamedError.create("UICancelledError", z.void())
}
```

### 全局异常处理

```typescript
process.on("unhandledRejection", (e) => {
  Log.Default.error("rejection", {
    e: e instanceof Error ? e.message : e,
  })
})

process.on("uncaughtException", (e) => {
  Log.Default.error("exception", {
    e: e instanceof Error ? e.message : e,
  })
})
```

### 命令失败处理

```typescript
.fail((msg, err) => {
  if (
    msg?.startsWith("Unknown argument") ||
    msg?.startsWith("Not enough non-option arguments") ||
    msg?.startsWith("Invalid values:")
  ) {
    if (err) throw err
    cli.showHelp("log")
  }
  if (err) throw err
  process.exit(1)
})
```

## 全局配置

### 中间件

```typescript
.middleware(async (opts) => {
  await Log.init({
    print: process.argv.includes("--print-logs"),
    dev: Installation.isLocal(),
    level: (() => {
      if (opts.logLevel) return opts.logLevel as Log.Level
      if (Installation.isLocal()) return "DEBUG"
      return "INFO"
    })(),
  })

  process.env.AGENT = "1"
  process.env.OPENCODE = "1"

  Log.Default.info("opencode", {
    version: Installation.VERSION,
    args: process.argv.slice(2),
  })
})
```

### 命令选项

```typescript
.option("print-logs", {
  describe: "print logs to stderr",
  type: "boolean",
})
.option("log-level", {
  describe: "log level",
  type: "string",
  choices: ["DEBUG", "INFO", "WARN", "ERROR"],
})
```

## 命令实现模式

### 标准模式

```typescript
export const SomeCommand = cmd({
  command: "some-command <arg>",
  describe: "Description of command",
  builder: (yargs: Argv) => {
    return yargs
      .positional("arg", {
        describe: "Argument description",
        type: "string",
      })
      .option("option", {
        describe: "Option description",
        type: "string",
        alias: "o",
      })
  },
  handler: async (argv) => {
    await bootstrap(process.cwd(), async () => {
      // 命令逻辑
    })
  },
})
```

### 异步处理

所有命令处理函数都是异步的，支持：

- 异步操作
- 流式响应
- 进度显示
- 中断处理

## 用户交互

### Clack Prompts

```typescript
import { select } from "@clack/prompts"

const choice = await select({
  message: "Select an option",
  options: [
    { value: "option1", label: "Option 1" },
    { value: "option2", label: "Option 2" },
  ],
})
```

### 进度显示

支持长时间运行操作的进度显示。

## 网络处理

### 网络配置

```typescript
import { network } from "./network"
```

处理：

- 代理设置
- 超时配置
- 重试机制

## 命令组合

### 命令注册

```typescript
.command(AcpCommand)
.command(McpCommand)
.command(TuiThreadCommand)
.command(AttachCommand)
.command(RunCommand)
.command(GenerateCommand)
.command(DebugCommand)
.command(AuthCommand)
.command(AgentCommand)
.command(UpgradeCommand)
.command(UninstallCommand)
.command(ServeCommand)
.command(WebCommand)
.command(ModelsCommand)
.command(StatsCommand)
.command(ExportCommand)
.command(ImportCommand)
.command(GithubCommand)
.command(PrCommand)
.command(SessionCommand)
```

### 子命令

支持多级子命令结构：

```bash
opencode tui attach
opencode github pr create
opencode agent list
```

## 最佳实践

### 命令设计原则

1. **一致性**: 相似的命令使用相似的选项
2. **可发现性**: 良好的帮助信息和自动补全
3. **错误友好**: 清晰的错误信息和建议
4. **进度反馈**: 长时间操作显示进度

### 参数验证

使用 Zod 进行参数验证：

```typescript
const schema = z.object({
  arg: z.string(),
  option: z.string().optional(),
})

const result = schema.parse(argv)
```

### 资源管理

```typescript
try {
  await bootstrap(cwd, async () => {
    // 使用资源
  })
} finally {
  // 自动清理
}
```

CLI 系统的设计确保了 OpenCode 提供友好、强大、易用的命令行体验，让用户能够高效地与 AI 助手交互。
