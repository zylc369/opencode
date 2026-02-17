# OpenCode 用户提示词处理流程分析

本文档详细分析 OpenCode 如何处理用户输入的提示词、如何与大模型交互、以及如何将响应反馈给用户的完整流程。

## 目录

1. [整体架构概览](#1-整体架构概览)
2. [数据模型：Session、Message 和 Part 的关系](#2-数据模型sessionmessage-和-part-的关系)
3. [核心入口函数：prompt.ts 的 loop 函数](#3-核心入口函数promptts-的-loop-函数)
4. [消息历史管理](#4-消息历史管理)
5. [Session 标题生成](#5-session-标题生成)
6. [Subtask 子任务处理](#6-subtask-子任务处理)
7. [Compaction 上下文压缩](#7-compaction-上下文压缩)
8. [Agent 和 Processor 的作用](#8-agent-和-processor-的作用)
9. [指令提示词处理](#9-指令提示词处理)
10. [大模型调用流程](#10-大模型调用流程)
11. [工具系统](#11-工具系统)
12. [循环控制逻辑](#12-循环控制逻辑)
13. [用户提示词加工流程](#13-用户提示词加工流程)
14. [系统提示词注入](#14-系统提示词注入)
15. [Session 数据压缩与清理](#15-session-数据压缩与清理)
16. [响应流式返回机制](#16-响应流式返回机制)
17. [用户确认机制](#17-用户确认机制)
18. [附录：关键数据结构](#附录关键数据结构)

---

## 1. 整体架构概览

OpenCode 的提示词处理流程涉及以下核心模块：

```
用户输入
    ↓
SessionPrompt.prompt()      # 入口函数，创建用户消息
    ↓
SessionPrompt.loop()         # 主循环，处理模型交互
    ↓
MessageV2.filterCompacted()  # 读取并过滤消息历史
    ↓
SessionProcessor.create()    # 创建处理器
    ↓
processor.process()          # 处理消息
    ↓
LLM.stream()                 # 调用大模型
    ↓
流式响应 → 数据库 → Bus 事件 → 前端展示
```

### 核心文件位置

| 模块 | 文件路径 |
|------|----------|
| 提示词处理入口 | `src/session/prompt.ts` |
| 消息数据结构 | `src/session/message-v2.ts` |
| 处理器 | `src/session/processor.ts` |
| 大模型调用 | `src/session/llm.ts` |
| 上下文压缩 | `src/session/compaction.ts` |
| 系统提示词 | `src/session/system.ts` |
| 指令提示词 | `src/session/instruction.ts` |
| Session 管理 | `src/session/index.ts` |
| Agent 配置 | `src/agent/agent.ts` |
| 工具注册 | `src/tool/registry.ts` |
| 权限管理 | `src/permission/next.ts` |

---

## 2. 数据模型：Session、Message 和 Part 的关系

理解 OpenCode 的数据处理流程，首先需要理解其核心数据模型。OpenCode 使用三层结构来组织对话数据：Session → Message → Part。

### 2.1 数据库表结构

**位置**: `src/session/session.sql.ts`

```sql
-- Session 表：一次完整的对话会话
SessionTable:
  id (PK)
  project_id (FK)
  title
  permission (JSON)
  time_created, time_updated, ...

-- Message 表：一次对话轮次（用户或助手）
MessageTable:
  id (PK)
  session_id (FK → SessionTable.id, CASCADE DELETE)
  time_created
  data (JSON: role, agent, model, tokens, finish, ...)

-- Part 表：消息内的具体内容单元
PartTable:
  id (PK)
  message_id (FK → MessageTable.id, CASCADE DELETE)
  session_id (冗余字段，用于快速查询)
  time_created
  data (JSON: type, text, tool, state, ...)
```

### 2.2 层级关系图

```
                    Session (会话)
                    一个完整的对话会话
                         │
                         │ 1:N
                         ▼
    ┌──────────────────────────────────────┐
    │              Message                  │
    │       (一次对话轮次)                   │
    │                                       │
    │  角色: "user" | "assistant"           │
    │  元数据: agent, model, tokens, finish │
    │  关联: parentID (助手消息关联用户消息)  │
    └──────────────────────────────────────┘
                         │
                         │ 1:N
                         ▼
    ┌──────────────────────────────────────┐
    │                Part                   │
    │        (消息内的内容单元)              │
    │                                       │
    │  类型: text | tool | reasoning | ...  │
    │  内容: 由 type 决定具体字段            │
    │  关联: messageID (所属消息)            │
    └──────────────────────────────────────┘
```

### 2.3 Message（消息）详解

Message 代表对话中的**一次交互轮次**，分为两种角色：

#### User Message（用户消息）
```typescript
{
  id: "message_abc123",
  sessionID: "session_xyz",
  role: "user",
  agent: "build",                    // 使用的 agent
  model: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
  time: { created: 1700000000000 }
}
```

#### Assistant Message（助手消息）
```typescript
{
  id: "message_def456",
  sessionID: "session_xyz",
  role: "assistant",
  parentID: "message_abc123",        // 关联到触发它的用户消息
  agent: "build",
  modelID: "claude-sonnet-4-20250514",
  providerID: "anthropic",
  tokens: { input: 100, output: 200, ... },
  finish: "stop",                    // 完成原因
  time: { created: 1700000001000, completed: 1700000005000 }
}
```

### 2.4 Part（消息部分）详解

Part 代表一条消息内的**具体内容单元**，一条消息可以包含多个 part：

```typescript
type Part =
  | TextPart        // 文本内容
  | ToolPart        // 工具调用
  | ReasoningPart   // 推理过程（如 Claude 的思考）
  | FilePart        // 文件附件
  | SubtaskPart     // 子任务
  | CompactionPart  // 压缩标记
  | StepStartPart   // 步骤开始标记
  | StepFinishPart  // 步骤结束标记（含 token 统计）
  | ...
```

### 2.5 实际示例

假设用户发送 "读取 package.json 文件并解释它"，完整的消息和 part 结构如下：

```
┌─────────────────────────────────────────────────────────────────────┐
│ Session: session_xyz                                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Message 1 (User) - id: msg_001                                     │
│  ├── Part 1: TextPart                                               │
│  │   └── text: "读取 package.json 文件并解释它"                       │
│  └── Part 2: FilePart (如果用户拖拽了文件)                            │
│      └── url: "file:///path/to/package.json"                        │
│                                                                     │
│  Message 2 (Assistant) - id: msg_002, parentID: msg_001             │
│  ├── Part 1: StepStartPart                                          │
│  │   └── 标记步骤开始                                                │
│  ├── Part 2: TextPart                                               │
│  │   └── text: "我来读取这个文件..."                                 │
│  ├── Part 3: ToolPart                                               │
│  │   ├── tool: "read"                                               │
│  │   ├── callID: "call_abc123"                                      │
│  │   └── state: { status: "completed", output: "{ ... }" }          │
│  ├── Part 4: TextPart                                               │
│  │   └── text: "这是 package.json 的解释..."                         │
│  └── Part 5: StepFinishPart                                         │
│      ├── reason: "stop"                                             │
│      └── tokens: { input: 500, output: 300 }                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.6 设计原因

#### Message 的作用
- **对话层级**: 区分用户和助手的交互轮次
- **元数据存储**: 模型信息、token 使用量、完成状态等
- **关联追踪**: 通过 `parentID` 知道哪个助手消息响应用户消息

#### Part 的作用
- **细粒度更新**: 流式返回时可以逐个 part 更新，前端实时显示
- **类型区分**: 不同类型的内容有不同的处理方式
- **工具追踪**: 每个 tool 调用是独立的 part，可以追踪状态
- **压缩支持**: 可以单独标记旧 part 为已压缩，减少上下文

### 2.7 代码中的使用

```typescript
// 创建用户消息
const userMessage = await Session.updateMessage({
  id: Identifier.ascending("message"),
  sessionID,
  role: "user",
  agent: "build",
  model: { providerID, modelID },
})

// 添加文本 part
await Session.updatePart({
  id: Identifier.ascending("part"),
  messageID: userMessage.id,    // 关联到消息
  sessionID,
  type: "text",
  text: "用户输入的内容",
})

// 创建助手消息
const assistantMessage = await Session.updateMessage({
  id: Identifier.ascending("message"),
  parentID: userMessage.id,     // 关联到用户消息
  sessionID,
  role: "assistant",
  // ...
})

// 流式更新文本 part
await Session.updatePartDelta({
  sessionID,
  messageID: assistantMessage.id,
  partID: textPartID,
  field: "text",
  delta: "新增的文本片段",
})
```

### 2.8 查询完整消息

```typescript
// 获取消息及其所有 parts
export const parts = fn(Identifier.schema("message"), async (message_id) => {
  const rows = Database.use((db) =>
    db.select().from(PartTable)
      .where(eq(PartTable.message_id, message_id))
      .orderBy(PartTable.id)
      .all(),
  )
  return rows.map((row) => ({
    ...row.data,
    id: row.id,
    sessionID: row.session_id,
    messageID: row.message_id,
  }))
})

// 完整的消息结构
type WithParts = {
  info: MessageV2.Info     // 消息元数据
  parts: MessageV2.Part[]  // 该消息的所有 parts
}
```

### 2.9 总结

| 概念 | 粒度 | 作用 | 关键字段 |
|------|------|------|----------|
| **Session** | 会话级别 | 一次完整的对话会话 | id, title, permission |
| **Message** | 轮次级别 | 用户或助手的一次交互 | id, role, parentID, tokens |
| **Part** | 内容单元 | 消息内的具体内容 | id, messageID, type |

**关系**: Session → 1:N → Message → 1:N → Part

---

## 3. 核心入口函数：prompt.ts 的 loop 函数

### 3.1 prompt 函数 (入口)

**位置**: `src/session/prompt.ts:158-188`

```typescript
export const prompt = fn(PromptInput, async (input) => {
  const session = await Session.get(input.sessionID)
  await SessionRevert.cleanup(session)

  const message = await createUserMessage(input)  // 创建用户消息
  await Session.touch(input.sessionID)

  // 处理权限设置
  const permissions: PermissionNext.Ruleset = []
  // ... 权限处理逻辑

  if (input.noReply === true) {
    return message  // 不需要回复
  }

  return loop({ sessionID: input.sessionID })  // 进入主循环
})
```

**作用**:
- 获取 Session 信息
- 清理回滚状态
- 创建用户消息并存入数据库
- 触发主循环 `loop()`

### 3.2 loop 函数 (主循环)

**位置**: `src/session/prompt.ts:277-732`

这是整个处理流程的核心，主要逻辑如下：

```typescript
export const loop = fn(LoopInput, async (input) => {
  const { sessionID, resume_existing } = input

  // 1. 启动或恢复会话
  const abort = resume_existing ? resume(sessionID) : start(sessionID)

  // 2. 主循环
  while (true) {
    // 3. 读取消息历史
    let msgs = await MessageV2.filterCompacted(MessageV2.stream(sessionID))

    // 4. 查找最后的用户消息和助手消息
    let lastUser: MessageV2.User | undefined
    let lastAssistant: MessageV2.Assistant | undefined
    // ... 倒序遍历查找

    // 5. 检查是否应该退出循环
    if (lastAssistant?.finish && !["tool-calls", "unknown"].includes(lastAssistant.finish)) {
      break  // 模型已完成，退出循环
    }

    // 6. 处理 subtask
    if (task?.type === "subtask") {
      // 执行子任务...
      continue
    }

    // 7. 处理 compaction
    if (task?.type === "compaction") {
      // 执行上下文压缩...
      continue
    }

    // 8. 正常处理流程
    const agent = await Agent.get(lastUser.agent)
    const processor = SessionProcessor.create({...})

    const result = await processor.process({
      user: lastUser,
      agent,
      system,
      messages,
      tools,
      model,
    })

    // 9. 处理结果
    if (result === "stop") break
    if (result === "compact") {
      await SessionCompaction.create({...})
    }
  }

  return finalMessage
})
```

---

## 4. 消息历史管理

### 4.1 MessageV2.filterCompacted 函数

**位置**: `src/session/message-v2.ts:794-809`

```typescript
export async function filterCompacted(stream: AsyncIterable<MessageV2.WithParts>) {
  const result = [] as MessageV2.WithParts[]
  const completed = new Set<string>()

  for await (const msg of stream) {
    result.push(msg)

    // 如果是用户消息，且已完成压缩，且包含 compaction part，则停止
    if (
      msg.info.role === "user" &&
      completed.has(msg.info.id) &&
      msg.parts.some((part) => part.type === "compaction")
    )
      break

    // 如果是助手消息且已总结完成，标记其父消息为已完成
    if (msg.info.role === "assistant" && msg.info.summary && msg.info.finish)
      completed.add(msg.info.parentID)
  }

  result.reverse()  // 反转顺序
  return result
}
```

### 4.2 为什么要读取历史数据？

1. **构建上下文**: 大模型需要历史对话来理解当前任务
2. **保持连续性**: 维持对话的上下文连贯性
3. **支持压缩点**: 通过 `compaction` 标记确定有效历史范围

### 4.3 为什么要 reverse()？

`MessageV2.stream()` 从数据库按时间倒序读取（最新的在前），但模型需要按时间正序处理（最早的在前），所以需要 `reverse()`。

### 4.4 为什么要倒着遍历 (for let i = msgs.length - 1)?

**位置**: `src/session/prompt.ts:310-321`

```typescript
for (let i = msgs.length - 1; i >= 0; i--) {
  const msg = msgs[i]
  if (!lastUser && msg.info.role === "user") lastUser = msg.info as MessageV2.User
  if (!lastAssistant && msg.info.role === "assistant") lastAssistant = msg.info as MessageV2.Assistant
  if (!lastFinished && msg.info.role === "assistant" && msg.info.finish)
    lastFinished = msg.info as MessageV2.Assistant
  if (lastUser && lastFinished) break

  const task = msg.parts.filter((part) => part.type === "compaction" || part.type === "subtask")
  if (task && !lastFinished) {
    tasks.push(...task)
  }
}
```

**原因**:
- 倒序遍历可以快速找到最近的消息
- 找到 `lastUser` 和 `lastFinished` 后立即 `break`，提高效率
- 收集最近的待处理任务（subtask/compaction）

---

## 5. Session 标题生成

### 5.1 ensureTitle 函数

**位置**: `src/session/prompt.ts:1890-1960`

```typescript
async function ensureTitle(input: {
  session: Session.Info
  history: MessageV2.WithParts[]
  providerID: string
  modelID: string
}) {
  // 只处理根 session 且标题为默认标题
  if (input.session.parentID) return
  if (!Session.isDefaultTitle(input.session.title)) return

  // 只处理第一条真正的用户消息
  const isFirst = input.history.filter(
    (m) => m.info.role === "user" && !m.parts.every((p) => "synthetic" in p && p.synthetic)
  ).length === 1
  if (!isFirst) return

  // 使用 title agent 生成标题
  const agent = await Agent.get("title")
  const model = await iife(async () => {
    if (agent.model) return await Provider.getModel(agent.model.providerID, agent.model.modelID)
    return (await Provider.getSmallModel(input.providerID)) ??
           (await Provider.getModel(input.providerID, input.modelID))
  })

  const result = await LLM.stream({
    agent,
    user: firstRealUser.info as MessageV2.User,
    system: [],
    small: true,
    tools: {},
    model,
    messages: [
      { role: "user", content: "Generate a title for this conversation:\n" },
      ...MessageV2.toModelMessages(contextMessages, model),
    ],
    // ...
  })

  const text = await result.text
  if (text) {
    const title = cleaned.length > 100 ? cleaned.substring(0, 97) + "..." : cleaned
    return Session.setTitle({ sessionID: input.session.id, title })
  }
}
```

**作用**:
- 在第一次用户输入时自动生成 Session 标题
- 使用 `title` agent 和小模型（节省成本）
- 标题最大长度 100 字符

---

## 6. Subtask 子任务处理

### 6.1 Subtask 的概念

Subtask 是一种委托机制，允许主会话将任务委托给专门的子 agent 处理。

### 6.2 处理逻辑

**位置**: `src/session/prompt.ts:358-532`

```typescript
if (task?.type === "subtask") {
  const taskTool = await TaskTool.init()
  const taskModel = task.model ?
    await Provider.getModel(task.model.providerID, task.model.modelID) : model

  // 1. 创建助手消息
  const assistantMessage = await Session.updateMessage({
    id: Identifier.ascending("message"),
    role: "assistant",
    parentID: lastUser.id,
    sessionID,
    mode: task.agent,
    agent: task.agent,
    // ...
  })

  // 2. 创建工具调用 part
  let part = await Session.updatePart({
    id: Identifier.ascending("part"),
    messageID: assistantMessage.id,
    sessionID,
    type: "tool",
    callID: ulid(),
    tool: TaskTool.id,
    state: {
      status: "running",
      input: {
        prompt: task.prompt,
        description: task.description,
        subagent_type: task.agent,
        command: task.command,
      },
      // ...
    },
  })

  // 3. 执行任务
  const taskCtx: Tool.Context = {
    agent: task.agent,
    messageID: assistantMessage.id,
    sessionID,
    abort,
    callID: part.callID,
    // ...
  }

  const result = await taskTool.execute(taskArgs, taskCtx)

  // 4. 更新 part 状态
  await Session.updatePart({
    ...part,
    state: {
      status: "completed",
      input: part.state.input,
      title: result.title,
      metadata: result.metadata,
      output: result.output,
      attachments,
      // ...
    },
  })

  continue  // 继续循环
}
```

### 6.3 是否开启新线程？

**不是**。Subtask 在同一个 Node.js 进程中**同步执行**，通过 `taskTool.execute()` 调用。它不使用 Worker 或子进程。

### 6.4 Subtask 的执行方式

1. 创建新的助手消息和工具调用 part
2. 构建 `Tool.Context` 上下文
3. 调用 `TaskTool.execute()` 执行任务
4. TaskTool 内部会调用 `loop()` 函数启动新的处理循环
5. 更新 part 状态并继续主循环

---

## 7. Compaction 上下文压缩

### 7.1 触发条件

**位置**: `src/session/prompt.ts:548-560`

```typescript
// 检查是否上下文溢出
if (
  lastFinished &&
  lastFinished.summary !== true &&
  (await SessionCompaction.isOverflow({ tokens: lastFinished.tokens, model }))
) {
  await SessionCompaction.create({
    sessionID,
    agent: lastUser.agent,
    model: lastUser.model,
    auto: true,
  })
  continue
}
```

**位置**: `src/session/compaction.ts:32-48`

```typescript
export async function isOverflow(input: { tokens: MessageV2.Assistant["tokens"]; model: Provider.Model }) {
  const config = await Config.get()
  if (config.compaction?.auto === false) return false

  const context = input.model.limit.context
  if (context === 0) return false

  const count = input.tokens.total ||
    input.tokens.input + input.tokens.output + input.tokens.cache.read + input.tokens.cache.write

  const reserved = config.compaction?.reserved ??
    Math.min(COMPACTION_BUFFER, ProviderTransform.maxOutputTokens(input.model))

  const usable = input.model.limit.input
    ? input.model.limit.input - reserved
    : context - ProviderTransform.maxOutputTokens(input.model)

  return count >= usable
}
```

### 7.2 Compaction 处理逻辑

**位置**: `src/session/compaction.ts:101-229`

```typescript
export async function process(input: {
  parentID: string
  messages: MessageV2.WithParts[]
  sessionID: string
  abort: AbortSignal
  auto: boolean
}) {
  const userMessage = input.messages.findLast((m) => m.info.id === input.parentID)!.info as MessageV2.User
  const agent = await Agent.get("compaction")

  // 1. 创建压缩消息
  const msg = await Session.updateMessage({
    id: Identifier.ascending("message"),
    role: "assistant",
    parentID: input.parentID,
    sessionID: input.sessionID,
    mode: "compaction",
    agent: "compaction",
    summary: true,  // 标记为总结消息
    // ...
  })

  // 2. 使用 compaction agent 生成摘要
  const processor = SessionProcessor.create({...})

  const defaultPrompt = `Provide a detailed prompt for continuing our conversation above.
Focus on information that would be helpful for continuing the conversation, including what we did,
what we're doing, which files we're working on, and what we're going to do next.
...`

  const result = await processor.process({
    user: userMessage,
    agent,
    messages: [
      ...MessageV2.toModelMessages(input.messages, model),
      { role: "user", content: [{ type: "text", text: promptText }] },
    ],
    // ...
  })

  // 3. 如果是自动压缩，添加继续消息
  if (result === "continue" && input.auto) {
    const continueMsg = await Session.updateMessage({
      role: "user",
      // ...
      text: "Continue if you have next steps, or stop and ask for clarification...",
    })
  }

  return "continue"
}
```

### 7.3 Compaction 的作用

1. **减少上下文长度**: 当 token 数接近模型限制时触发
2. **生成摘要**: 使用 `compaction` agent 生成对话摘要
3. **标记分界点**: `summary: true` 标记压缩点，`filterCompacted` 会在此截断历史

---

## 8. Agent 和 Processor 的作用

### 8.1 Agent (agent.ts)

**位置**: `src/agent/agent.ts`

Agent 定义了不同类型的行为配置：

```typescript
export const Info = z.object({
  name: z.string(),
  description: z.string().optional(),
  mode: z.enum(["subagent", "primary", "all"]),
  permission: PermissionNext.Ruleset,  // 权限规则
  model: z.object({ modelID, providerID }).optional(),  // 指定模型
  prompt: z.string().optional(),  // 自定义提示词
  temperature: z.number().optional(),
  topP: z.number().optional(),
  steps: z.number().int().positive().optional(),  // 最大步数
  options: z.record(z.string(), z.any()),
})
```

**内置 Agent**:
- `build`: 默认构建 agent
- `plan`: 规划模式（禁止编辑）
- `explore`: 代码探索 agent
- `general`: 通用任务 agent
- `compaction`: 上下文压缩 agent
- `title`: 标题生成 agent
- `summary`: 摘要生成 agent

### 8.2 SessionProcessor (processor.ts)

**位置**: `src/session/processor.ts`

Processor 负责处理与大模型的交互：

```typescript
export function create(input: {
  assistantMessage: MessageV2.Assistant
  sessionID: string
  model: Provider.Model
  abort: AbortSignal
}) {
  const toolcalls: Record<string, MessageV2.ToolPart> = {}

  return {
    get message() { return input.assistantMessage },

    partFromToolCall(toolCallID: string) {
      return toolcalls[toolCallID]
    },

    async process(streamInput: LLM.StreamInput) {
      // 调用 LLM.stream
      const stream = await LLM.stream(streamInput)

      // 处理流式响应
      for await (const value of stream.fullStream) {
        switch (value.type) {
          case "text-start":
          case "text-delta":
          case "text-end":
          case "tool-call":
          case "tool-result":
          // ...
        }
      }

      return "continue" | "stop" | "compact"
    }
  }
}
```

**Processor 的作用**:
1. 管理助手消息和工具调用
2. 调用 `LLM.stream()` 与大模型通信
3. 处理流式响应并更新数据库
4. 返回处理结果状态

---

## 9. 指令提示词处理

### 9.1 InstructionPrompt 的作用

**位置**: `src/session/instruction.ts`

`InstructionPrompt` 负责加载和管理额外的指令文件：

```typescript
const FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  "CONTEXT.md",  // deprecated
]

export async function system() {
  const paths = await systemPaths()

  const files = Array.from(paths).map(async (p) => {
    const content = await Bun.file(p).text().catch(() => "")
    return content ? "Instructions from: " + p + "\n" + content : ""
  })

  // 也支持从 URL 加载
  const fetches = urls.map((url) => fetch(url)...)

  return Promise.all([...files, ...fetches]).then((result) => result.filter(Boolean))
}
```

### 9.2 指令文件查找顺序

1. 项目目录下的 `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`
2. 全局配置目录下的 `AGENTS.md`
3. `~/.claude/CLAUDE.md` (Claude Code 兼容)
4. 配置中指定的 URL

### 9.3 使用方式

**位置**: `src/session/prompt.ts:659`

```typescript
const system = [
  ...(await SystemPrompt.environment(model)),  // 环境信息
  ...(await InstructionPrompt.system())        // 指令文件
]
```

---

## 10. 大模型调用流程

### 10.1 调用链

```
processor.process()
    ↓
LLM.stream()
    ↓
streamText() (来自 ai 库)
    ↓
Provider.getLanguage()
    ↓
模型 API 调用
```

### 10.2 LLM.stream 函数

**位置**: `src/session/llm.ts:46-260`

```typescript
export async function stream(input: StreamInput) {
  const [language, cfg, provider, auth] = await Promise.all([
    Provider.getLanguage(input.model),
    Config.get(),
    Provider.getProvider(input.model.providerID),
    Auth.get(input.model.providerID),
  ])

  // 构建系统提示词
  const system = []
  system.push([
    ...(input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model)),
    ...input.system,
    ...(input.user.system ? [input.user.system] : []),
  ].filter((x) => x).join("\n"))

  // 合并各种配置选项
  const options = pipe(
    base,
    mergeDeep(input.model.options),
    mergeDeep(input.agent.options),
    mergeDeep(variant),
  )

  // 获取工具列表
  const tools = await resolveTools(input)

  // 调用 Vercel AI SDK
  return streamText({
    temperature: params.temperature,
    topP: params.topP,
    tools,
    toolChoice: input.toolChoice,
    maxOutputTokens,
    abortSignal: input.abort,
    messages: [
      ...system.map((x) => ({ role: "system", content: x })),
      ...input.messages,
    ],
    model: wrapLanguageModel({
      model: language,
      middleware: [/*...*/],
    }),
    // ...
  })
}
```

### 10.3 实际 API 调用

`streamText` 来自 `@ai-sdk/*` 包，它会：
1. 根据 provider 配置选择正确的 SDK
2. 构建请求体
3. 发起 HTTP 请求
4. 返回流式响应

---

## 11. 工具系统

### 11.1 工具注册

**位置**: `src/tool/registry.ts`

```typescript
async function all(): Promise<Tool.Info[]> {
  return [
    InvalidTool,
    QuestionTool,
    BashTool,
    ReadTool,
    GlobTool,
    GrepTool,
    EditTool,
    WriteTool,
    TaskTool,
    WebFetchTool,
    TodoWriteTool,
    WebSearchTool,
    CodeSearchTool,
    SkillTool,
    ApplyPatchTool,
    // ...更多工具
    ...custom,
  ]
}
```

### 11.2 工具使用时机

工具在 `LLM.stream()` 调用中被传递给模型，模型在响应中可以请求调用工具：

1. 模型返回 `tool-call` 事件
2. `SessionProcessor` 捕获事件
3. 执行工具 `tool.execute(args, ctx)`
4. 返回结果给模型
5. 模型继续生成响应

### 11.3 工具执行上下文

**位置**: `src/tool/tool.ts`

```typescript
export type Context = {
  sessionID: string
  messageID: string
  agent: string
  abort: AbortSignal
  callID?: string
  extra?: { [key: string]: any }
  messages: MessageV2.WithParts[]
  metadata(input: { title?: string; metadata?: M }): void
  ask(input: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">): Promise<void>
}
```

---

## 12. 循环控制逻辑

### 12.1 循环退出条件

**位置**: `src/session/prompt.ts:324-331`

```typescript
if (
  lastAssistant?.finish &&
  !["tool-calls", "unknown"].includes(lastAssistant.finish) &&
  lastUser.id < lastAssistant.id
) {
  log.info("exiting loop", { sessionID })
  break
}
```

**退出条件**:
- 助手消息有 `finish` 标记
- `finish` 不是 `"tool-calls"` 或 `"unknown"`
- 用户消息在助手消息之前

### 12.2 循环继续条件

当模型返回 `finish: "tool-calls"` 时，循环继续，等待工具执行结果。

### 12.3 processor.process 返回值

- `"continue"`: 继续循环
- `"stop"`: 停止循环
- `"compact"`: 触发压缩后继续

---

## 13. 用户提示词加工流程

### 13.1 加工链

```
原始输入 (PromptInput)
    ↓
createUserMessage()      # 创建消息
    ↓
resolvePromptParts()     # 解析文件引用
    ↓
insertReminders()        # 插入提醒
    ↓
MessageV2.toModelMessages()  # 转换为模型格式
```

### 13.2 createUserMessage 函数

**位置**: `src/session/prompt.ts:957-1325`

主要处理：
- 解析 agent 引用
- 解析文件引用（@file 语法）
- 处理 MCP 资源
- 调用 ReadTool 预读取文件

### 13.3 insertReminders 函数

**位置**: `src/session/prompt.ts:1327-1465`

根据当前 agent 和历史添加提醒：
- `plan` agent: 添加规划模式提示
- 从 `plan` 切换到 `build`: 添加切换提示

---

## 14. 系统提示词注入

### 14.1 系统提示词构成

**位置**: `src/session/prompt.ts:659`

```typescript
const system = [
  ...(await SystemPrompt.environment(model)),  // 环境信息
  ...(await InstructionPrompt.system())        // 指令文件
]
```

### 14.2 SystemPrompt.environment

**位置**: `src/session/system.ts:29-53`

```typescript
export async function environment(model: Provider.Model) {
  return [
    `You are powered by the model named ${model.api.id}...`,
    `Working directory: ${Instance.directory}`,
    `Is directory a git repo: ${project.vcs === "git" ? "yes" : "no"}`,
    `Platform: ${process.platform}`,
    `Today's date: ${new Date().toDateString()}`,
    // ...
  ]
}
```

### 14.3 SystemPrompt.provider

**位置**: `src/session/system.ts:19-27`

根据模型类型选择不同的提示词模板：
- GPT/O1/O3: `PROMPT_BEAST`
- Gemini: `PROMPT_GEMINI`
- Claude: `PROMPT_ANTHROPIC`
- 其他: `PROMPT_ANTHROPIC_WITHOUT_TODO`

### 14.4 提示词合并

**位置**: `src/session/llm.ts:67-80`

```typescript
const system = []
system.push([
  ...(input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model)),
  ...input.system,
  ...(input.user.system ? [input.user.system] : []),
].filter((x) => x).join("\n"))
```

---

## 15. Session 数据压缩与清理

### 15.1 自动压缩触发

当 token 使用接近限制时自动触发：

```typescript
if (await SessionCompaction.isOverflow({ tokens, model })) {
  await SessionCompaction.create({ sessionID, agent, model, auto: true })
}
```

### 15.2 prune 函数

**位置**: `src/session/compaction.ts:58-99`

清理旧的工具调用输出：

```typescript
export async function prune(input: { sessionID: string }) {
  // 从后向前遍历
  for (let msgIndex = msgs.length - 1; msgIndex >= 0; msgIndex--) {
    for (let partIndex = msg.parts.length - 1; partIndex >= 0; partIndex--) {
      const part = msg.parts[partIndex]
      if (part.type === "tool" && part.state.status === "completed") {
        if (total > PRUNE_PROTECT) {
          toPrune.push(part)
        }
      }
    }
  }

  // 标记为已压缩
  for (const part of toPrune) {
    part.state.time.compacted = Date.now()
    await Session.updatePart(part)
  }
}
```

---

## 16. 响应流式返回机制

### 16.1 流式处理流程

**位置**: `src/session/processor.ts:45-417`

```typescript
async process(streamInput: LLM.StreamInput) {
  const stream = await LLM.stream(streamInput)

  for await (const value of stream.fullStream) {
    switch (value.type) {
      case "text-delta":
        if (currentText) {
          currentText.text += value.text
          // 实时更新 delta
          await Session.updatePartDelta({
            sessionID, messageID, partID,
            field: "text",
            delta: value.text,
          })
        }
        break

      case "tool-call":
        // 创建/更新工具调用 part
        await Session.updatePart({...})
        break

      // ...更多事件类型
    }
  }
}
```

### 16.2 Bus 事件发布

**位置**: `src/session/index.ts:660-665`

```typescript
export const updatePart = fn(UpdatePartInput, async (part) => {
  Database.use((db) => {
    db.insert(PartTable).values({...}).onConflictDoUpdate({...}).run()
    Database.effect(() =>
      Bus.publish(MessageV2.Event.PartUpdated, { part }),
    )
  })
  return part
})
```

### 16.3 Delta 更新

**位置**: `src/session/index.ts:669-680`

```typescript
export const updatePartDelta = fn({...}, async (input) => {
  Bus.publish(MessageV2.Event.PartDelta, input)
})
```

### 16.4 前端订阅

前端通过 WebSocket/SSE 订阅 Bus 事件：
- `MessageV2.Event.PartUpdated`: part 完整更新
- `MessageV2.Event.PartDelta`: 文本增量更新

---

## 17. 用户确认机制

### 17.1 权限请求

**位置**: `src/permission/next.ts:131-161`

```typescript
export const ask = fn(Request.partial({ id: true }).extend({ ruleset: Ruleset }), async (input) => {
  const s = await state()

  for (const pattern of request.patterns ?? []) {
    const rule = evaluate(request.permission, pattern, ruleset, s.approved)

    if (rule.action === "deny")
      throw new DeniedError(...)

    if (rule.action === "ask") {
      return new Promise<void>((resolve, reject) => {
        const info: Request = { id, ...request }
        s.pending[id] = { info, resolve, reject }
        Bus.publish(Event.Asked, info)  // 发布询问事件
      })
    }

    if (rule.action === "allow") continue
  }
})
```

### 17.2 权限回复

**位置**: `src/permission/next.ts:163-234`

```typescript
export const reply = fn(z.object({
  requestID: Identifier.schema("permission"),
  reply: Reply,  // "once" | "always" | "reject"
  message: z.string().optional(),
}), async (input) => {
  const existing = s.pending[input.requestID]

  if (input.reply === "reject") {
    existing.reject(new RejectedError())
    // 拒绝该 session 的所有待处理权限
    // ...
  }

  if (input.reply === "once") {
    existing.resolve()
  }

  if (input.reply === "always") {
    // 添加到永久允许列表
    s.approved.push({...})
    existing.resolve()
  }
})
```

### 17.3 工具调用中的权限检查

**位置**: `src/session/prompt.ts:779-786`

```typescript
async ask(req) {
  await PermissionNext.ask({
    ...req,
    sessionID: input.session.id,
    tool: { messageID: input.processor.message.id, callID: options.toolCallId },
    ruleset: PermissionNext.merge(input.agent.permission, input.session.permission ?? []),
  })
}
```

### 17.4 权限交互流程

```
工具请求执行
    ↓
ctx.ask() 调用
    ↓
PermissionNext.ask() 评估规则
    ↓
如果 action === "ask"
    ↓
Bus.publish(Event.Asked) → 前端显示确认框
    ↓
用户回复 → PermissionNext.reply()
    ↓
Promise resolve/reject → 工具继续执行或抛出错误
```

---

## 附录：关键数据结构

### MessageV2.Info

```typescript
z.discriminatedUnion("role", [
  User: {
    id, sessionID, role: "user",
    time: { created },
    agent, model, system?, tools?, variant?, format?
  },
  Assistant: {
    id, sessionID, role: "assistant",
    time: { created, completed? },
    parentID, modelID, providerID, agent,
    finish?, error?, summary?, tokens, cost
  }
])
```

### MessageV2.Part

```typescript
z.discriminatedUnion("type", [
  TextPart: { id, sessionID, messageID, type: "text", text, synthetic?, time? },
  ToolPart: { id, sessionID, messageID, type: "tool", callID, tool, state, metadata? },
  ReasoningPart: { id, sessionID, messageID, type: "reasoning", text, metadata?, time },
  FilePart: { id, sessionID, messageID, type: "file", url, mime, filename?, source? },
  SubtaskPart: { id, sessionID, messageID, type: "subtask", prompt, description, agent, model?, command? },
  CompactionPart: { id, sessionID, messageID, type: "compaction", auto },
  // ...更多类型
])
```

### Session.Info

```typescript
{
  id, slug, projectID, directory, parentID?,
  title, version, summary?, share?, revert?, permission?,
  time: { created, updated, compacting?, archived? }
}
```

---

## 总结

OpenCode 的提示词处理流程是一个精心设计的系统，包含：

1. **消息持久化**: 所有消息和部分都存储在数据库中
2. **流式处理**: 实时处理大模型响应并更新 UI
3. **上下文管理**: 智能压缩和清理历史
4. **权限控制**: 细粒度的工具执行权限
5. **可扩展性**: 支持自定义 agent 和工具

核心循环 (`loop()` 函数) 是整个系统的引擎，它不断处理消息、调用模型、执行工具，直到任务完成。
