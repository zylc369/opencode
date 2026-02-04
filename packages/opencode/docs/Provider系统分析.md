# Provider 系统分析

## 概述

Provider 系统是 OpenCode 的 AI 提供商集成核心，负责统一管理多个 AI 服务提供商的访问。它提供了一个统一的接口来访问不同的 AI 模型，同时处理认证、转换、错误处理等复杂性。

## 支持的提供商

### 主流 AI 提供商

```typescript
// 直接导入的提供商
import { createAmazonBedrock, type AmazonBedrockProviderSettings } from "@ai-sdk/amazon-bedrock"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createAzure } from "@ai-sdk/azure"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createVertex } from "@ai-sdk/google-vertex"
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { createOpenRouter, type LanguageModelV2 } from "@openrouter/ai-sdk-provider"
import { createXai } from "@ai-sdk/xai"
import { createMistral } from "@ai-sdk/mistral"
import { createGroq } from "@ai-sdk/groq"
import { createDeepInfra } from "@ai-sdk/deepinfra"
import { createCerebras } from "@ai-sdk/cerebras"
import { createCohere } from "@ai-sdk/cohere"
import { createGateway } from "@ai-sdk/gateway"
import { createTogetherAI } from "@ai-sdk/togetherai"
import { createPerplexity } from "@ai-sdk/perplexity"
import { createVercel } from "@ai-sdk/vercel"
import { createGitLab } from "@gitlab/gitlab-ai-provider"
```

### 特殊提供商

- **GitHub Copilot**: 通过 OpenAI 兼容接口
- **OpenCode**: 自有 AI 服务

## 提供商检测

### GPT-5+ 检测

```typescript
function isGpt5OrLater(modelID: string): boolean {
  const match = /^gpt-(\d+)/.exec(modelID)
  if (!match) {
    return false
  }
  return Number(match[1]) >= 5
}
```

用于特殊处理 GPT-5 及以上版本的功能。

## 提供商状态管理

### 状态初始化

```typescript
const state = Instance.state(async () => {
  const cfg = await Config.get()
  // 加载提供商配置
  const providers = await loadProviders(cfg)
  return { providers, config: cfg }
})
```

### 动态配置

提供商支持动态配置和重新加载：

```typescript
async function reloadProviders() {
  const cfg = await Config.get()
  const providers = await loadProviders(cfg)
  await state.update({ providers, config: cfg })
}
```

## 模型管理

### 模型列表

```typescript
import { ModelsDev } from "./models"
```

开发环境支持额外的模型列表。

### 模型转换

```typescript
import { ProviderTransform } from "./transform"
```

不同提供商的模型参数格式统一转换。

## 认证系统

### 多种认证方式

1. **API Key**: 传统 API 密钥认证
2. **OAuth**: 基于 OAuth 的认证
3. **环境变量**: 通过环境变量配置
4. **配置文件**: 通过配置文件管理

### 认证状态管理

```typescript
import { Auth } from "@/auth"
```

```typescript
async function authenticate(providerID: string, credentials: any) {
  const provider = getProvider(providerID)
  const auth = await Auth.authenticate(provider, credentials)
  return auth
}
```

## 提供商配置

### 配置结构

```typescript
interface ProviderConfig {
  id: string
  name: string
  baseURL?: string
  apiKey?: string
  headers?: Record<string, string>
  models: ModelConfig[]
  transform?: TransformConfig
}
```

### 环境变量支持

```typescript
import { Env } from "../env"
```

支持通过环境变量配置提供商：

```bash
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=ant-xxx
GOOGLE_AI_API_KEY=xxx
```

## 模型接口

### 统一模型接口

```typescript
interface Model {
  providerID: string
  id: string
  name: string
  description?: string
  capabilities: ModelCapabilities
  pricing?: PricingInfo
  limits?: ModelLimits
}

interface ModelCapabilities {
  textGeneration: boolean
  functionCalling: boolean
  streaming: boolean
  vision: boolean
  maxTokens: number
}
```

### 模型发现

```typescript
async function discoverModels(provider: Provider): Promise<Model[]> {
  const models = await provider.listModels()
  return models.map(transformModel)
}
```

## 错误处理

### 提供商错误

```typescript
import { NoSuchModelError, type Provider as SDK } from "ai"
import { NamedError } from "@opencode-ai/util/error"
```

### 错误分类

1. **认证错误**: API 密钥无效或过期
2. **限流错误**: 超出配额限制
3. **模型错误**: 模型不存在或不支持
4. **网络错误**: 连接超时或网络问题
5. **格式错误**: 请求格式不正确

### 错误恢复

```typescript
async function handleProviderError(error: Error, provider: string) {
  if (error instanceof AuthenticationError) {
    // 尝试刷新认证
    await refreshAuthentication(provider)
  } else if (error instanceof RateLimitError) {
    // 等待后重试
    await delay(retryDelay)
    return retry()
  }
  throw error
}
```

## 性能优化

### 连接池

```typescript
class ProviderConnectionPool {
  private pools = new Map<string, ConnectionPool>()

  async getConnection(providerID: string): Promise<Connection> {
    let pool = this.pools.get(providerID)
    if (!pool) {
      pool = new ConnectionPool(providerID)
      this.pools.set(providerID, pool)
    }
    return pool.acquire()
  }
}
```

### 缓存策略

```typescript
// 模型列表缓存
const modelListCache = new Cache<string, Model[]>("models", 3600)

// 提供商信息缓存
const providerInfoCache = new Cache<string, ProviderInfo>("providers", 1800)
```

## 插件支持

### 自定义提供商

```typescript
import { Plugin } from "@/plugin"
```

插件可以注册自定义提供商：

```typescript
// plugin.ts
export const providers = {
  "my-provider": {
    create: (config) => new MyProvider(config),
    models: async () => listModels(),
  },
}
```

### 提供商扩展

支持扩展现有提供商的功能：

- 添加新模型
- 自定义转换器
- 特殊认证方式

## 监控和分析

### 使用统计

```typescript
interface ProviderUsage {
  providerID: string
  modelID: string
  requestCount: number
  tokenUsage: {
    input: number
    output: number
  }
  cost: number
  errorRate: number
  averageLatency: number
}
```

### 成本跟踪

```typescript
async function trackUsage(provider: string, model: string, usage: TokenUsage) {
  const cost = await calculateCost(provider, model, usage)
  await updateUsageStats({
    provider,
    model,
    usage,
    cost,
    timestamp: Date.now(),
  })
}
```

## 配置管理

### 全局配置

```typescript
const cfg = await Config.get()
```

### 功能开关

```typescript
import { Flag } from "../flag/flag"
```

支持实验性功能的开关：

```typescript
if (Flag.OPENCODE_EXPERIMENTAL_PROVIDER_X) {
  // 启用实验性提供商
}
```

## 开发工具

### 开发模型

```typescript
import { ModelsDev } from "./models"
```

开发环境支持测试模型和本地模型。

### 调试工具

```typescript
// 提供商调试信息
const debugInfo = {
  providerConfig: getProviderConfig(),
  availableModels: await listModels(),
  authenticationStatus: await checkAuth(),
  connectionStatus: await checkConnection(),
}
```

## 最佳实践

### 提供商选择策略

```typescript
function selectProvider(task: Task): Provider {
  const criteria = {
    // 任务类型匹配
    capabilities: task.requiredCapabilities,
    // 成本考虑
    cost: task.maxCost,
    // 性能要求
    latency: task.maxLatency,
    // 可用性要求
    reliability: task.minReliability,
  }

  return findBestProvider(criteria)
}
```

### 负载均衡

```typescript
class ProviderLoadBalancer {
  private providers: Provider[] = []
  private currentIndex = 0

  async selectProvider(): Promise<Provider> {
    const available = await this.getAvailableProviders()
    if (available.length === 0) {
      throw new Error("No available providers")
    }

    // 轮询选择
    const provider = available[this.currentIndex % available.length]
    this.currentIndex++
    return provider
  }
}
```

## 扩展性

### 新提供商添加

1. 实现提供商接口
2. 添加模型转换器
3. 配置认证方式
4. 注册到系统

### 自定义功能

- 特殊模型参数
- 自定义认证流程
- 独特的错误处理
- 专门的监控指标

Provider 系统的设计确保了 OpenCode 能够灵活、可靠、高效地集成各种 AI 服务提供商，为用户提供最佳的 AI 体验。
