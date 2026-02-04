# AI 提供商集成

## 概述

提供商模块管理 AI 模型提供商，支持 20+ 提供商，具有统一的认证和参数处理。

## 架构

### 组件

- **provider.ts** - 提供商注册表和初始化（~44KB）
- **models.ts** - 模型定义和成本
- **auth.ts** - 提供商特定的认证
- **transform.ts** - 提供商特定的参数转换（~27KB）
- **sdk/copilot/** - GitHub Copilot SDK 集成

## 支持的提供商

| 提供商 | 提供商 ID | 模型 |
|----------|-------------|--------|
| OpenAI | `openai` | GPT-4、GPT-3.5 等 |
| Anthropic | `anthropic` | Claude 3 Opus/Sonnet/Haiku |
| Google | `google` | Gemini Pro/Ultra |
| AWS Bedrock | `bedrock` | 各种 AWS 模型 |
| Azure | `azure` | Azure OpenAI |
| Groq | `groq` | Llama、Mixtral |
| Mistral | `mistral` | Mistral 模型 |
| Cohere | `cohere` | Command 模型 |
| 以及 10+ 更多... | | |

## 提供商配置

```json
{
  "provider": {
    "openai": {
      "apiKey": "sk-...",
      "baseURL": "https://api.openai.com/v1",
      "timeout": 300000
    },
    "anthropic": {
      "apiKey": "sk-ant-...",
      "timeout": 300000
    }
  }
}
```

## API

### 获取提供商

```typescript
import { Provider } from "@/provider"

const provider = await Provider.get("openai")
```

### 获取模型

```typescript
const model = await Provider.getModel("openai", "gpt-4")
```

### 列出模型

```typescript
const models = await Provider.models()
```

### 获取默认模型

```typescript
const model = await Provider.defaultModel()
// 返回 { providerID, modelID }
```

### 提供商初始化

```typescript
const instance = await Provider.init(providerID, model)
```

## 模型标识符

模型标识为 `provider/model`：
- `openai/gpt-4`
- `anthropic/claude-3-opus-20240229`
- `google/gemini-pro`

## 错误类型

- `Provider.InitError` - 提供商初始化失败
- `Provider.ModelNotFoundError` - 未找到模型（带有建议）

## 提供商特定的转换

`transform.ts` 模块处理提供商特定的参数转换：
- 温度缩放
- Top-p 采样
- 流式格式
- 工具调用格式
- 以及更多...

## 认证

认证通过 `Auth` 模块处理。每个提供商可以使用：
- API 密钥（`api` 类型）
- OAuth 令牌（`oauth` 类型）
- Well-known 认证（`wellknown` 类型）

详情参见 `src/auth/index.ts`。

## 相关文件

- **src/provider/provider.ts**：提供商注册表
- **src/provider/models.ts**：模型定义
- **src/provider/auth.ts**：提供商认证
- **src/provider/transform.ts**：参数转换
- **src/provider/sdk/copilot/**：Copilot SDK
- **src/auth/index.ts**：认证存储
