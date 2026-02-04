# Session 系统分析

## 概述

Session 系统是 OpenCode 的会话管理核心，负责处理用户与 AI 代理的交互会话。它管理会话状态、消息历史、权限控制和子会话创建等功能。

## 核心组件

### 会话生命周期

```typescript
export namespace Session {
  function createDefaultTitle(isChild = false) {
    return (isChild ? childTitlePrefix : parentTitlePrefix) + new Date().toISOString()
  }

  function getForkedTitle(title: string): string {
    const match = title.match(/^(.+) \(fork #(\d+)\)$/)
    if (match) {
      const base = match[1]
      const num = parseInt(match[2], 10)
      return `${base} (fork #${num + 1})`
    }
    return `${title} (fork #1)`
  }
}
```

### 会话标识

每个会话使用 `Identifier` 生成唯一 ID：

```typescript
import { Identifier } from "../id/id"
```

## 消息系统

### MessageV2

消息系统使用 MessageV2 格式，支持多种消息类型：

- 用户消息
- AI 响应
- 工具调用
- 文件附件

### 消息流处理

```typescript
export type StreamInput = {
  user: MessageV2.User
  sessionID: string
  model: Provider.Model
  agent: Agent.Info
  system: string[]
  abort: AbortSignal
  messages: ModelMessage[]
  small?: boolean
  tools: Record<string, Tool>
  retries?: number
}
```

## LLM 集成

### LLM.stream

```typescript
export namespace LLM {
  export async function stream(input: StreamInput) {
    const l = log.clone().tag("providerID", input.model.providerID).tag("modelID", input.model.id)

    // 处理流式响应
    const result = await streamText({
      model: model,
      messages: input.messages,
      tools: input.tools,
      system: input.system,
      abortSignal: input.abort,
      maxTokens: OUTPUT_TOKEN_MAX,
    })

    return result
  }
}
```

### 输出令牌限制

```typescript
export const OUTPUT_TOKEN_MAX = Flag.OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX || 32_000
```

## 会话状态管理

### 状态存储

```typescript
import { Storage } from "../storage/storage"
import { Instance } from "../project/instance"
```

会话状态通过 `Storage` 抽象层持久化，支持多种存储后端。

### 会话配置

```typescript
const cfg = await Config.get()
```

会话配置包括：

- 默认模型设置
- 代理配置
- 权限规则
- 工具可用性

## 权限管理

### PermissionNext

权限系统集成到会话中：

```typescript
import { PermissionNext } from "@/permission/next"
```

工具执行时需要进行权限检查：

```typescript
ask(input: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">): Promise<void>
```

## 系统提示

### SystemPrompt

系统提示根据不同场景动态生成：

```typescript
import { SystemPrompt } from "./system"
```

### 提示模板

```typescript
import { SessionPrompt } from "./prompt"
```

包含各种场景的提示模板：

- 代码生成
- 错误修复
- 代码审查
- 项目分析

## 会话操作

### 基本操作

- **创建会话**: `Session.create()`
- **继续会话**: `Session.continue()`
- **分叉会话**: `Session.fork()`
- **删除会话**: `Session.delete()`

### 状态查询

- **会话列表**: `Session.list()`
- **会话详情**: `Session.get()`
- **会话统计**: `Session.stats()`

## 子会话支持

### 子会话创建

```typescript
const childTitlePrefix = "Child session - "
```

子会话用于：

- 复杂任务的分解
- 并行处理
- 错误恢复

### 会话链

支持会话间的继承关系：

- 父会话 → 子会话
- 权限继承
- 状态共享

## 消息压缩

### Compaction

长对话会自动压缩历史消息：

```typescript
import { compaction } from "./compaction"
```

### 压缩策略

1. **摘要压缩**: 保留关键信息摘要
2. **工具调用压缩**: 合并相似工具调用
3. **消息合并**: 合并连续的同类消息

## 重试机制

### 自动重试

```typescript
export type StreamInput = {
  // ...
  retries?: number
}
```

支持配置重试次数和策略。

### 错误处理

- 网络错误重试
- 模型错误重试
- 工具执行错误处理

## 事件系统

### BusEvent

```typescript
import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
```

会话事件：

- 会话创建
- 消息发送
- 工具调用
- 会话结束

## 日志记录

### 日志上下文

```typescript
const log = Log.create({ service: "session" })
```

每个会话有独立的日志上下文，包含：

- 会话 ID
- 用户 ID
- 模型信息
- 代理信息

## 性能优化

### 流式处理

使用流式处理减少延迟：

- 部分响应提前返回
- 工具调用并行执行
- 增量状态更新

### 缓存策略

- 模型响应缓存
- 工具结果缓存
- 会话状态缓存

## 监控和分析

### 使用统计

```typescript
import { type LanguageModelUsage } from "ai"
```

跟踪：

- 令牌使用量
- 工具调用次数
- 响应时间
- 错误率

### 成本跟踪

```typescript
import { Decimal } from "decimal.js"
```

精确计算 API 调用成本。

## 配置管理

### 全局配置

```typescript
import { Global } from "@/global"
```

### 功能开关

```typescript
import { Flag } from "../flag/flag"
```

支持实验性功能的开关控制。

## 最佳实践

### 会话设计原则

1. **状态隔离**: 每个会话独立状态
2. **权限最小化**: 最小权限原则
3. **资源清理**: 及时释放资源
4. **错误恢复**: 优雅的错误处理
5. **性能优化**: 流式处理和缓存

### 会话生命周期管理

```typescript
// 会话创建
const session = await Session.create({
  title: "新会话",
  agent: defaultAgent,
  model: defaultModel,
})

// 会话执行
const result = await LLM.stream({
  sessionID: session.id,
  user: userMessage,
  // ...
})

// 会话清理
await Session.cleanup(session.id)
```

Session 系统的设计确保了 OpenCode 能够提供流畅、安全、高效的 AI 交互体验。
