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

#### updateMessage 和 updatePart 的 Upsert 机制

这两个函数虽然命名为 `update`，但实际是 **"创建或更新"（Upsert）** 操作：

**位置**: `src/session/index.ts:581-601` 和 `src/session/index.ts:646-666`

```typescript
// 核心实现：INSERT ... ON CONFLICT DO UPDATE
db.insert(MessageTable)
  .values({...})
  .onConflictDoUpdate({ target: MessageTable.id, set: { data } })
  .run()
```

| 情况 | 行为 |
|------|------|
| id 不存在 | **插入**新记录（创建） |
| id 已存在 | **更新**现有记录 |

**返回值**：两个函数都返回传入的数据本身（`return msg` / `return part`）。

**设计优点**：
1. **统一接口**：不需要区分 create 和 update，简化调用方逻辑
2. **幂等性**：多次调用同一个 id 不会产生重复数据
3. **流式更新友好**：先创建消息框架，后续再更新内容（如添加 finish 状态）

**使用示例**：
```typescript
// 1. 创建新消息
const msg = await Session.updateMessage({
  id: Identifier.ascending("message"),  // 新 id
  sessionID,
  role: "user",
})

// 2. 更新已有消息（使用同一个 id）
await Session.updateMessage({
  ...msg,  // 复用原消息的 id 和其他字段
  finish: "stop",
  time: { ...msg.time, completed: Date.now() }
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

    // 5. 检查是否应该退出循环，详细解释见第12节
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

    // 如果是用户消息，且已完成压缩，且包含 compaction part，则停止，因为后续的消息都是压缩后的结果，不需要再处理了
    if (
      msg.info.role === "user" &&
      completed.has(msg.info.id) &&
      msg.parts.some((part) => part.type === "compaction")
    )
      break

    // 如果是助手消息且已总结完成，标记其父消息为已完成，父消息即用户消息
    if (msg.info.role === "assistant" && msg.info.summary && msg.info.finish)
      completed.add(msg.info.parentID)
  }

  // 反转顺序，数据库是倒序查询的，但模型需要按时间正序处理（最早的在前）
  result.reverse()
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
// 查找最后的用户消息和助手消息
let lastUser: MessageV2.User | undefined
let lastAssistant: MessageV2.Assistant | undefined
let lastFinished: MessageV2.Assistant | undefined
let tasks: (MessageV2.CompactionPart | MessageV2.SubtaskPart)[] = []
// 倒序遍历，可以快速找到最近的消息、收集最近的待处理任务（subtask/compaction）
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

#### 4.4.1 变量含义和后续用途

| 变量 | 含义 | 后续用途 |
|------|------|---------|
| `lastUser` | 最后一条用户消息 | 1. 获取 `agent`、`model` 配置<br>2. 作为 `processor.process()` 的 `user` 参数<br>3. 创建 compaction 时需要这些信息 |
| `lastAssistant` | 最后一条助手消息 | 1. 判断模型是否已完成响应（通过 `finish` 字段）<br>2. 退出循环的判断条件 |
| `lastFinished` | 最后一条**已完成**的助手消息（有 `finish` 字段） | 1. 获取 `tokens` 统计信息<br>2. 判断是否触发压缩（`isOverflow` 需要 tokens）<br>3. 压缩点有效性判断（`summary && finish`） |
| `tasks` | 待处理的 compaction/subtask parts | 1. 后续取出最新的 task 进行处理<br>2. 通过 `task.type` 判断处理逻辑 |

**为什么需要区分 lastAssistant 和 lastFinished？**

```typescript
// lastAssistant：只要最后一条助手消息
if (!lastAssistant && msg.info.role === "assistant") lastAssistant = msg.info

// lastFinished：需要已完成（有 finish 字段）
if (!lastFinished && msg.info.role === "assistant" && msg.info.finish) lastFinished = msg.info
```

- `lastAssistant` 可能**没有 finish**（正在生成中、被中断等）
- `lastFinished` 一定有 `finish`，所以有 `tokens` 统计，可以用于判断是否需要压缩

#### 4.4.2 compaction part 的产生和作用

**什么时候产生 compaction part？**

通过 `SessionCompaction.create` 创建，有两种触发方式：

| 方式 | 触发位置 | `auto` 值 | 触发条件 |
|------|---------|----------|---------|
| 自动压缩 | `prompt.ts:561` 或 `prompt.ts:721` | `true` | token 溢出（`isOverflow` 返回 true） |
| 手动压缩 | `session.ts:530` | `false`（默认） | 用户调用 `/compact` 命令或 API |

**compaction part 的作用是什么？**

compaction part 是一个**标记/信号**，告诉 loop 循环"这里需要执行压缩操作"。

**完整流程**：
```
SessionCompaction.create()
    → 插入 compaction part 到数据库
    → continue 跳过本轮
    → 下轮循环读取消息
    → 检测到 compaction part
    → 调用 SessionCompaction.process() 生成摘要
```

#### 4.4.3 tasks 的设计思路

**为什么只存 part，不存 message？**

```typescript
const task = msg.parts.filter((part) => part.type === "compaction" || part.type === "subtask")
if (task && !lastFinished) {
  tasks.push(...task)  // 存的是 part，不是 msg
}
```

**原因**：

1. **part 包含处理所需的所有信息**：
   ```typescript
   // part 结构
   {
     type: "compaction" | "subtask",
     auto: boolean,        // 是否自动触发
     messageID: string,    // 可以找到对应的 message
     sessionID: string,    // 可以找到对应的 session
     // ... 其他字段
   }
   ```

2. **process 函数通过其他参数获取 message**：
   ```typescript
   SessionCompaction.process({
     messages: msgs,        // ← 完整消息历史已经传入
     parentID: lastUser.id, // ← 触发压缩的用户消息 ID
     auto: task.auto,       // ← 只需要 part 中的这个字段
   })
   ```

3. **避免数据冗余**：`msgs` 数组已经包含了所有 message 数据，不需要再存储一份

**tasks 后续如何使用？**

```typescript
const task = tasks.pop()  // 取最新一个待处理任务

if (task?.type === "compaction") {
  // 处理压缩任务
  await SessionCompaction.process({ auto: task.auto, ... })
}

if (task?.type === "subtask") {
  // 处理子任务
  // ...
}
```

**设计思路**：tasks 是一个**待处理任务队列**，按时间倒序收集，然后用 `pop()` 取出最新的一个进行处理。

#### 4.4.4 为什么倒序遍历

**原因**:
- 倒序遍历可以快速找到最近的消息
- 找到 `lastUser` 和 `lastFinished` 后立即 `break`，提高效率
- 收集最近的待处理任务（subtask/compaction）

#### 4.4.5 没有待处理任务时的流程

**如果没有 compaction 或 subtask 类型的 part**：

`tasks` 数组为空，`tasks.pop()` 返回 `undefined`，直接进入 normal processing：

```typescript
const task = tasks.pop()  // 返回 undefined

if (task?.type === "subtask") {
  // 不进入
}

if (task?.type === "compaction") {
  // 不进入
}

// context overflow - 需要 lastFinished 存在才会触发
if (lastFinished && lastFinished.summary !== true && isOverflow(...)) {
  // 如果 lastFinished 不存在，不进入
}

// normal processing - 直接进入这里
const agent = await Agent.get(lastUser.agent)
const processor = SessionProcessor.create({...})
// ... 调用 processor.process() → 大模型 API
```

**流程图**：

```
没有 compaction/subtask part
    ↓
task = undefined
    ↓
跳过 subtask 处理
    ↓
跳过 compaction 处理
    ↓
检查是否需要自动压缩（需要 lastFinished 存在）
    ↓
进入 normal processing
    ↓
调用 processor.process() → 大模型 API
```

#### 4.4.6 有 lastAssistant 但没有 lastFinished 的情况

**什么情况下会发生？**

| 情况 | 说明 |
|------|------|
| 正在生成中 | 助手消息刚开始创建，还没有完成，`finish` 字段尚未设置 |
| 被中断 | 用户取消了请求，助手消息没有正常完成 |
| 出错 | API 调用失败，没有生成完整的响应 |

**代码判断逻辑**：

```typescript
// lastAssistant：只要有助手消息就设置
if (!lastAssistant && msg.info.role === "assistant") lastAssistant = msg.info

// lastFinished：需要有 finish 字段才设置
if (!lastFinished && msg.info.role === "assistant" && msg.info.finish)
  lastFinished = msg.info
```

**这种情况下的处理**：

```typescript
// 1. 退出循环检查 - lastAssistant.finish 不存在，不会退出
if (lastAssistant?.finish && ...) {
  break  // 不进入，继续循环
}

// 2. 自动压缩检查 - lastFinished 不存在，不会触发
if (lastFinished && lastFinished.summary !== true && isOverflow(...)) {
  await SessionCompaction.create(...)  // 不进入
}

// 3. 直接进入 normal processing，继续生成响应
```

**总结**：有 `lastAssistant` 但没有 `lastFinished` 时：
- 不会退出循环
- 不会触发自动压缩
- 直接进入 normal processing，让模型继续生成/补全响应

**未完成的 part 数据如何处理？**

进入 normal processing 时，会带着未完成助手消息的 part 数据调用大模型 API，但有特殊处理：

**位置**：`src/session/message-v2.ts:606-670`

```typescript
for (const part of msg.parts) {
  if (part.type === "text")
    assistantMessage.parts.push({ type: "text", text: part.text })

  if (part.type === "tool") {
    if (part.state.status === "completed") {
      // 已完成的工具调用 → 正常输出
      assistantMessage.parts.push({
        type: ("tool-" + part.tool),
        state: "output-available",
        input: part.state.input,
        output: part.state.output,
      })
    }

    // ★ 关键：未完成的工具调用 → 标记为中断
    if (part.state.status === "pending" || part.state.status === "running")
      assistantMessage.parts.push({
        type: ("tool-" + part.tool),
        state: "output-error",
        input: part.state.input,
        errorText: "[Tool execution was interrupted]",  // ← 特殊标记
      })
  }
}
```

**处理逻辑**：

| part 状态 | 处理方式 |
|----------|---------|
| `completed` | 正常输出，包含 input 和 output |
| `error` | 输出错误信息 |
| `pending` / `running` | 输出 `"[Tool execution was interrupted]"` |

**为什么这样处理？**

```typescript
// Handle pending/running tool calls to prevent dangling tool_use blocks
// Anthropic/Claude APIs require every tool_use to have a corresponding tool_result
```

**原因**：Anthropic API 要求每个 `tool_use` 都有对应的 `tool_result`。如果之前的工具调用没有完成，必须提供一个"假"的结果，否则 API 会报错。

**完整流程**：

```
有 lastAssistant 但没有 lastFinished
    ↓
msgs 包含未完成的助手消息（有 parts，无 finish）
    ↓
toModelMessages() 转换：
  - text parts → 正常包含
  - completed tools → 正常输出
  - pending/running tools → "[Tool execution was interrupted]"
    ↓
processor.process() 带着转换后的消息调用大模型 API
    ↓
模型看到之前的内容 + 中断标记，决定如何继续
```

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

### 7.0 概述：为什么需要 Compaction？

大模型有上下文长度限制（如 Claude 的 200K tokens），当对话历史过长时：
1. **无法继续对话**：超过模型限制会导致 API 报错
2. **成本增加**：每次请求都发送完整历史，token 消耗巨大
3. **效率降低**：模型处理大量无关历史信息

Compaction 机制通过**生成对话摘要**来解决这些问题，将长对话压缩为简洁的上下文摘要。

### 7.1 触发条件详解：完整的数据流转链路

理解 `isOverflow` 触发条件，需要追踪两个关键数据的完整流转：
1. **模型限制** (`model.limit`)：从配置到使用的完整链路
2. **Token 统计** (`tokens`)：从 API 返回到判断溢出的完整链路

#### 7.1.1 完整调用链路图

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    第一步：模型限制数据的获取链路                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  models.dev API                                                                 │
│  https://models.dev/api.json                                                    │
│       │                                                                         │
│       ▼                                                                         │
│  ModelsDev.get()                                              [src/provider/models.ts:101-104]│
│  解析 JSON，返回 Provider 列表                                                   │
│       │                                                                         │
│       ▼                                                                         │
│  fromModelsDevModel()                                         [src/provider/provider.ts:669-734]│
│  提取 model.limit: { context, input, output }                                   │
│       │                                                                         │
│       ▼                                                                         │
│  Provider.getModel(providerID, modelID)                       [获取特定模型]      │
│       │                                                                         │
│       ▼                                                                         │
│  loop() 中的:                                                  [src/session/prompt.ts:350-361]│
│  const model = await Provider.getModel(lastUser.model.providerID,               │
│                                        lastUser.model.modelID)  [:350]          │
│       │                                                                         │
│       ▼                                                                         │
│  isOverflow({ tokens, model })                                [:559]            │
│  └── model.limit.context 被使用                                                 │
│  └── model.limit.input 被使用                                                   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                    第二步：Token 统计数据的获取链路                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  模型 API 响应                                                                   │
│  Anthropic/OpenAI/etc.                                                          │
│       │                                                                         │
│       ▼                                                                         │
│  Vercel AI SDK: streamText()                                 [src/session/llm.ts:176-260]│
│  返回 StreamTextResult 对象                                                      │
│       │                                                                         │
│       ▼                                                                         │
│  stream.fullStream                                             [AI SDK 提供]    │
│  异步迭代器，产生各种事件（text-delta, tool-call, finish-step 等）                │
│       │                                                                         │
│       ▼                                                                         │
│  processor.process() 循环                                     [src/session/processor.ts:55]│
│  for await (const value of stream.fullStream)                                   │
│       │                                                                         │
│       ▼                                                                         │
│  case "finish-step":                                          [:244-285]        │
│  ┌─────────────────────────────────────────────────────────────────┐            │
│  │ const usage = Session.getUsage({                                 │            │
│  │   model: input.model,                                            │            │
│  │   usage: value.usage,          // ← 来自 AI SDK 的原始 usage 数据  │            │
│  │   metadata: value.providerMetadata                               │            │
│  │ })                                                               │            │
│  │                                                                  │            │
│  │ input.assistantMessage.tokens = usage.tokens  // ← 存入消息对象   │            │
│  │ await Session.updateMessage(input.assistantMessage)  // 持久化   │            │
│  └─────────────────────────────────────────────────────────────────┘            │
│       │                                                                         │
│       ▼                                                                         │
│  数据库 MessageTable                                                            │
│  assistantMessage.tokens 被持久化                                               │
│       │                                                                         │
│       ▼                                                                         │
│  下轮 loop() 循环                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐            │
│  │ msgs = await MessageV2.filterCompacted(MessageV2.stream())       │            │
│  │ // 从数据库读取消息历史，包含 tokens 字段                           │            │
│  │                                                                  │            │
│  │ for (let i = msgs.length - 1; i >= 0; i--) {                     │            │
│  │   if (!lastFinished && msg.info.role === "assistant" &&          │            │
│  │       msg.info.finish)                                           │            │
│  │     lastFinished = msg.info  // ← 包含 .tokens 属性              │            │
│  │ }                                                                │            │
│  └─────────────────────────────────────────────────────────────────┘            │
│       │                                                                         │
│       ▼                                                                         │
│  isOverflow({ tokens: lastFinished.tokens, model })           [:559]            │
│  └── tokens.total 被使用                                                         │
│  └── tokens.input/output/cache 被使用                                           │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### 7.1.2 模型限制的配置和读取详解

**配置源头**：`https://models.dev/api.json`

OpenCode 启动时会从 `models.dev` 拉取模型数据库：

```typescript
// src/provider/models.ts:87-99
export const Data = lazy(async () => {
  const file = Bun.file(Flag.OPENCODE_MODELS_PATH ?? filepath)
  const result = await file.json().catch(() => {})
  if (result) return result  // 优先使用本地缓存
  // ...
  const json = await fetch(`${url()}/api.json`).then((x) => x.text())
  return JSON.parse(json)
})
```

**数据结构**（models.dev 返回）：

```typescript
// src/provider/models.ts:52-56
limit: z.object({
  context: z.number(),    // 总上下文限制，如 200000
  input: z.number().optional(),   // 输入限制（部分模型有单独限制）
  output: z.number(),     // 输出限制，如 8192
})
```

**转换到内部格式**：

```typescript
// src/provider/provider.ts:701-705
limit: {
  context: model.limit.context,
  input: model.limit.input,
  output: model.limit.output,
}
```

**使用位置**：在 `loop()` 函数中通过 `lastUser.model` 获取：

```typescript
// src/session/prompt.ts:350-361
const model = await Provider.getModel(lastUser.model.providerID, lastUser.model.modelID)
// model.limit 现在可用
```

#### 7.1.3 Token 统计的获取详解

**原始来源**：模型 API 的响应

各模型提供商（Anthropic、OpenAI 等）在响应中返回 `usage` 字段：

```json
{
  "usage": {
    "input_tokens": 50000,
    "output_tokens": 3000,
    "cache_read_input_tokens": 10000,
    "cache_creation_input_tokens": 5000
  }
}
```

**Vercel AI SDK 封装**：

AI SDK 将这些数据标准化为 `LanguageModelV2Usage` 类型，并在 `finish-step` 事件中提供：

```typescript
// AI SDK 内部类型
interface LanguageModelV2Usage {
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  cachedInputTokens?: number
  totalTokens?: number
}
```

**OpenCode 处理**：`Session.getUsage()` 函数将原始 usage 转换为标准格式

```typescript
// src/session/index.ts:682-758
export const getUsage = fn(
  z.object({
    model: z.custom<Provider.Model>(),
    usage: z.custom<LanguageModelV2Usage>(),
    metadata: z.custom<ProviderMetadata>().optional(),
  }),
  (input) => {
    const inputTokens = safe(input.usage.inputTokens ?? 0)
    const outputTokens = safe(input.usage.outputTokens ?? 0)
    const reasoningTokens = safe(input.usage.reasoningTokens ?? 0)
    const cacheReadInputTokens = safe(input.usage.cachedInputTokens ?? 0)
    const cacheWriteInputTokens = safe(
      input.metadata?.["anthropic"]?.["cacheCreationInputTokens"] ?? 0
    )

    // 计算总 token
    const total = iife(() => {
      if (input.model.api.npm === "@ai-sdk/anthropic" || ...) {
        return adjustedInputTokens + outputTokens + cacheReadInputTokens + cacheWriteInputTokens
      }
      return input.usage.totalTokens
    })

    return {
      cost: /* 根据定价计算 */,
      tokens: {
        total,
        input: adjustedInputTokens,
        output: outputTokens,
        reasoning: reasoningTokens,
        cache: {
          write: cacheWriteInputTokens,
          read: cacheReadInputTokens,
        },
      },
    }
  }
)
```

**存储到消息**：

```typescript
// src/session/processor.ts:250-263
input.assistantMessage.finish = value.finishReason
input.assistantMessage.cost += usage.cost
input.assistantMessage.tokens = usage.tokens  // ← 存入消息
// ...
await Session.updateMessage(input.assistantMessage)  // ← 持久化到数据库
```

**从历史中读取**：

```typescript
// src/session/prompt.ts:317-322
for (let i = msgs.length - 1; i >= 0; i--) {
  const msg = msgs[i]
  // ...
  if (!lastFinished && msg.info.role === "assistant" && msg.info.finish)
    lastFinished = msg.info as MessageV2.Assistant  // ← 包含 .tokens
}
```

#### 7.1.4 isOverflow 函数详解

现在我们理解了数据来源，再看 `isOverflow` 函数就清晰了：

```typescript
// src/session/compaction.ts:32-48
export async function isOverflow(input: {
  tokens: MessageV2.Assistant["tokens"]  // ← 来自 lastFinished.tokens
  model: Provider.Model                   // ← 来自 Provider.getModel()
}) {
  const config = await Config.get()
  if (config.compaction?.auto === false) return false  // 用户禁用了自动压缩

  // 1. 获取模型的总上下文限制
  const context = input.model.limit.context  // 如 200000
  if (context === 0) return false  // 某些模型没有限制

  // 2. 计算当前已使用的 token 总数
  const count =
    input.tokens.total ||  // 优先使用 total
    input.tokens.input + input.tokens.output +
    input.tokens.cache.read + input.tokens.cache.write  // 否则累加各部分

  // 3. 计算需要保留的缓冲空间
  const reserved = config.compaction?.reserved ??
    Math.min(COMPACTION_BUFFER, ProviderTransform.maxOutputTokens(input.model))
  // 默认保留 min(20000, 最大输出tokens) 作为缓冲

  // 4. 计算总共可用的输入空间上限
  const usable = input.model.limit.input
    ? input.model.limit.input - reserved      // 如果有单独的输入限制
    : context - ProviderTransform.maxOutputTokens(input.model)  // 否则用总限制减输出

  // 5. 判断是否溢出
  return count >= usable  // 当前使用量 >= 可用空间 → 需要压缩
}
```

**关键变量含义**：

```typescript
const count = input.tokens.total || ...  // count: 当前已使用的 token 总数
const usable = ...                        // usable: 可用输入空间的上限（阈值）
return count >= usable                    // 已使用量 >= 上限 → 需要压缩
```

**注意**：`usable` 是"总共可用的输入空间上限"，**不是"剩余可用空间"**。

| 变量 | 含义 | 类比 |
|------|------|------|
| `count` | 当前已使用量 | 水桶里已有的水量 |
| `usable` | 可用空间上限 | 水桶的安全容量线 |
| `usable - count` | 剩余可用空间 | 还能装多少水 |

**为什么需要保留缓冲空间？**

**核心原因**：如果输入 tokens + 预期输出 tokens > 模型上下文限制，大模型 API 会直接报错（如 `context_length_exceeded`），导致对话中断。

所以必须在接近边界**之前**主动压缩，为输出预留空间。

**两种模型限制模式**：

不同模型对上下文的限制方式不同，因此计算 `usable` 的逻辑也不同：

| 模式 | 限制方式 | 例子 | 特点 |
|------|---------|------|------|
| 情况1 | 输入/输出分别限制 | input=180K, output=8K | 两个独立限制 |
| 情况2 | 总上下文限制 | context=200K | 输入+输出共享池子 |

```typescript
const usable = input.model.limit.input
  ? input.model.limit.input - reserved           // 情况1：有单独的输入限制
  : context - ProviderTransform.maxOutputTokens(input.model)  // 情况2：无单独限制
```

**情况1详解**：模型有单独的输入限制

```
input.limit = 180000  （输入最多 180K）
output.limit = 8192   （输出最多 8K）
```

为什么用 `input.limit - reserved`？

| 计算方式 | usable 值 | 触发压缩时机 |
|---------|-----------|-------------|
| 不减 reserved | 180000 | count >= 180000 时 |
| 减 reserved (20000) | 160000 | count >= 160000 时 |

**减 reserved 的目的**：在真正达到输入限制**之前**就压缩，留出安全余量：
1. 新消息可能随时进来
2. 避免"刚好踩线"的风险
3. Token 计数可能有误差

**情况2详解**：模型只有总上下文限制

```
context = 200000      （输入+输出 总共 200K）
output.limit = 8192
```

为什么用 `context - maxOutputTokens` 而不再减 reserved？

因为 `maxOutputTokens` 本身已经是一个"安全"的缓冲值，它代表了模型最大能输出的 token 数，足够容纳任何合法的输出。

```
总上下文空间 (context: 200000)
├── 可用输入空间 = context - maxOutputTokens (如 200000 - 8192 = 191808)
│   └── 当 count >= 191808 时触发压缩
└── 输出预留空间 (maxOutputTokens: 8192)
    └── 确保模型有足够空间生成响应
```

**两种情况的本质相同**：都是在"边界之前"触发压缩，只是计算边界的方式因模型限制模式不同而异。

#### 7.1.5 触发条件的完整逻辑

**位置**: `src/session/prompt.ts:556-568`

```typescript
if (
  lastFinished &&                          // 条件1: 存在已完成的助手消息
  lastFinished.summary !== true &&         // 条件2: 不是压缩摘要消息本身
  (await SessionCompaction.isOverflow({ tokens: lastFinished.tokens, model }))
)                                          // 条件3: token 超出可用空间
{
  await SessionCompaction.create({
    sessionID,
    agent: lastUser.agent,
    model: lastUser.model,
    auto: true,  // 标记为自动压缩
  })
  continue  // 跳过本轮，下轮循环会处理 compaction part
}
```

**三个条件的含义**：

| 条件 | 含义 | 为什么需要 |
|------|------|-----------|
| `lastFinished` | 存在已完成的助手消息 | 需要有 token 统计数据才能判断 |
| `lastFinished.summary !== true` | 不是压缩摘要消息 | 压缩消息本身不应该再触发压缩 |
| `isOverflow(...)` | token 超出可用空间 | 实际的溢出判断 |

**注意**：`Token.estimate()` 函数**不用于判断溢出**，只在 `prune` 函数中用于估算工具调用输出的 token 数。

### 7.2 Compaction 创建流程

#### 7.2.1 SessionCompaction.create 函数

**位置**: `src/session/compaction.ts:231-260`

```typescript
export const create = fn(
  z.object({
    sessionID: Identifier.schema("session"),
    agent: z.string(),
    model: z.object({ providerID: z.string(), modelID: z.string() }),
    auto: z.boolean(),
  }),
  async (input) => {
    // 1. 创建用户消息
    const msg = await Session.updateMessage({
      id: Identifier.ascending("message"),
      role: "user",
      model: input.model,
      sessionID: input.sessionID,
      agent: input.agent,
      time: { created: Date.now() },
    })

    // 2. 创建 compaction part
    await Session.updatePart({
      id: Identifier.ascending("part"),
      messageID: msg.id,
      sessionID: msg.sessionID,
      type: "compaction",
      auto: input.auto,  // 记录是否自动压缩
    })
  },
)
```

**执行结果**：
- 向 `message` 表插入**一条**用户消息
- 向 `part` 表插入**一条** `compaction` 类型的 part

#### 7.2.2 循环如何获取 compaction 数据

`continue` 后，下轮循环开始时：

```typescript
let msgs = await MessageV2.filterCompacted(MessageV2.stream(sessionID))
```

`MessageV2.stream()` 从数据库读取所有消息（包括刚插入的 compaction 消息），然后 `filterCompacted` 过滤已压缩的历史。

#### 7.2.3 tasks 数组的收集

**位置**: `src/session/prompt.ts:315-328`

```typescript
let tasks: (MessageV2.CompactionPart | MessageV2.SubtaskPart)[] = []

for (let i = msgs.length - 1; i >= 0; i--) {
  const msg = msgs[i]
  // ... 查找 lastUser, lastAssistant, lastFinished

  // 收集未完成前的所有 compaction/subtask parts
  const task = msg.parts.filter((part) => part.type === "compaction" || part.type === "subtask")
  if (task && !lastFinished) {
    tasks.push(...task)
  }
}

const task = tasks.pop()  // 取最新一个待处理任务
```

#### 7.2.4 compaction 的两种创建方式

**所有 compaction part 都通过 `SessionCompaction.create` 插入**，但有两种触发方式：

| 方式 | 触发位置 | `auto` 值 | 触发条件 |
|------|---------|----------|---------|
| 自动压缩 | `prompt.ts:561` 或 `prompt.ts:721` | `true` | token 溢出（`isOverflow` 返回 true） |
| 手动压缩 | `session.ts:530` | `false`（默认） | 用户调用 `/compact` 命令或 API |

**手动压缩的 API 入口**：

**位置**：`src/server/routes/session.ts:508-542`

```typescript
.post(
  "/:sessionID/summarize",
  validator("json", z.object({
    providerID: z.string(),
    modelID: z.string(),
    auto: z.boolean().optional().default(false),  // ← 默认 false
  })),
  async (c) => {
    const body = c.req.valid("json")
    await SessionCompaction.create({
      sessionID,
      agent: currentAgent,
      model: { providerID: body.providerID, modelID: body.modelID },
      auto: body.auto,  // ← 用户传入，默认 false
    })
    await SessionPrompt.loop({ sessionID })
  }
)
```

**`auto` 参数对后续处理的影响**：

| `auto` 值 | 压缩完成后的行为 |
|----------|----------------|
| `true` | 创建 "Continue if you have next steps..." 合成消息，模型自动继续 |
| `false` | 不创建合成消息，直接返回，等待用户下一步输入 |

### 7.3 Compaction 处理流程

#### 7.3.1 处理入口

**位置**: `src/session/prompt.ts:543-553`

```typescript
if (task?.type === "compaction") {
  const result = await SessionCompaction.process({
    messages: msgs,
    parentID: lastUser.id,
    abort,
    sessionID,
    auto: task.auto,  // 从 part 中读取 auto 标记
  })
  if (result === "stop") break
  continue
}
```

#### 7.3.2 task 的含义

1. **`task = tasks.pop()`**：取出最新一条待处理的 part（compaction 或 subtask）
2. **`task.auto`**：标记这是**自动触发**还是**手动触发**的压缩
   - `true`：由 `isOverflow` 自动触发
   - `false`：用户手动调用 `/compact` 命令

#### 7.3.3 为什么传递 msgs 而不是 task

`SessionCompaction.process` 需要：
- **完整的历史消息** `msgs`：用于生成对话摘要
- **不需要 task 参数**：因为 `parentID` 已经标识了触发压缩的用户消息

`task` 只是用于判断类型和读取 `auto` 标记，处理函数内部通过 `parentID` 找到对应的用户消息。

### 7.4 SessionCompaction.process 函数详解

#### 7.4.1 函数签名

**位置**: `src/session/compaction.ts:101-229`

```typescript
export async function process(input: {
  parentID: string              // 触发压缩的用户消息 ID
  messages: MessageV2.WithParts[]  // 完整历史消息
  sessionID: string
  abort: AbortSignal
  auto: boolean                 // 是否自动压缩
})
```

#### 7.4.2 compacting.prompt 和 compacting.context 的生成

```typescript
// 1. 允许插件注入或修改压缩提示词
const compacting = await Plugin.trigger(
  "experimental.session.compacting",
  { sessionID: input.sessionID },
  { context: [], prompt: undefined },  // 默认值
)

// 2. 默认提示词模板
const defaultPrompt = `Provide a detailed prompt for continuing our conversation above.
Focus on information that would be helpful for continuing the conversation...

When constructing the summary, try to stick to this template:
---
## Goal
[What goal(s) is the user trying to accomplish?]

## Instructions
[What important instructions did the user give you...]

## Discoveries
[What notable things were learned...]

## Accomplished
[What work has been completed...]

## Relevant files / directories
[Construct a structured list of relevant files...]
---`

// 3. 合并提示词
const promptText = compacting.prompt ?? [defaultPrompt, ...compacting.context].join("\n\n")
```

**生成逻辑**：
- 如果插件提供了 `prompt`，使用插件的
- 否则使用 `defaultPrompt` + 插件提供的 `context` 数组

#### 7.4.3 压缩摘要的生成

```typescript
// 1. 找到触发压缩的用户消息
const userMessage = input.messages.findLast((m) => m.info.id === input.parentID)!.info

// 2. 获取 compaction agent
const agent = await Agent.get("compaction")

// 3. 创建助手消息（用于存放摘要）
const msg = await Session.updateMessage({
  id: Identifier.ascending("message"),
  role: "assistant",
  parentID: input.parentID,
  sessionID: input.sessionID,
  mode: "compaction",
  agent: "compaction",
  summary: true,  // ★ 关键：标记为压缩摘要消息
  // ...
})

// 4. 调用模型生成摘要
const processor = SessionProcessor.create({ assistantMessage: msg, ... })

const result = await processor.process({
  user: userMessage,
  agent,
  messages: [
    ...MessageV2.toModelMessages(input.messages, model),  // 历史消息
    { role: "user", content: [{ type: "text", text: promptText }] },  // 压缩提示
  ],
  tools: {},  // 压缩时不使用工具
  system: [],
  model,
})
```

#### 7.4.4 result === "continue" 的情况

`processor.process()` 返回 `"continue"` 的条件：

**位置**: `src/session/processor.ts:412-415`

```typescript
if (needsCompaction) return "compact"
if (blocked) return "stop"
if (input.assistantMessage.error) return "stop"
return "continue"  // ★ 默认返回 continue
```

**返回 "continue"**：模型正常完成摘要生成，没有错误，没有被阻止。

#### 7.4.5 result === "continue" && input.auto 的处理

```typescript
if (result === "continue" && input.auto) {
  // 1. 创建新的用户消息
  const continueMsg = await Session.updateMessage({
    id: Identifier.ascending("message"),
    role: "user",
    sessionID: input.sessionID,
    agent: userMessage.agent,
    model: userMessage.model,
    time: { created: Date.now() },
  })

  // 2. 创建文本 part
  await Session.updatePart({
    id: Identifier.ascending("part"),
    messageID: continueMsg.id,
    sessionID: input.sessionID,
    type: "text",
    synthetic: true,  // ★ 标记为合成消息
    text: "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.",
    time: { start: Date.now(), end: Date.now() },
  })
}
```

**"stop and ask for clarification" 如何工作？**

这段文本**不是直接添加到提示词**，而是通过**插入一条合成的用户消息**到数据库，下轮循环读取后发送给模型。

**添加位置**：`src/session/compaction.ts:202-224`

```typescript
if (result === "continue" && input.auto) {
  // 1. 创建一条新的用户消息
  const continueMsg = await Session.updateMessage({
    id: Identifier.ascending("message"),
    role: "user",
    sessionID: input.sessionID,
    agent: userMessage.agent,
    model: userMessage.model,
  })

  // 2. 创建一个 text part，标记为合成消息
  await Session.updatePart({
    messageID: continueMsg.id,
    type: "text",
    synthetic: true,  // ← 标记为合成消息（不是用户真实输入）
    text: "Continue if you have next steps, or stop and ask for clarification...",
  })
}
```

**完整数据流程**：

```
compaction 完成摘要生成 (result === "continue")
    ↓
创建合成用户消息，内容是 "Continue if you have next steps..."
    ↓
持久化到数据库 (MessageTable + PartTable)
    ↓
下一轮 loop 循环
    ↓
MessageV2.filterCompacted() 读取消息历史
    ↓
包含这条合成消息
    ↓
MessageV2.toModelMessages() 转换
    ↓
发送给模型
```

**模型看到的对话历史**：

```json
[
  { "role": "user", "content": [...] },           // 触发压缩的用户消息（有 compaction part）
  { "role": "assistant", "content": "## Goal\n..." },  // 压缩摘要（summary: true）
  { "role": "user", "content": "Continue if you have next steps, or stop and ask for clarification..." }  // 合成消息
]
```

**模型根据提示决定**：
- 继续执行下一步
- 或停下来询问用户（通过 question 工具或直接 `finish: "stop"`）

**不是强制暂停**，而是让模型自己判断是否需要用户确认。

#### 7.4.6 updateMessage 和 updatePart 的行为

**位置**: `src/session/index.ts:581-601` 和 `src/session/index.ts:646-666`

```typescript
// 使用 SQLite 的 UPSERT 语法
db.insert(MessageTable)
  .values({...})
  .onConflictDoUpdate({ target: MessageTable.id, set: { data } })
  .run()
```

**行为**：
- **新 ID**：插入新记录
- **已存在的 ID**：更新现有记录

**在 compaction 中的使用**：
- 创建的压缩摘要消息使用新 ID，所以是**插入**
- 后续循环通过 `MessageV2.stream()` 读取到这些新数据

#### 7.4.7 processor.message.error 什么时候不为空

**位置**: `src/session/processor.ts:350-377`

```typescript
} catch (e: any) {
  const error = MessageV2.fromError(e, { providerID: input.model.providerID })

  // 如果不是可重试的错误
  const retry = Session_retry.retryable(error)
  if (retry !== undefined) {
    // 重试逻辑...
    continue
  }

  // 记录错误
  input.assistantMessage.error = error
  Bus.publish(Session.Event.Error, { sessionID, error })
  SessionStatus.set(sessionID, { type: "idle" })
}

// 返回检查
if (input.assistantMessage.error) return "stop"
```

**error 不为空的情况**：
1. **API 调用失败**：网络错误、认证错误、速率限制等
2. **上下文溢出**：`ContextOverflowError`
3. **输出长度超限**：`OutputLengthError`
4. **用户中止**：`AbortedError`
5. **其他不可重试的错误**

**可重试的错误不会导致 stop**，会自动重试。

### 7.5 压实的是什么数据

#### 7.5.1 压实的粒度

**压实的是对话历史，通过 Message 的 `summary` 字段标记分界点。**

不是删除或修改原始数据，而是：
1. **创建新的摘要消息**（`summary: true` 的助手消息）
2. **`filterCompacted` 读取时截断历史**

#### 7.5.2 filterCompacted 的工作原理

**位置**: `src/session/message-v2.ts:794-813`

```typescript
export async function filterCompacted(stream: AsyncIterable<MessageV2.WithParts>) {
  const result = [] as MessageV2.WithParts[]
  const completed = new Set<string>()

  for await (const msg of stream) {
    result.push(msg)

    // 情况1: 遇到 compaction part，且其父消息已完成 → 停止收集
    if (
      msg.info.role === "user" &&
      completed.has(msg.info.id) &&
      msg.parts.some((part) => part.type === "compaction")
    )
      break

    // 情况2: 助手消息有 summary 和 finish → 标记父消息完成
    if (msg.info.role === "assistant" && msg.info.summary && msg.info.finish)
      completed.add(msg.info.parentID)
  }

  result.reverse()
  return result
}
```

**工作流程**：
1. 倒序遍历消息（最新在前）
2. 遇到 `summary: true && finish` 的助手消息 → 记录其 `parentID`
3. 遇到用户消息有 `compaction` part 且 `parentID` 已完成 → 停止
4. 反转返回（时间正序）

#### 7.5.3 压实后的数据结构

```
压缩前的历史（被截断，不发送给模型）:
┌─────────────────────────────────────────┐
│ User: "帮我实现功能A"                     │
│ Assistant: "好的，我来..."               │
│ User: "继续"                             │
│ Assistant: "功能A已完成..."              │
│ ...（大量历史）                           │
└─────────────────────────────────────────┘

压缩后发送给模型的历史:
┌─────────────────────────────────────────┐
│ User: [compaction part]                 │
│ Assistant (summary: true):              │
│   "## Goal                              │
│    实现功能A                             │
│    ## Accomplished                      │
│    功能A已完成...                        │
│    ## Next                              │
│    需要继续实现功能B..."                  │
│ User (synthetic):                       │
│   "Continue if you have next steps..."  │
└─────────────────────────────────────────┘
```

#### 7.5.4 为什么需要 summary 和 finish 两个条件

```typescript
if (msg.info.role === "assistant" && msg.info.summary && msg.info.finish)
  completed.add(msg.info.parentID)
```

- **`summary: true`**：标记这是压缩摘要消息
- **`finish`**：确保模型已经完成摘要生成（不是中断的）

两个条件都满足，才认为这个压缩点是有效的，可以截断历史。

**`finish` 字段何时被设置？**

**位置**：`src/session/processor.ts:250`

```typescript
case "finish-step":
  // ...
  input.assistantMessage.finish = value.finishReason  // ← 从 AI SDK 获取
  // ...
  await Session.updateMessage(input.assistantMessage)  // 持久化到数据库
```

**数据流程**：

```
模型 API 响应
    ↓
AI SDK (streamText) 返回 finishReason
    ↓
finish-step 事件触发
    ↓
processor.process() 处理
    ↓
assistantMessage.finish = value.finishReason
    ↓
Session.updateMessage() 持久化
```

**finishReason 的可能值**：

| 值 | 含义 |
|---|------|
| `"stop"` | 正常结束（没有工具调用） |
| `"tool-calls"` | 模型调用了工具 |
| `"length"` | 达到最大 token 限制 |
| `"content-filter"` | 内容被过滤 |

所以 `finish` 是在**模型完成响应时**由 API 返回并设置的，表示模型结束的原因。对于 compaction，通常 `finish` 值为 `"stop"`。

### 7.6 完整的 Compaction 流程图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          loop() 主循环                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. 检查是否触发压缩                                                     │
│     ┌──────────────────────────────────────────────────────────────┐   │
│     │ if (lastFinished &&                                          │   │
│     │     lastFinished.summary !== true &&                         │   │
│     │     isOverflow({ tokens, model }))                           │   │
│     │ {                                                            │   │
│     │   SessionCompaction.create({ auto: true })                   │   │
│     │   continue                                                   │   │
│     │ }                                                            │   │
│     └──────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│  2. 下轮循环检测到 compaction part                                       │
│     ┌──────────────────────────────────────────────────────────────┐   │
│     │ if (task?.type === "compaction")                             │   │
│     │   SessionCompaction.process({ auto: task.auto })             │   │
│     └──────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│  3. process() 内部                                                       │
│     ┌──────────────────────────────────────────────────────────────┐   │
│     │ a. 创建 summary: true 的助手消息                              │   │
│     │ b. 调用 compaction agent 生成摘要                             │   │
│     │ c. 如果 auto，创建 "Continue..." 合成用户消息                  │   │
│     │ d. return "continue"                                          │   │
│     └──────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│  4. 下轮循环 filterCompacted() 截断历史                                  │
│     ┌──────────────────────────────────────────────────────────────┐   │
│     │ 只返回:                                                       │   │
│     │   - 压缩摘要消息                                              │   │
│     │   - "Continue..." 用户消息                                    │   │
│     │   - 压缩后的新消息                                            │   │
│     └──────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│  5. 正常处理流程继续...                                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.7 prune 函数：清理旧工具输出

**位置**: `src/session/compaction.ts:58-99`

除了压缩摘要，还有一个 `prune` 函数用于清理旧的工具调用输出：

```typescript
export async function prune(input: { sessionID: string }) {
  // 从后向前遍历，保留最近 40000 tokens 的工具输出
  for (let msgIndex = msgs.length - 1; msgIndex >= 0; msgIndex--) {
    for (let partIndex = msg.parts.length - 1; partIndex >= 0; partIndex--) {
      const part = msg.parts[partIndex]
      if (part.type === "tool" && part.state.status === "completed") {
        const estimate = Token.estimate(part.state.output)
        total += estimate
        if (total > PRUNE_PROTECT) {  // 40000
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

**清理的是什么？**

| 维度 | 答案 |
|------|------|
| 操作级别 | **Part 级别**（tool 类型的 part） |
| 设置什么 | `part.state.time.compacted` 字段（时间戳） |
| 原始数据 | **保留在数据库中**，不删除 |
| 实际效果 | 转换为模型消息时，用占位符替换输出内容 |

**`Session.updatePart` 如何更新数据？**

**位置**：`src/session/index.ts:646-667`

```typescript
export const updatePart = fn(UpdatePartInput, async (part) => {
  const { id, messageID, sessionID, ...data } = part  // ← 解构，data 包含所有其他字段
  Database.use((db) => {
    db.insert(PartTable)
      .values({
        id,
        message_id: messageID,
        session_id: sessionID,
        data,  // ← 整个 data 对象被序列化存储
      })
      .onConflictDoUpdate({ target: PartTable.id, set: { data } })
      .run()
  })
})
```

**`...data` 解构的作用**：

```typescript
const { id, messageID, sessionID, ...data } = part
```

- `id`, `messageID`, `sessionID` → 存到数据库的**独立列**
- **剩余所有字段**（`type`, `state`, `state.time.compacted` 等）→ 打包到 `data` 对象
- `data` 被序列化为 JSON 存储到数据库的 `data` 列

**数据库存储结构**：

```
PartTable:
├── id (列)
├── message_id (列)
├── session_id (列)
├── time_created (列)
└── data (列) ← JSON 字段，包含 { type, state: { time: { compacted: ... } } }
```

所以 `updatePart` 不需要逐个读取字段，而是把整个 part 对象（除了 ID 字段）序列化后直接存储。

**实际清理发生在哪里？**

**位置**：`src/session/message-v2.ts:620-621`

```typescript
// 转换为模型消息时
const outputText = part.state.time.compacted
  ? "[Old tool result content cleared]"  // 已清理：用占位符替换
  : part.state.output                     // 未清理：原样输出

const attachments = part.state.time.compacted
  ? []                                    // 已清理：清空附件
  : (part.state.attachments ?? [])        // 未清理：原样保留
```

这是一种**"软删除"机制**：原始数据保留在数据库中，但在发送给模型时被替换为占位符，减少上下文 token 消耗。

**与 compaction 的区别**：
- **compaction**：生成对话摘要，通过 `summary` 标记截断历史
- **prune**：清理旧工具输出，减少上下文中的冗余内容

### 7.8 配置选项

```json
{
  "compaction": {
    "auto": true,      // 是否自动压缩（默认 true）
    "reserved": 20000, // 保留的缓冲空间（默认 min(20000, maxOutputTokens)）
    "prune": true      // 是否启用工具输出清理（默认 true）
  }
}
```

### 7.9 总结

| 问题 | 答案 |
|------|------|
| 模型限制在哪里配置 | `models.dev` 数据库 + 本地 `opencode.json` 覆盖 |
| 限制针对什么 | **整个对话历史**，通过最近助手消息的 `tokens` 统计 |
| Token 如何计算 | **API 返回的实际值**，不是字符估算 |
| create 做什么 | 插入一条用户消息 + 一条 compaction part |
| 循环如何获取 | `filterCompacted` 从数据库读取，检测 compaction part |
| task 来自哪里 | **只有 create 插入**，但有两种触发方式：自动（token 溢出）或手动（`/compact` 命令） |
| task.auto 含义 | `true` = 自动压缩，创建合成消息继续；`false` = 手动压缩，等待用户输入 |
| 为什么传 msgs | 需要**完整历史**来生成摘要 |
| prompt 如何生成 | 默认模板 + 插件可覆盖/扩展 |
| result === "continue" | 模型正常完成，无错误 |
| "stop and ask" | 发送给**模型**的提示，让模型决定是否需要用户确认 |
| update 行为 | **Upsert**（插入或更新），compaction 中是插入新数据 |
| error 何时非空 | API 错误、中止、溢出等**不可恢复错误** |
| 压实什么 | **Message**（通过 `summary` 标记），不删除原始数据 |
| 压实后效果 | `filterCompacted` 只返回压缩点之后的历史 |

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

#### 8.2.1 fullStream 的事件类型

`stream.fullStream` 中的 `value.type` 是 **AI SDK 格式化后的统一结构**，不是大模型 API 直接返回的原始格式。

**value.type 的可能值**：

| 事件类型 | 含义 |
|---------|------|
| `start` | 流开始 |
| `reasoning-start` | 推理开始（如 Claude 的 thinking） |
| `reasoning-delta` | 推理内容增量 |
| `reasoning-end` | 推理结束 |
| `text-start` | 文本开始 |
| `text-delta` | 文本增量 |
| `text-end` | 文本结束 |
| `tool-call` | 工具调用 |
| `tool-result` | 工具结果 |
| `finish-step` | 步骤完成（包含 usage、finishReason） |
| `error` | 错误 |

#### 8.2.2 AI SDK 的架构和转换

不同模型 API 返回的原始格式不同，AI SDK 将它们统一转换为标准格式：

**AI SDK 架构**：

```
┌─────────────────────────────────────────────────────────────┐
│                     OpenCode 代码                            │
│  stream.fullStream → value.type = "text-delta", "tool-call" │
└─────────────────────────────────────────────────────────────┘
                              ↑ 统一格式
┌─────────────────────────────────────────────────────────────┐
│                    ai 包 (核心 SDK)                          │
│  streamText() → 返回 StreamTextResult.fullStream            │
└─────────────────────────────────────────────────────────────┘
                              ↑ 调用 doStream()
┌─────────────────────────────────────────────────────────────┐
│                 @ai-sdk/provider (接口定义)                  │
│  LanguageModelV2.doStream() → 返回统一格式的 Stream          │
└─────────────────────────────────────────────────────────────┘
                              ↑ 实现
┌──────────────────┬──────────────────┬───────────────────────┐
│ @ai-sdk/anthropic│ @ai-sdk/openai   │ @ai-sdk/google        │
│                  │                  │                       │
│ Anthropic API    │ OpenAI API       │ Google API            │
│ 原始响应         │ 原始响应         │ 原始响应              │
│      ↓           │      ↓           │      ↓                │
│ 转换为统一格式   │ 转换为统一格式   │ 转换为统一格式        │
└──────────────────┴──────────────────┴───────────────────────┘
```

**不同提供商的原始事件对比**：

| 提供商 | 原始事件类型 |
|-------|-------------|
| Anthropic | `content_block_start`, `content_block_delta`, `message_stop` |
| OpenAI | `response.created`, `response.output_item.added` |
| Google | `generateContentResponse` |

**转换示例**（`@ai-sdk/anthropic` 内部实现，伪代码）：

```typescript
// @ai-sdk/anthropic 内部实现
async *doStream({ prompt }) {
  // 1. 调用 Anthropic API
  const response = await anthropic.messages.stream({
    model: "claude-3-opus",
    messages: prompt,
  })

  // 2. 转换为统一格式
  for await (const event of response) {
    switch (event.type) {
      case "content_block_start":
        yield { type: "text-start", id: event.index }
        break
      case "content_block_delta":
        yield { type: "text-delta", delta: event.delta.text }
        break
      case "message_stop":
        yield { type: "finish-step", finishReason: "stop" }
        break
    }
  }
}
```

**项目中的依赖**：

```
package.json:
├── ai                      # 核心 SDK，提供 streamText()
├── @ai-sdk/provider        # 接口定义
├── @ai-sdk/anthropic       # Anthropic → 统一格式
├── @ai-sdk/openai          # OpenAI → 统一格式
├── @ai-sdk/google          # Google → 统一格式
├── @ai-sdk/amazon-bedrock  # Bedrock → 统一格式
└── ... 其他 provider
```

**各层职责**：

| 层级 | 职责 |
|------|------|
| `ai` 包 | 提供 `streamText()` 和 `fullStream` 接口 |
| `@ai-sdk/provider` | 定义统一的事件类型（`text-delta`、`tool-call` 等） |
| `@ai-sdk/anthropic` 等 | 将特定 API 响应转换为统一格式 |

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

#### 9.2.1 文件查找优先级

**FILES 数组定义了查找顺序**：`["AGENTS.md", "CLAUDE.md", "CONTEXT.md"]`

**位置**：`src/session/instruction.ts:13-17`

```typescript
const FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  "CONTEXT.md", // deprecated
]
```

#### 9.2.2 项目目录查找（替换关系）

**位置**：`src/session/instruction.ts:75-84`

```typescript
for (const file of FILES) {
  const matches = await Filesystem.findUp(file, Instance.directory, Instance.worktree)
  if (matches.length > 0) {
    matches.forEach((p) => { paths.add(path.resolve(p)) })
    break  // ← 关键：找到第一个存在的文件类型就停止
  }
}
```

**查找逻辑**：
1. 在当前目录向上查找 `AGENTS.md`
2. 如果没找到，在当前目录向上查找 `CLAUDE.md`
3. 如果没找到，在当前目录向上查找 `CONTEXT.md`
4. 找到任意一个就**停止**查找其他文件名

**是替换关系**：当前目录有 `AGENTS.md` 就不会查找 `CLAUDE.md` 和 `CONTEXT.md`。

#### 9.2.3 全局目录查找

**位置**：`src/session/instruction.ts:19-29, 87-92`

```typescript
function globalFiles() {
  const files = []
  if (Flag.OPENCODE_CONFIG_DIR) {
    files.push(path.join(Flag.OPENCODE_CONFIG_DIR, "AGENTS.md"))
  }
  files.push(path.join(Global.Path.config, "AGENTS.md"))
  if (!Flag.OPENCODE_DISABLE_CLAUDE_CODE_PROMPT) {
    files.push(path.join(os.homedir(), ".claude", "CLAUDE.md"))
  }
  return files
}

for (const file of globalFiles()) {
  if (await Bun.file(file).exists()) {
    paths.add(path.resolve(file))
    break  // ← 找到第一个存在的就停止
  }
}
```

#### 9.2.4 项目目录和全局目录的关系（叠加关系）

| 来源 | 结果 |
|------|------|
| 项目目录 | 找到一个文件（AGENTS.md 或 CLAUDE.md 或 CONTEXT.md） |
| 全局目录 | 找到一个文件 |
| **最终** | 两个文件**叠加**（如果都存在） |

**不是替换**：当前目录有 `CLAUDE.md` **不会阻止**查找全局目录的文件。

#### 9.2.5 文件都不存在时

如果所有指令文件都不存在：
- `paths` 为空 Set
- `InstructionPrompt.system()` 返回空内容
- 只使用 agent 默认提示词 + 环境信息 + 用户输入

### 9.3 使用方式

**位置**: `src/session/prompt.ts:667`

```typescript
const system = [
  ...(await SystemPrompt.environment(model)),  // 环境信息
  ...(await InstructionPrompt.system())        // 指令文件
]
```

### 9.4 完整的 system 提示词组成

#### 9.4.1 system 提示词的堆栈

**位置**：`src/session/llm.ts:67-79`

```typescript
const system = []
system.push(
  [
    // 1. agent 提示词 或 提供商默认提示词
    ...(input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model)),
    // 2. 环境信息 + 指令文件内容（来自 prompt.ts）
    ...input.system,
    // 3. 用户消息中的自定义系统提示词
    ...(input.user.system ? [input.user.system] : []),
  ]
    .filter((x) => x)
    .join("\n"),
)
```

**system 提示词堆栈**：

```
┌─────────────────────────────────────────────────────────────┐
│                      system 提示词                          │
├─────────────────────────────────────────────────────────────┤
│ 1. agent.prompt 或 SystemPrompt.provider(model)            │
│    - agent 自定义提示词，或根据模型提供商返回默认提示词       │
├─────────────────────────────────────────────────────────────┤
│ 2. SystemPrompt.environment(model)                          │
│    - 模型信息、工作目录、平台、日期等                        │
├─────────────────────────────────────────────────────────────┤
│ 3. InstructionPrompt.system()                               │
│    - AGENTS.md / CLAUDE.md / CONTEXT.md 内容               │
├─────────────────────────────────────────────────────────────┤
│ 4. user.system                                              │
│    - 用户消息中附带的自定义系统提示词                        │
└─────────────────────────────────────────────────────────────┘
```

#### 9.4.2 agent.prompt 的来源

从 agent 配置中获取，不同 agent 有不同的提示词：

```typescript
// agent.ts 中的定义
export const AgentSchema = z.object({
  name: z.string(),
  prompt: z.string().optional(),  // ← 自定义提示词
  // ...
})

// 内置 Agent 示例
const agents = {
  build: { prompt: "You are a helpful coding assistant..." },
  plan: { prompt: "You are a planning assistant..." },
  compaction: { prompt: "Summarize the conversation..." },
  // ...
}
```

#### 9.4.3 调用 API 时的消息结构

**位置**：`src/session/llm.ts:229-237`

```typescript
messages: [
  ...system.map((x): ModelMessage => ({
    role: "system",   // ← 明确是 system 角色
    content: x,
  })),
  ...input.messages,  // ← 用户消息历史（user/assistant 交替）
]
```

**系统提示词和用户输入不在同一个字段**：
- `system` → `{ role: "system", content: "..." }`
- `input.messages` → `{ role: "user/assistant", content: "..." }`

#### 9.4.4 总结

| 问题 | 答案 |
|------|------|
| agent.prompt 是系统还是用户提示词？ | **系统提示词**，`role: "system"` |
| 系统提示词和用户输入是否同字段？ | **不是**，分开传递给 AI SDK |
| 存在 AGENTS.md 是否替换 agent.prompt？ | **不是替换，是叠加**，都会被使用 |
| agent.prompt 从哪获取？ | agent 配置中定义，不同 agent 有不同提示词 |

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

### 10.3 streamText 参数详解

**位置**: `src/session/llm.ts:176-259`

#### 10.3.1 完整参数列表

```typescript
return streamText({
  onError(error) { ... },
  async experimental_repairToolCall(failed) { ... },
  temperature: params.temperature,
  topP: params.topP,
  topK: params.topK,
  providerOptions: ProviderTransform.providerOptions(input.model, params.options),
  activeTools: Object.keys(tools).filter((x) => x !== "invalid"),
  tools,
  toolChoice: input.toolChoice,
  maxOutputTokens,
  abortSignal: input.abort,
  headers: { ... },
  maxRetries: input.retries ?? 0,
  messages: [
    ...system.map((x) => ({ role: "system", content: x })),
    ...input.messages,
  ],
  model: wrapLanguageModel({ model: language, middleware: [...] }),
  experimental_telemetry: { ... },
})
```

#### 10.3.2 参数说明总览

| 参数 | 类型 | 用途 |
|------|------|------|
| `onError` | 回调函数 | 流式请求出错时的处理函数，记录错误日志 |
| `experimental_repairToolCall` | 回调函数 | 工具调用失败时的修复逻辑 |
| `temperature` | number (0-2) | 控制输出随机性，值越高越随机 |
| `topP` | number (0-1) | nucleus sampling，限制候选 token 的累积概率 |
| `topK` | number | top-k sampling，限制候选 token 的数量 |
| `providerOptions` | object | 提供商特定选项（如 Anthropic 缓存配置） |
| `activeTools` | string[] | 当前会话中**允许被自动调用**的工具列表 |
| `tools` | object | 所有可用工具的定义 |
| `toolChoice` | "auto" \| "required" \| "none" | 工具选择策略 |
| `maxOutputTokens` | number | 模型输出的最大 token 数 |
| `abortSignal` | AbortSignal | 用于中止请求的信号 |
| `headers` | object | 自定义 HTTP 请求头 |
| `maxRetries` | number | 请求失败时的最大重试次数 |
| `messages` | ModelMessage[] | 对话消息历史 |
| `model` | LanguageModel | AI SDK 的语言模型实例 |
| `experimental_telemetry` | object | OpenTelemetry 遥测配置 |

#### 10.3.3 关键参数详解

**1. temperature / topP / topK（生成控制）**

```typescript
temperature: input.agent.temperature ?? ProviderTransform.temperature(input.model),
topP: input.agent.topP ?? ProviderTransform.topP(input.model),
topK: ProviderTransform.topK(input.model),
```

| 参数 | 范围 | 说明 |
|------|------|------|
| `temperature` | 0-2 | 越高越有创意，0 = 贪婪解码（最确定） |
| `topP` | 0-1 | 0.9 表示只考虑累积概率前 90% 的 token |
| `topK` | 正整数 | 只考虑概率最高的 K 个 token |

**2. tools / activeTools / toolChoice（工具调用）**

```typescript
tools,                                                    // 所有可用工具定义
activeTools: Object.keys(tools).filter((x) => x !== "invalid"),  // 允许自动调用的
toolChoice: input.toolChoice,                             // 工具选择策略
```

| 参数 | 说明 |
|------|------|
| `tools` | 工具定义对象，包含 name、description、inputSchema、execute |
| `activeTools` | 哪些工具可以被模型**自动选择**调用 |
| `toolChoice` | `"auto"`：模型自己决定；`"required"`：必须调用；`"none"`：禁止调用 |

**3. experimental_repairToolCall（工具修复）**

```typescript
async experimental_repairToolCall(failed) {
  const lower = failed.toolCall.toolName.toLowerCase()
  if (lower !== failed.toolCall.toolName && tools[lower]) {
    // 修复大小写问题：模型调用 "Read" → 修复为 "read"
    return { ...failed.toolCall, toolName: lower }
  }
  // 无法修复，标记为无效工具
  return { ...failed.toolCall, toolName: "invalid" }
}
```

用途：当模型调用工具名大小写不匹配时，自动修复或标记为无效。

**4. model + middleware（模型包装）**

```typescript
model: wrapLanguageModel({
  model: language,
  middleware: [{
    async transformParams(args) {
      if (args.type === "stream") {
        // 在发送前转换消息格式
        args.params.prompt = ProviderTransform.message(args.params.prompt, input.model, options)
      }
      return args.params
    },
  }],
})
```

**三个关键概念**：

| 概念 | 含义 |
|------|------|
| `language` | `LanguageModelV2` 实例，封装了如何调用特定模型 API |
| `wrapLanguageModel` | AI SDK 函数，包装语言模型，添加中间件功能 |
| `middleware` | 中间件数组，在请求发送前后对参数进行转换 |

**language 是什么？**

`language` 是 `LanguageModelV2` 类型，代表一个可调用的大模型实例。

```typescript
// llm.ts:60
const [language, cfg, provider, auth] = await Promise.all([
  Provider.getLanguage(input.model),  // ← 获取语言模型实例
  // ...
])

// provider.ts:1171-1196
export async function getLanguage(model: Model): Promise<LanguageModelV2> {
  const sdk = await getSDK(model)  // 获取 SDK（如 @ai-sdk/anthropic）

  // 创建语言模型实例
  const language = sdk.languageModel(model.api.id)  // 如 anthropic("claude-3-opus")
  return language
}
```

**language 的本质**：
- 对于 Anthropic：`anthropic("claude-3-opus")` 返回的对象
- 对于 OpenAI：`openai("gpt-4")` 返回的对象
- 它封装了**如何调用特定模型 API** 的所有逻辑

**wrapLanguageModel 的用途**：

`wrapLanguageModel` 是 AI SDK 提供的函数，用于包装语言模型，添加中间件功能：

- 不改变原始语言模型的能力
- 在调用前后插入自定义逻辑（中间件）
- 类似于 Express.js 的中间件概念

**middleware 的工作流程**：

```
streamText() 调用
    ↓
wrapLanguageModel 拦截
    ↓
middleware.transformParams() 执行
    ↓
修改 args.params（如消息格式转换）
    ↓
返回转换后的参数
    ↓
实际调用模型 API
```

**为什么要用 middleware？**

不同模型提供商有不同的消息格式要求。`ProviderTransform.message` 会：
- 调整消息格式
- 添加特定提供商需要的字段
- 处理特殊情况（如缓存标记）

**举例**：
```typescript
// 原始消息
{ role: "user", content: "hello" }

// 转换后（针对特定提供商）
{ role: "user", content: [{ type: "text", text: "hello" }], cache_control: { ... } }
```

**类比**：
- `language` = 真实的电话
- `wrapLanguageModel` = 电话适配器
- `middleware` = 适配器中的信号转换器

**5. abortSignal（请求中止）**

```typescript
abortSignal: input.abort,
```

用途：用户取消请求时（Ctrl+C），通过 AbortSignal 通知 AI SDK 中止流式请求。

**6. headers（请求头）**

```typescript
headers: {
  // OpenCode 内部提供商
  ...(input.model.providerID.startsWith("opencode") ? {
    "x-opencode-project": Instance.project.id,
    "x-opencode-session": input.sessionID,
    "x-opencode-request": input.user.id,
    "x-opencode-client": Flag.OPENCODE_CLIENT,
  } : input.model.providerID !== "anthropic" ? {
    // 其他提供商
    "User-Agent": `opencode/${Installation.VERSION}`,
  } : undefined),
  ...input.model.headers,  // 模型配置中的自定义头
  ...headers,              // 插件注入的头
},
```

**7. experimental_telemetry（遥测）**

```typescript
experimental_telemetry: {
  isEnabled: cfg.experimental?.openTelemetry,
  metadata: {
    userId: cfg.username ?? "unknown",
    sessionId: input.sessionID,
  },
},
```

用途：OpenTelemetry 遥测配置，用于追踪和监控 API 调用。

### 10.4 实际 API 调用

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
  // 模型已完成，退出循环
  log.info("exiting loop", { sessionID })
  break
}
```

这段代码判断**模型已经完成对用户消息的响应，不需要继续处理工具调用**。三个条件必须同时满足：

#### 条件 1：`lastAssistant?.finish`

最后一条助手消息有 `finish` 原因。`finish` 字段表示模型完成响应的原因，可能的值包括：

| finish 值 | 含义 |
|-----------|------|
| `"stop"` | 正常结束（没有工具调用） |
| `"tool-calls"` | 模型调用了工具，需要继续处理 |
| `"length"` | 达到最大 token 限制 |
| `"content-filter"` | 内容被过滤 |
| `"unknown"` | 未知原因 |

#### 条件 2：`!["tool-calls", "unknown"].includes(lastAssistant.finish)`

`finish` **不是** `"tool-calls"` 或 `"unknown"`。

- 排除 `"tool-calls"`：如果模型调用了工具，循环需要继续处理工具调用结果
- 排除 `"unknown"`：无法确定完成原因时，不退出循环

#### 条件 3：`lastUser.id < lastAssistant.id`

用户消息的 id 小于助手消息的 id。由于 id 是按时间递增生成的，这意味着**助手消息是对这条用户消息的响应**（而不是旧的历史记录）。

#### 退出条件总结

当三个条件都满足时，说明：
- 模型已完成响应（有 finish 原因）
- 没有待处理的工具调用（finish 不是 tool-calls）
- 这是对用户输入的完整回复（用户消息在助手消息之前）

所以可以安全退出循环。

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

### 16.4 Bus.publish 的完整调用链路

#### 16.4.1 核心问题：`Bus.publish(MessageV2.Event.Updated, { info: msg })` 的作用是什么？

这行代码的作用是**将消息更新事件广播给所有订阅者**，实现服务端到客户端的实时通信。

#### 16.4.2 完整调用链路图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        服务端 (Node.js/Bun)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. Session.updateMessage(msg)                                          │
│     │                                                                   │
│     └── Database.use((db) => {                                          │
│           db.insert(...).run()         // 执行数据库操作                  │
│           Database.effect(() =>        // 注册副作用函数                  │
│             Bus.publish(MessageV2.Event.Updated, { info: msg })         │
│           )                                                             │
│         })                                                              │
│         │                                                               │
│         └── 数据库操作完成后，执行所有 effects                            │
│                                                                         │
│  2. Bus.publish()                                        [src/bus/index.ts:41]
│     │                                                                   │
│     ├── 构建 payload: { type: "message.updated", properties: { info } } │
│     │                                                                   │
│     ├── 调用本地订阅者                                                   │
│     │   └── for (key of [def.type, "*"])                               │
│     │       └── for (sub of subscriptions.get(key))                    │
│     │           └── sub(payload)        // 调用订阅回调                  │
│     │                                                                   │
│     └── GlobalBus.emit("event", { directory, payload })  [全局事件总线]  │
│                                                                         │
│  3. 服务器 SSE 端点                                      [src/server/server.ts:539]
│     │                                                                   │
│     └── Bus.subscribeAll(async (event) => {                            │
│           await stream.writeSSE({                                      │
│             data: JSON.stringify(event)  // 通过 SSE 发送给客户端        │
│           })                                                            │
│         })                                                              │
│                                                                         │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │ HTTP SSE (Server-Sent Events)
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           客户端 (TUI/Desktop/Web)                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  4. SSE 连接接收事件                                     [src/cli/cmd/tui/context/sync.tsx]
│     │                                                                   │
│     └── for await (const event of events.stream) {                     │
│           switch (event.type) {                                         │
│             case "message.updated":                                     │
│               // 更新本地状态存储                                         │
│               setStore("message", sessionID, [...])                    │
│               // 触发 UI 重新渲染                                         │
│           }                                                             │
│         }                                                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 16.4.3 Database.effect 的作用

**位置**: `src/storage/db.ts:105-125`

```typescript
export function use<T>(callback: (trx: TxOrDb) => T): T {
  try {
    return callback(ctx.use().tx)
  } catch (err) {
    if (err instanceof Context.NotFound) {
      const effects: (() => void | Promise<void>)[] = []
      const result = ctx.provide({ effects, tx: Client() }, () => callback(Client()))
      for (const effect of effects) effect()  // 数据库操作完成后执行所有 effects
      return result
    }
    throw err
  }
}

export function effect(fn: () => any | Promise<any>) {
  try {
    ctx.use().effects.push(fn)  // 将副作用函数添加到队列
  } catch {
    fn()  // 如果不在 Database.use 上下文中，直接执行
  }
}
```

**设计原因**：
- 确保事件只在数据库操作**成功完成后**才发布
- 如果数据库操作失败，事件不会被发布
- 避免在事务中间发布事件导致状态不一致

#### 16.4.4 Bus.publish 的实现

**位置**: `src/bus/index.ts:41-64`

```typescript
export async function publish<Definition extends BusEvent.Definition>(
  def: Definition,
  properties: z.output<Definition["properties"]>,
) {
  const payload = {
    type: def.type,      // "message.updated"
    properties,          // { info: msg }
  }

  const pending = []

  // 1. 调用本地订阅者（按事件类型和通配符 "*"）
  for (const key of [def.type, "*"]) {
    const match = state().subscriptions.get(key)
    for (const sub of match ?? []) {
      pending.push(sub(payload))
    }
  }

  // 2. 发送到全局事件总线（跨进程通信）
  GlobalBus.emit("event", {
    directory: Instance.directory,
    payload,
  })

  return Promise.all(pending)
}
```

#### 16.4.5 服务器端 SSE 端点

**位置**: `src/server/server.ts:529-546`

```typescript
.get("/events", async (c) => {
  return streamSSE(c, async (stream) => {
    // 发送连接成功事件
    stream.writeSSE({
      data: JSON.stringify({
        type: "server.connected",
        properties: {},
      }),
    })

    // 订阅所有 Bus 事件
    const unsub = Bus.subscribeAll(async (event) => {
      await stream.writeSSE({
        data: JSON.stringify(event),  // 将事件发送给客户端
      })
    })

    // 心跳保活
    const heartbeat = setInterval(() => {
      stream.writeSSE({ data: "{}" })
    }, 30000)

    // 等待连接关闭
    await new Promise((resolve) => {
      stream.onAbort(resolve)
    })

    unsub()
    clearInterval(heartbeat)
  })
})
```

#### 16.4.6 客户端订阅处理

**位置**: `src/cli/cmd/tui/context/sync.tsx:228-266`

```typescript
case "message.updated": {
  const messages = store.message[event.properties.info.sessionID]
  if (!messages) {
    // 新 session，创建消息数组
    setStore("message", event.properties.info.sessionID, [event.properties.info])
    break
  }

  // 查找消息位置（使用二分查找，因为消息按 ID 排序）
  const result = Binary.search(messages, event.properties.info.id, (m) => m.id)

  if (result.found) {
    // 更新现有消息
    setStore("message", event.properties.info.sessionID, result.index, reconcile(event.properties.info))
  } else {
    // 插入新消息
    setStore("message", event.properties.info.sessionID, produce((draft) => {
      draft.splice(result.index, 0, event.properties.info)
    }))
  }

  // 限制内存中的消息数量
  if (messages.length > 100) {
    // 移除最旧的消息
    const oldest = messages[0]
    // ...
  }
  break
}
```

#### 16.4.7 GlobalBus 的作用

**位置**: `src/bus/global.ts`

```typescript
import { EventEmitter } from "events"

export const GlobalBus = new EventEmitter<{
  event: [
    {
      directory?: string
      payload: any
    },
  ]
}>()
```

**作用**：
- 提供跨模块的事件通信能力
- 在 `src/server/routes/global.ts` 中用于跨 worktree 的事件同步
- 支持多 worktree 场景下的事件共享

#### 16.4.8 其他订阅者

除了 SSE 端点，`MessageV2.Event.Updated` 还有其他订阅者：

1. **ShareNext** - 自动同步消息到远程分享服务
   ```typescript
   Bus.subscribe(MessageV2.Event.Updated, async (evt) => {
     await sync(evt.properties.info.sessionID, [{ type: "message", ... }])
   })
   ```

2. **CLI Run 模式** - 处理一次性命令的输出
   ```typescript
   if (event.type === "message.updated" && event.properties.info.role === "assistant") {
     // 处理输出...
   }
   ```

### 16.5 事件类型汇总

| 事件类型 | 触发时机 | 用途 |
|---------|---------|------|
| `message.updated` | 消息创建/更新 | UI 更新消息列表 |
| `message.removed` | 消息删除 | UI 移除消息 |
| `message.part.updated` | Part 创建/更新 | UI 更新消息内容 |
| `message.part.delta` | Part 文本增量 | 实时文本流显示 |
| `message.part.removed` | Part 删除 | UI 移除内容 |
| `session.updated` | Session 更新 | UI 更新会话信息 |
| `session.status` | 状态变化 | 显示 busy/idle/retry 状态 |
| `permission.asked` | 请求权限 | 显示确认对话框 |

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
