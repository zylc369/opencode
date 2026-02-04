# 会话管理

## 概述

会话模块管理 AI 对话、消息、提示和 LLM 集成。这是处理用户与 AI 代理交互的核心模块。

## 架构

### 组件

- **index.ts** - 会话 CRUD 操作
- **message-v2.ts** - 消息处理（~22KB）
- **message.ts** - 遗留消息处理
- **prompt.ts** - 系统提示构建（~63KB）
- **processor.ts** - 消息处理（~16KB）
- **llm.ts** - LLM 集成
- **instruction.ts** - 指令处理
- **compaction.ts** - 上下文压缩
- **summary.ts** - 会话总结
- **revert.ts** - 消息恢复
- **status.ts** - 会话状态
- **system.ts** - 系统提示
- **todo.ts** - Todo 集成
- **retry.ts** - 重试逻辑
- **prompt/** - 特定于模型的提示模板

## 会话架构

```typescript
{
  id: string,              // 唯一会话 ID
  title: string,           // 会话标题
  agent: string,           // 代理名称
  model: {                 // 模型配置
    providerID: string,
    modelID: string
  },
  messages: Message[],     // 消息历史
  status: "idle" | "busy",
  metadata: Record<string, any>
}
```

## API

### 创建会话

```typescript
import { Session } from "@/session"

const session = await Session.create({
  title: "我的会话",
  agent: "build",
  model: { providerID: "openai", modelID: "gpt-4" }
})
```

### 处理消息

```typescript
const response = await session.process({
  type: "user",
  content: "Hello, world!"
})
```

### 列出会话

```typescript
const sessions = await Session.list()
```

### 获取会话

```typescript
const session = await Session.get(id)
```

### 删除会话

```typescript
await Session.remove(id)
```

## 消息类型

| 类型 | 描述 |
|------|-------------|
| `user` | 用户消息 |
| `assistant` | AI 响应 |
| `system` | 系统消息 |
| `tool` | 工具调用结果 |

## 提示构建

`prompt.ts` 模块从以下内容组装系统提示：
- 代理配置
- 指令文件
- 项目上下文
- 工具描述
- 以及更多...

## 上下文管理

### 压缩

当接近令牌限制时自动进行上下文压缩：

```typescript
await Session.compact(session)
```

### 总结

用于上下文保留的会话总结：

```typescript
const summary = await Session.summary(session)
```

## LLM 集成

流式 LLM 响应：

```typescript
const stream = await Session.llm(messages, model)
for await (const chunk of stream) {
  // 处理块
}
```

## 事件

### 会话事件

- `Session.Event.Created` - 会话已创建
- `Session.Event.Updated` - 会话已更新
- `Session.Event.Deleted` - 会话已删除
- `Session.Event.Error` - 会话错误

### 消息事件

- `Session.Event.MessageAdded` - 消息已添加
- `Session.Event.MessageUpdated` - 消息已更新

## 会话操作

### 压缩

通过总结旧消息来减少上下文大小：

```typescript
await session.compact()
```

### 恢复

恢复到之前的消息状态：

```typescript
await session.revert(messageID)
```

### 状态

获取会话状态：

```typescript
const status = await Session.status(id)
```

## 指令

额外的指令可以从以下位置加载：
- `CLAUDE.md` 文件
- `.opencode/instructions/*.md`
- 配置的指令路径

## 相关文件

- **src/session/index.ts**：会话 CRUD
- **src/session/message-v2.ts**：消息处理
- **src/session/prompt.ts**：提示构建
- **src/session/processor.ts**：消息处理
- **src/session/llm.ts**：LLM 集成
- **src/session/compaction.ts**：上下文压缩
- **src/session/summary.ts**：会话总结
