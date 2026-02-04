# Agent 系统分析

## 概述

Agent 系统是 OpenCode 的 AI 代理核心，负责管理和配置不同类型的 AI 代理。每个代理有特定的角色、能力和行为模式，系统支持多种 AI 提供商和模型的统一管理。

## Agent 定义

### Agent.Info Schema

```typescript
export const Info = z
  .object({
    name: z.string(), // 代理名称
    description: z.string().optional(), // 代理描述
    mode: z.enum(["subagent", "primary", "all"]), // 代理模式
    native: z.boolean().optional(), // 是否原生代理
    hidden: z.boolean().optional(), // 是否隐藏
    topP: z.number().optional(), // top-p 参数
    temperature: z.number().optional(), // 温度参数
    color: z.string().optional(), // 显示颜色
    permission: PermissionNext.Ruleset, // 权限规则集
    model: z
      .object({
        // 模型配置
        modelID: z.string(),
        providerID: z.string(),
      })
      .optional(),
    prompt: z.string().optional(), // 自定义提示
    options: z.record(z.string(), z.any()), // 额外选项
    steps: z.number().int().positive().optional(), // 步数限制
  })
  .meta({
    ref: "Agent",
  })
```

## 代理模式

### 三种模式

1. **subagent**: 子代理，用于特定任务
2. **primary**: 主代理，处理主要交互
3. **all**: 全能代理，处理所有任务

### 模式选择策略

```typescript
// 根据任务类型选择合适的代理模式
const selectAgent = (taskType: string) => {
  switch (taskType) {
    case "code_review":
      return agents.filter((a) => a.mode === "subagent" && a.name.includes("reviewer"))
    case "code_generation":
      return agents.filter((a) => a.mode === "primary" || a.mode === "all")
    default:
      return agents.filter((a) => a.mode === "all")
  }
}
```

## 内置代理

### 系统代理

系统预定义了多个专业代理：

#### 代码生成代理

- 专注于代码编写和生成
- 支持多种编程语言
- 集成最佳实践

#### 代码审查代理

- 代码质量检查
- 安全性分析
- 性能优化建议

#### 项目分析代理

- 项目结构分析
- 依赖关系梳理
- 技术栈识别

#### 调试代理

- 错误诊断
- 问题定位
- 修复建议

### 代理配置示例

```typescript
const codeReviewer: Agent.Info = {
  name: "code-reviewer",
  description: "专业的代码审查专家",
  mode: "subagent",
  temperature: 0.1, // 低温度，确保一致性
  permission: {
    // 只读权限
    read: true,
    write: false,
    execute: false,
  },
  model: {
    providerID: "anthropic",
    modelID: "claude-3-5-sonnet-20241022",
  },
  prompt: `你是一个专业的代码审查专家，专注于：
1. 代码质量和可读性
2. 安全性检查
3. 性能优化
4. 最佳实践建议`,
}
```

## 代理状态管理

### 状态初始化

```typescript
const state = Instance.state(async () => {
  const cfg = await Config.get()
  // 加载代理配置
  // 初始化代理状态
  return { agents: loadedAgents }
})
```

### 动态代理加载

系统支持：

- 配置文件中的代理定义
- 插件提供的代理
- 运行时动态创建的代理

## 提示系统

### 预定义提示模板

```typescript
import PROMPT_GENERATE from "./generate.txt"
import PROMPT_COMPACTION from "./prompt/compaction.txt"
import PROMPT_EXPLORE from "./prompt/explore.txt"
import PROMPT_SUMMARY from "./prompt/summary.txt"
import PROMPT_TITLE from "./prompt/title.txt"
```

### 提示类型

1. **生成提示** (generate.txt)
   - 代码生成
   - 文档生成
   - 测试用例生成

2. **压缩提示** (compaction.txt)
   - 历史消息压缩
   - 信息摘要
   - 关键点提取

3. **探索提示** (explore.txt)
   - 代码库探索
   - 项目分析
   - 结构梳理

4. **总结提示** (summary.txt)
   - 任务总结
   - 结果汇总
   - 经验提取

5. **标题提示** (title.txt)
   - 会话标题生成
   - 主题识别
   - 分类标记

## 代理能力

### 核心能力

1. **代码理解**
   - 语法分析
   - 语义理解
   - 上下文感知

2. **代码生成**
   - 原型开发
   - 功能实现
   - 重构建议

3. **问题解决**
   - 错误诊断
   - 调试指导
   - 优化方案

4. **项目管理**
   - 架构设计
   - 技术选型
   - 最佳实践

### 工具使用

代理通过工具系统与外部交互：

```typescript
const tools = await ToolRegistry.tools(model, agent)
```

### 权限控制

每个代理有独立的权限配置：

```typescript
permission: PermissionNext.Ruleset
```

权限类型：

- 文件读写权限
- 命令执行权限
- 网络访问权限
- 系统修改权限

## 代理通信

### 子代理协作

主代理可以调用子代理处理专门任务：

```typescript
// 主代理调用子代理
const result = await Agent.invoke({
  agent: "code-reviewer",
  task: "review this code",
  context: currentContext,
})
```

### 代理链

支持代理间的调用链：

```
用户请求 → 主代理 → 子代理1 → 子代理2 → 结果汇总 → 返回用户
```

### 结果聚合

```typescript
import { mergeDeep, pipe, sortBy, values } from "remeda"

// 合并多个代理的结果
const mergedResult = pipe(
  agentResults,
  values,
  sortBy((r) => r.confidence),
  mergeDeep,
)
```

## 代理配置

### 模型选择

```typescript
model: z.object({
  modelID: z.string(),
  providerID: z.string(),
}).optional(),
```

支持：

- OpenAI GPT 系列
- Anthropic Claude 系列
- Google Gemini 系列
- 开源模型

### 参数调优

```typescript
temperature: z.number().optional(),   // 创造性控制
topP: z.number().optional(),          // 核采样
steps: z.number().int().positive().optional(), // 步数限制
```

### 选项配置

```typescript
options: z.record(z.string(), z.any())
```

支持模型特定的配置选项。

## 插件集成

### 插件代理

```typescript
import { Plugin } from "@/plugin"
```

插件可以提供自定义代理：

```typescript
// plugin.ts
export const agents = {
  "my-custom-agent": {
    name: "Custom Agent",
    description: "自定义代理",
    mode: "subagent",
    // ...
  },
}
```

### 动态加载

系统自动发现并加载插件代理。

## 监控和分析

### 性能指标

- 响应时间
- 令牌使用量
- 任务完成率
- 错误率

### 使用统计

```typescript
// 跟踪代理使用情况
const agentStats = {
  "code-reviewer": {
    calls: 150,
    successRate: 0.95,
    avgResponseTime: 2.3,
  },
}
```

## 最佳实践

### 代理设计原则

1. **单一职责**: 每个代理专注特定领域
2. **权限最小化**: 只授予必要权限
3. **可组合性**: 支持代理间协作
4. **可观测性**: 提供足够的日志和指标

### 配置管理

```typescript
// 集中配置管理
const agentConfig = {
  default: "gpt-4",
  temperature: 0.7,
  maxTokens: 4000,
  // ...
}
```

### 错误处理

```typescript
try {
  const result = await agent.execute(task)
} catch (error) {
  log.error("Agent execution failed", { agent: agent.name, error })
  // 降级处理
  return await fallbackAgent.execute(task)
}
```

## 扩展性

### 新代理添加

1. 定义代理配置
2. 实现特定提示
3. 配置权限规则
4. 注册到系统

### 自定义能力

代理可以通过以下方式扩展：

- 自定义工具
- 特殊提示模板
- 独特权限规则
- 专用配置选项

Agent 系统的设计确保了 OpenCode 能够提供专业、灵活、可扩展的 AI 服务能力。
