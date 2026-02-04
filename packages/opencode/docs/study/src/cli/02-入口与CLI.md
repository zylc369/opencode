# 入口点与 CLI 层

## 入口文件：src/index.ts

`src/index.ts` 是 OpenCode 的主入口文件，负责初始化 CLI 应用并注册所有命令。

### 文件结构分析

```typescript
// 1. 导入依赖
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { RunCommand } from "./cli/cmd/run"
import { GenerateCommand } from "./cli/cmd/generate"
// ... 更多命令导入
import { Log } from "./util/log"
import { UI } from "./cli/ui"

// 2. 全局错误处理
process.on("unhandledRejection", (e) => {
  Log.Default.error("rejection", { e })
})

process.on("uncaughtException", (e) => {
  Log.Default.error("exception", { e })
})

// 3. CLI 应用构建
const cli = yargs(hideBin(process.argv))
  .parserConfiguration({ "populate--": true })
  .scriptName("opencode")
  .wrap(100)
  .help("help", "show help")
  .alias("help", "h")
  .version("version", "show version number", Installation.VERSION)
  .alias("version", "v")
  // 日志配置选项
  .option("print-logs", { describe: "print logs to stderr", type: "boolean" })
  .option("log-level", {
    describe: "log level",
    type: "string",
    choices: ["DEBUG", "INFO", "WARN", "ERROR"],
  })
  // 中间件：初始化日志和环境变量
  .middleware(async (opts) => {
    await Log.init({ /* ... */ })
    process.env.AGENT = "1"
    process.env.OPENCODE = "1"
  })
  // 添加 Logo
  .usage("\n" + UI.logo())
  // Shell 自动补全
  .completion("completion", "generate shell completion script")
  // 注册所有命令（按顺序）
  .command(AcpCommand)
  .command(McpCommand)
  .command(TuiThreadCommand)
  .command(AttachCommand)
  .command(RunCommand)
  .command(GenerateCommand)
  // ... 更多命令
  // 错误处理
  .fail((msg, err) => { /* ... */ })
  .strict()

// 4. 解析命令行参数并执行
try {
  await cli.parse()
} catch (e) {
  // 格式化错误并输出
  const formatted = FormatError(e)
  if (formatted) UI.error(formatted)
  process.exitCode = 1
} finally {
  process.exit()
}
```

### 关键点解析

#### 1. 中间件系统

Yargs 中间件在命令处理前执行，用于：
- 初始化日志系统
- 设置环境变量（`AGENT` 和 `OPENCODE`）
- 确定日志级别

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

#### 2. 命令注册顺序

命令按照以下顺序注册（有意义的分组）：

1. **协议相关**：ACP、MCP
2. **TUI 相关**：TuiThread、Attach
3. **核心命令**：Run、Generate
4. **开发命令**：Debug、Auth、Agent、Upgrade、Uninstall
5. **服务相关**：Serve、Web
6. **信息查询**：Models、Stats
7. **数据管理**：Export、Import、Github
8. **协作**：PR
9. **会话**：Session

#### 3. 错误处理

`.fail()` 方法处理 Yargs 解析错误：

```typescript
.fail((msg, err) => {
  // 处理常见的参数错误
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

#### 4. 全局异常处理

```typescript
process.on("unhandledRejection", (e) => {
  Log.Default.error("rejection", { e })
})

process.on("uncaughtException", (e) => {
  Log.Default.error("exception", { e })
})
```

### 命令完整列表

| 命令 | 描述 | 文件位置 |
|------|------|----------|
| `run` | 运行 opencode 并发送消息 | `src/cli/cmd/run.ts` |
| `generate` | 生成内容 | `src/cli/cmd/generate.ts` |
| `debug` | 调试模式 | `src/cli/cmd/debug.ts` |
| `auth` | 认证管理 | `src/cli/cmd/auth.ts` |
| `agent` | 代理管理 | `src/cli/cmd/agent.ts` |
| `upgrade` | 升级 | `src/cli/cmd/upgrade.ts` |
| `uninstall` | 卸载 | `src/cli/cmd/uninstall.ts` |
| `serve` | 启动 HTTP 服务器 | `src/cli/cmd/serve.ts` |
| `web` | 启动 Web 界面 | `src/cli/cmd/web.ts` |
| `models` | 列出可用模型 | `src/cli/cmd/models.ts` |
| `stats` | 统计信息 | `src/cli/cmd/stats.ts` |
| `export` | 导出数据 | `src/cli/cmd/export.ts` |
| `import` | 导入数据 | `src/cli/cmd/import.ts` |
| `github` | GitHub 相关操作 | `src/cli/cmd/github.ts` |
| `pr` | Pull Request | `src/cli/cmd/pr.ts` |
| `session` | 会话管理 | `src/cli/cmd/session.ts` |
| `mcp` | MCP 协议 | `src/cli/cmd/mcp.ts` |
| `acp` | ACP 协议 | `src/cli/cmd/acp.ts` |
| `tui` | 终端 UI | `src/cli/cmd/tui/` |

## 命令定义模式：src/cli/cmd/cmd.ts

所有命令使用 `cmd()` 辅助函数定义，确保一致的模式。

```typescript
import { cmd } from "./cmd"
import type { Argv } from "yargs"
import { bootstrap } from "../bootstrap"

export const MyCommand = cmd({
  command: "my-command <arg>",      // 命令名称和参数
  describe: "Command description",  // 命令描述
  builder: (yargs: Argv) => {       // 参数构建器
    return yargs
      .positional("arg", { describe: "Argument", type: "string" })
      .option("option", { alias: "o", type: "string" })
  },
  handler: async (argv) => {        // 命令处理器
    await bootstrap(process.cwd(), async () => {
      // 命令逻辑
    })
  },
})
```

### `cmd()` 函数的作用

```typescript
export function cmd<T>(input: Command<T>): Command<T> {
  // 确保命令有描述
  if (!input.describe) {
    throw new Error(`Command ${input.command} is missing a description`)
  }
  return input
}
```

### `bootstrap()` 函数

大多数命令使用 `bootstrap()` 包装执行逻辑：

```typescript
export async function bootstrap(
  directory: string,
  fn: () => Promise<void>
) {
  // 1. 设置工作目录
  process.chdir(directory)

  // 2. 提供项目上下文
  await Instance.provide({
    directory,
    init: InstanceBootstrap,
    async fn() {
      // 3. 初始化插件
      await Plugin.init()

      // 4. 执行命令逻辑
      await fn()
    },
  })
}
```

## 核心命令示例：src/cli/cmd/run.ts

`run` 命令是最常用的命令，用于启动对话。

### 命令选项

```typescript
.option("message", "要发送的消息")
.option("command", "要运行的命令")
.option("continue", "继续上一个会话")
.option("session", "指定会话 ID")
.option("model", "模型（格式：provider/model）")
.option("agent", "代理名称")
.option("file", "附加文件")
.option("title", "会话标题")
.option("attach", "连接到运行中的服务器")
.option("variant", "模型变体")
.option("thinking", "显示思考过程")
```

### 执行流程

```typescript
handler: async (args) => {
  // 1. 处理输入（消息 + 文件）
  const message = /* ... */
  const files = /* ... */

  // 2. 设置权限规则
  const rules: PermissionNext.Ruleset = [/* ... */]

  // 3. 执行逻辑
  await bootstrap(process.cwd(), async () => {
    // 4. 创建 SDK 客户端
    const sdk = createOpencodeClient({ /* ... */ })

    // 5. 获取或创建会话
    const sessionID = await session(sdk)

    // 6. 订阅事件流
    const events = await sdk.event.subscribe()

    // 7. 事件处理循环
    for await (const event of events.stream) {
      // 处理各种事件（消息更新、工具调用等）
    }

    // 8. 发送提示词
    await sdk.session.prompt({
      sessionID,
      agent,
      model,
      parts: [...files, { type: "text", text: message }],
    })
  })
}
```

### 事件流处理

```typescript
for await (const event of events.stream) {
  if (event.type === "message.updated") {
    // 显示模型信息
  }

  if (event.type === "message.part.updated") {
    const part = event.properties.part

    if (part.type === "tool" && part.state.status === "completed") {
      // 显示工具执行结果
      tool(part)
    }

    if (part.type === "text" && part.time?.end) {
      // 显示文本输出
      UI.println(part.text.trim())
    }

    if (part.type === "step-finish") {
      // 步骤完成
    }
  }

  if (event.type === "session.error") {
    // 显示错误
    UI.error(event.properties.error)
  }

  if (event.type === "session.status" && event.properties.status.type === "idle") {
    // 会话空闲，退出
    break
  }
}
```

## UI 工具：src/cli/ui.ts

`UI` 命名空间提供终端输出格式化工具。

### 样式定义

```typescript
export namespace UI {
  export const Style = {
    TEXT_RESET: "\u001b[0m",
    TEXT_BOLD: "\u001b[1m",
    TEXT_DIM: "\u001b[2m",
    TEXT_NORMAL: "\u001b[22m",

    TEXT_INFO: "\u001b[34m",      // 蓝色
    TEXT_INFO_BOLD: "\u001b[1;34m",

    TEXT_SUCCESS: "\u001b[32m",   // 绿色
    TEXT_SUCCESS_BOLD: "\u001b[1;32m",

    TEXT_WARNING: "\u001b[33m",   // 黄色
    TEXT_WARNING_BOLD: "\u001b[1;33m",

    TEXT_DANGER: "\u001b[31m",    // 红色
    TEXT_DANGER_BOLD: "\u001b[1;31m",
  }
}
```

### 输出函数

```typescript
export namespace UI {
  export function println(...args: string[]) {
    console.log(...args)
  }

  export function print(...args: string[]) {
    process.stdout.write(args.join(""))
  }

  export function error(message: string) {
    console.error(UI.Style.TEXT_DANGER_BOLD + "✖", UI.Style.TEXT_NORMAL, message)
  }

  export function empty() {
    console.log()
  }

  export function logo() {
    return `
    ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗
    ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝
    ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║█████╗
    ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║██╔══╝
    ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████╗
    ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝
    `
  }
}
```

## 学习检查点

完成本章学习后，你应该能够：

1. ✅ 解释 `src/index.ts` 的启动流程
2. ✅ 描述 Yargs 中间件的作用
3. ✅ 理解命令定义模式（`cmd()` 函数）
4. ✅ 掌握 `bootstrap()` 函数的作用
5. ✅ 追踪 `run` 命令的执行流程
6. ✅ 理解事件流处理机制
7. ✅ 知道如何添加新命令

## 下一章

接下来我们将学习：
- **项目上下文与实例管理** (`src/project/instance.ts`)
- 理解每个目录如何拥有独立的状态
- 掌握异步上下文管理器的实现
