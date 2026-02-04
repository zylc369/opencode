# 命令系统

## 概述

命令系统定义了可由用户或代理调用的可重用 AI 代理命令（提示）。命令从多个来源加载：配置文件、MCP 服务器和技能目录。

## 架构

### 命令来源

命令从三个来源加载（按优先级顺序，最后为最高）：

1. **内置命令**：OpenCode 包含的默认命令
2. **配置命令**：在 `opencode.json` 的 `command` 键下定义
3. **MCP 提示**：连接的 MCP 服务器暴露的提示
4. **技能**：带有 SKILL frontmatter 的技能文件（`.md`）

### 命令架构

```typescript
{
  name: string,                    // 唯一标识符
  description?: string,            // 人类可读的描述
  agent?: string,                  // 用于执行的代理
  model?: string,                  // 模型覆盖（provider/model）
  source?: "command" | "mcp" | "skill",  // 命令的来源
  template: string | Promise<string>,  // 提示模板
  subtask?: boolean,               // 是否为子任务
  hints: string[],                 // 模板变量提示
}
```

## 内置命令

### init

创建或更新包含开发指南的 `AGENTS.md` 文件。

模板：`command/template/initialize.txt`

用法：`init [options]`

### review

审查代码更改（提交、分支、PR）。

模板：`command/template/review.txt`

用法：`review [commit|branch|pr]`

## 模板语法

命令模板支持特殊变量：

- **`$ARGUMENTS`**：替换为命令参数
- **`$1`、`$2`、`$3`、...**：位置参数
- **`@filepath`**：文件引用（从模板中提取）
- **``!`command` ``**：Shell 命令执行

### 提示

`hints` 字段包含需要替换的模板变量：

```typescript
Command.hints(template) // 返回 ["$1", "$2", "$ARGUMENTS"]
```

## 命令加载

命令是实例作用域的，通过 `Instance.state()` 加载：

```typescript
const state = Instance.state(async () => {
  // 从配置加载
  for (const [name, command] of Object.entries(cfg.command ?? {})) {
    result[name] = { name, ...command, source: "command" }
  }

  // 从 MCP 服务器加载
  for (const [name, prompt] of Object.entries(await MCP.prompts())) {
    result[name] = { name, ...prompt, source: "mcp" }
  }

  // 从技能加载
  for (const skill of await Skill.all()) {
    if (!result[skill.name]) {
      result[skill.name] = { name: skill.name, ...skill, source: "skill" }
    }
  }

  return result
})
```

## 事件

### Command.Executed

命令执行时发布：

```typescript
BusEvent.define("command.executed", z.object({
  name: string,
  sessionID: string,
  arguments: string,
  messageID: string,
}))
```

## API

### 获取命令

```typescript
const command = await Command.get("init")
```

### 列出命令

```typescript
const commands = await Command.list()
// 返回所有已注册命令的数组
```

## 配置定义

命令可以在 `opencode.json` 中定义：

```json
{
  "command": {
    "my-command": {
      "description": "我的自定义命令",
      "agent": "build",
      "template": "使用 $ARGUMENTS 做一些事情"
    }
  }
}
```

或作为 `.opencode/command/**/*.md` 中的 markdown 文件：

```markdown
---
description: 我的命令
agent: general
---

使用 $ARGUMENTS 做一些事情
```

## 相关文件

- **src/command/index.ts**：主要命令实现
- **src/command/template/initialize.txt**：Init 命令模板
- **src/command/template/review.txt**：Review 命令模板
- **src/config/config.ts**：配置加载
- **src/mcp/index.ts**：MCP 提示加载
- **src/skill/skill.ts**：技能加载
