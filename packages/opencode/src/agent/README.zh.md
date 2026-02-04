# Agent 系统

## 概述

Agent 系统定义了具有不同模式、权限和行为的 AI 代理配置。代理是核心实体，通过会话与用户交互，使用工具和提供商来完成任务。

## 架构

### Agent 架构

每个代理由 `Agent.Info` 架构定义：

```typescript
{
  name: string           // 唯一标识符
  description?: string   // 人类可读的描述
  mode: "subagent" | "primary" | "all"  // 代理模式
  native?: boolean       // 内置代理标志
  hidden?: boolean       // 从代理列表中隐藏
  temperature?: number   // LLM 温度
  topP?: number         // LLM top-p 采样
  color?: string        // UI 颜色
  permission: PermissionNext.Ruleset  // 访问控制规则
  model?: {             // 模型配置
    providerID: string
    modelID: string
  }
  variant?: string      // 模型变体
  prompt?: string       // 系统提示
  options: Record<string, any>  // 附加选项
  steps?: number        // 最大执行步数
}
```

### Agent 模式

- **subagent**：用于特定任务的专用代理（如 explore、general）。只能被其他代理调用，不能直接被用户使用。
- **primary**：可以被用户选择的主代理（如 build、plan）
- **all**：在两种模式下都可工作的代理

## 内置 Agent

### 主代理

#### build
默认代理。根据配置的权限执行工具，可以访问大多数工具。

#### plan
规划模式代理。禁止编辑工具，除了计划文件（`.opencode/plans/*.md`）。用于在进行更改之前创建实施计划。

### 子代理

#### general
用于研究复杂问题和并行执行多任务的多用途代理。可以访问大多数工具，除了 todo 操作。

#### explore
专门用于探索代码库的快速代理。只有只读访问权限：
- grep（内容搜索）
- glob（文件模式匹配）
- read（文件读取）
- bash（只读命令）
- webfetch、websearch、codesearch

接受彻底程度级别："quick"、"medium"、"very thorough"

### 隐藏代理

#### compaction
通过删除冗余信息来压缩对话历史。无工具访问权限。

#### title
为会话生成简洁的标题（≤50 个字符）。无工具访问权限。

#### summary
总结会话以保留上下文。无工具访问权限。

## Agent 配置

### 默认权限

所有代理都从基础权限集开始：
- 默认允许大多数工具
- 询问以防止 doom_loop
- 询问外部目录访问（除了技能目录）
- 默认拒绝问题/提示
- 拒绝计划进入/退出
- 读取 `.env` 文件前询问

### 权限合并

代理权限按顺序合并：
1. 默认权限
2. 代理特定的覆盖
3. 用户配置权限
4. 始终允许 Truncate.GLOB（除非明确拒绝）

### 自定义 Agent

用户可以在配置中定义自定义代理：

```json
{
  "agent": {
    "my-agent": {
      "model": "openai:gpt-4",
      "mode": "subagent",
      "prompt": "你是...方面的专家",
      "permission": {
        "bash": "deny"
      }
    }
  }
}
```

## Agent 生成

`Agent.generate()` 函数根据用户描述创建新的代理配置：

```typescript
const agent = await Agent.generate({
  description: "一个审查代码安全问题的代理"
})
```

返回：
```json
{
  "identifier": "security-reviewer",
  "whenToUse": "在...时使用此代理",
  "systemPrompt": "你是一个安全专家..."
}
```

## 提示模板

位于 `src/agent/prompt/`：

- **compaction.txt**：总结对话的说明
- **explore.txt**：探索代码库的说明
- **summary.txt**：对话总结的说明
- **title.txt**：生成对话标题的说明

## 使用

### 获取 Agent

```typescript
const agent = await Agent.get("build")
```

### 列出 Agent

```typescript
const agents = await Agent.list()
// 返回排序后的数组，默认代理在前
```

### 获取默认 Agent

```typescript
const defaultAgent = await Agent.defaultAgent()
// 返回默认主可见代理的名称
```

## 实例状态

代理配置通过 `Instance.state()` 实例作用域化，这意味着它们可以因项目/工作区而异。

## 相关文件

- **src/agent/agent.ts**：主要的代理实现
- **src/agent/generate.txt**：生成新代理的提示
- **src/agent/prompt/**：内置代理的系统提示
- **src/permission/next.ts**：权限系统
- **src/provider/provider.ts**： AI 提供商集成
