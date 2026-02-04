# 配置系统

## 概述

配置系统管理来自多个源的分层配置加载，具有明确定义的优先级顺序。它支持 JSON/JSONC 格式、markdown frontmatter 和环境变量替换。

## 架构

### 配置优先级（从低到高）

1. **Remote** - 来自 well-known 认证提供商的 `.well-known/opencode`
2. **Global** - `~/.config/opencode/opencode.json{,c}`
3. **Custom** - `OPENCODE_CONFIG` 环境变量
4. **Project** - 从当前目录向上搜索找到的 `opencode.json{,c}`
5. **.opencode 目录** - 父目录中的 `.opencode/opencode.json{,c}`
6. **Inline** - `OPENCODE_CONFIG_CONTENT` 环境变量
7. **Managed** - `/etc/opencode` (Linux)、`/Library/Application Support/opencode` (macOS)、`C:\ProgramData\opencode` (Windows)

### 配置合并

- 数组在 `plugin` 和 `instructions` 字段中连接（不是替换）
- 所有其他字段使用深度合并
- 后面的源覆盖前面的源

## 配置架构

主配置架构（`Config.Info`）包括：

### 核心设置

```typescript
{
  $schema?: string,           // JSON 架构引用
  model?: string,             // 默认模型（provider/model）
  small_model?: string,       // 用于标题生成的小模型
  default_agent?: string,     // 默认代理名称
  username?: string,          // 显示用户名
  logLevel?: LogLevel,        // 日志级别
  theme?: string,             // UI 主题
}
```

### Agent 配置

```typescript
{
  agent: {
    [name: string]: {
      model?: string,
      variant?: string,
      temperature?: number,
      top_p?: number,
      prompt?: string,
      mode?: "subagent" | "primary" | "all",
      hidden?: boolean,
      color?: string,
      steps?: number,
      permission?: Permission,
      options?: Record<string, any>,
    }
  }
}
```

### 权限配置

```typescript
{
  permission: {
    "*": "allow" | "ask" | "deny",
    "bash": "allow" | "ask" | "deny",
    "edit": "allow" | "ask" | "deny",
    "read": { "*.env": "ask" },
    // ... 更多工具
  }
}
```

### 键绑定配置

```typescript
{
  keybinds: {
    leader: string,
    input_submit: string,
    // ... 80+ 键绑定选项
  }
}
```

### 服务器配置

```typescript
{
  server: {
    port?: number,
    hostname?: string,
    mdns?: boolean,
    mdnsDomain?: string,
    cors?: string[],
  }
}
```

### TUI 配置

```typescript
{
  tui: {
    scroll_speed?: number,
    scroll_acceleration?: { enabled: boolean },
    diff_style?: "auto" | "stacked",
  }
}
```

### 提供商配置

```typescript
{
  provider: {
    [providerID: string]: {
      apiKey?: string,
      baseURL?: string,
      enterpriseUrl?: string,
      timeout?: number | false,
      whitelist?: string[],
      blacklist?: string[],
      models?: {
        [modelID: string]: {
          variants?: { [variant: string]: { disabled?: boolean } }
        }
      }
    }
  }
}
```

### MCP 配置

```typescript
{
  mcp: {
    [name: string]: {
      type: "local" | "remote",
      // 对于本地：
      command?: string[],
      environment?: Record<string, string>,
      // 对于远程：
      url?: string,
      headers?: Record<string, string>,
      oauth?: OAuthConfig | false,
      enabled?: boolean,
      timeout?: number,
    }
  }
}
```

### LSP 配置

```typescript
{
  lsp: false | {
    [serverID: string]: {
      command?: string[],
      extensions?: string[],
      disabled?: boolean,
      env?: Record<string, string>,
      initialization?: Record<string, any>,
    }
  }
}
```

## 特殊功能

### 环境变量替换

```json
{
  "provider": {
    "openai": {
      "apiKey": "{env:OPENAI_API_KEY}"
    }
  }
}
```

### 文件包含

```json
{
  "instructions": [
    "{file:~/path/to/instructions.md}",
    "{file:./local/instructions.txt}"
  ]
}
```

### Markdown 配置

配置可以嵌入带有 frontmatter 的 markdown 文件中：

```markdown
---
description: 我的代理
mode: subagent
---

系统提示内容在这里
```

解析逻辑参见 `src/config/markdown.ts`。

## 目录加载

### .opencode 目录结构

```
.opencode/
├── opencode.json          # 目录配置
├── agents/**/*.md         # 代理定义
├── commands/**/*.md       # 命令定义
├── plugins/**/*.ts        # 插件文件
└── skills/**/*.md         # 技能定义
```

### 自动安装

带有 `package.json` 的 `.opencode` 目录会触发自动依赖安装：

```bash
cd .opencode
bun add @opencode-ai/plugin
bun install
```

参见 `installDependencies()` 和 `needsInstall()` 函数。

## API

### 获取配置

```typescript
const config = await Config.get()
// 返回当前实例的合并配置
```

### 获取全局配置

```typescript
const globalConfig = await Config.global()
// 仅返回全局配置
```

### 更新配置

```typescript
await Config.update({ model: "anthropic/claude-3-opus" })
// 更新项目配置
```

### 更新全局配置

```typescript
await Config.updateGlobal({ model: "anthropic/claude-3-opus" })
// 更新全局配置
```

### 获取目录

```typescript
const dirs = await Config.directories()
// 返回配置目录数组
```

## 错误类型

- `Config.JsonError` - 配置文件中的无效 JSON
- `Config.ConfigDirectoryTypoError` - 常见的目录拼写错误（如 `agents` vs `agent`）
- `Config.InvalidError` - 配置验证失败及 Zod 问题
- `ConfigMarkdown.FrontmatterError` - Markdown frontmatter 解析错误

## 迁移

### 遗留配置迁移

系统自动迁移：
- `autoshare: true` → `share: "auto"`
- `mode` 字段 → `agent` 字段（带有 `mode: "primary"`）
- `tools` 字段 → `permission` 字段
- `maxSteps` → `steps`

### TOML 配置

遗留的 TOML 配置会自动转换为 JSON。

## 相关文件

- **src/config/config.ts**：主要配置实现（~55KB）
- **src/config/markdown.ts**：Markdown 配置解析
- **src/command/index.ts**：命令加载
- **src/agent/agent.ts**：代理加载
- **src/plugin/index.ts**：插件加载
