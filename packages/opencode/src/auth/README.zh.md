# 认证模块

## 概述

认证模块管理 AI 提供商和外部服务的凭证。它支持多种认证方法，包括 OAuth 令牌、API 密钥和 well-known 认证模式。

## 架构

### 存储位置

凭证存储在 `~/.local/state/opencode/auth.json` 中，文件权限为 `0o600`（仅所有者读写）。

### 认证类型

该模块通过可区分联合支持三种认证类型：

#### OAuth

对于使用 OAuth 2.0 认证流程的提供商：

```typescript
{
  type: "oauth",
  refresh: string,      // OAuth 刷新令牌
  access: string,       // OAuth 访问令牌
  expires: number,      // 令牌过期的 Unix 时间戳
  accountId?: string,   // 提供商特定的账户 ID
  enterpriseUrl?: string // 企业实例 URL
}
```

用于：OpenAI (OAuth)、GitHub Copilot

#### API 密钥

对于使用简单 API 密钥认证的提供商：

```typescript
{
  type: "api",
  key: string  // API 密钥
}
```

用于：大多数提供商（Anthropic、Google、AWS 等）

#### Well-Known

对于需要密钥和令牌的自定义认证的提供商：

```typescript
{
  type: "wellknown",
  key: string,   // API 密钥或类似
  token: string  // 附加令牌
}
```

## API

### 获取凭证

```typescript
const auth = await Auth.get("openai")
// 返回 Info | undefined
```

### 列出所有凭证

```typescript
const allAuth = await Auth.all()
// 返回 Record<string, Info>
```

### 设置凭证

```typescript
await Auth.set("openai", {
  type: "api",
  key: "sk-..."
})
```

### 删除凭证

```typescript
await Auth.remove("openai")
```

## 安全

- 文件权限设置为 `0o600`（仅所有者）
- 读取时静默过滤无效凭证
- 所有操作都是异步的，使用 Bun 的文件 API

## 提供商 ID

常见的提供商 ID：
- `openai` - OpenAI
- `anthropic` - Anthropic (Claude)
- `google` - Google AI
- `copilot` - GitHub Copilot
- `azure` - Azure OpenAI
- `bedrock` - AWS Bedrock
- 以及更多（参见 `src/provider/provider.ts`）

## 相关文件

- **src/auth/index.ts**：主要认证实现
- **src/provider/provider.ts**：提供商定义和认证使用
- **src/provider/auth.ts**：提供商特定的认证处理
- **src/cli/cmd/auth.ts**：CLI 认证命令
