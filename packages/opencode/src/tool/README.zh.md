# 工具系统

## 概述

工具系统为 AI 可执行操作提供统一接口。工具是 AI 代理与系统交互的主要方式。

## 架构

### 组件

- **tool.ts** - 工具接口和定义
- **registry.ts** - 工具注册表和发现

### 工具列表

| 工具 | 描述 |
|------|-------------|
| `bash` | 执行 shell 命令 |
| `read` | 读取文件内容 |
| `write` | 写入文件 |
| `edit` | 使用搜索/替换编辑文件 |
| `glob` | 按模式查找文件 |
| `grep` | 搜索文件内容 |
| `webfetch` | 获取 Web 内容 |
| `websearch` | 搜索 Web |
| `codesearch` | 搜索代码库 |
| `task` | 启动子代理任务 |
| `todo` | 管理待办事项列表 |
| `skill` | 执行技能 |
| `apply_patch` | 应用统一差异 |
| `lsp` | 查询 LSP 服务器 |
| `ls` | 列出目录内容 |
| `multiedit` | 批量文件编辑 |
| `plan` | 计划模式操作 |
| `question` | 询问用户问题 |
| `external-directory` | 外部目录访问 |
| `batch` | 批量工具执行 |

## 工具定义

使用 `Tool.define()` 函数定义工具：

```typescript
import { Tool } from "./tool"
import z from "zod"

export const MyTool = Tool.define("my_tool", {
  description: "工具描述",
  parameters: z.object({
    input: z.string().describe("输入参数"),
  }),
  execute: async (args, context) => {
    // 检查中止信号
    if (context.abort.signal.aborted) {
      throw new Error("操作已中止")
    }

    // 执行工具逻辑
    const result = await doSomething(args.input)

    return {
      title: "结果标题",
      output: result,
      metadata: {},
    }
  },
})
```

## 工具注册表

工具被注册并动态加载：

```typescript
import { Tool } from "@/tool"

// 获取所有工具
const tools = await Tool.all()

// 获取特定工具
const tool = await Tool.get("read")

// 检查工具是否存在
const exists = Tool.has("read")
```

## 工具架构

```typescript
{
  name: string,
  description: string,
  parameters: ZodSchema,
  execute: (args, context) => Promise<{
    title: string,
    output: string,
    metadata: Record<string, any>
  }>
}
```

## 工具上下文

context 参数提供：

```typescript
{
  sessionID: string,
  messageID: string,
  agent: string,
  abort: {
    signal: AbortSignal
  },
  messages: Message[],
  metadata: (data) => void,
  ask: (question) => Promise<string>
}
```

## 工具权限

工具由权限系统控制：

```json
{
  "permission": {
    "bash": "allow",
    "read": "allow",
    "edit": "ask"
  }
}
```

## 工具文档

每个工具都有相应的 `.txt` 文档文件：
- `tool-name.txt` - AI 的工具描述
- 示例：`bash.txt`、`read.txt`、`edit.txt`

## 相关文件

- **src/tool/tool.ts**：工具接口
- **src/tool/registry.ts**：工具注册表
- **src/tool/*.ts**：各个工具实现
