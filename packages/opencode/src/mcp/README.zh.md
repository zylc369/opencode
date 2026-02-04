# Model Context Protocol (MCP) 集成

## 概述

MCP 模块提供与 Model Context Protocol 的集成，使外部工具和资源服务器能够扩展 OpenCode 的功能。

## 架构

### 组件

- **index.ts** - 主要 MCP 客户端管理（~29KB）
- **auth.ts** - MCP 认证处理
- **oauth-provider.ts** - OAuth 提供商集成
- **oauth-callback.ts** - OAuth 回调处理

### 传输类型

MCP 服务器可以通过不同的传输方式进行通信：

1. **Stdio** - 标准输入/输出（本地服务器）
2. **HTTP** - HTTP 请求（远程服务器）
3. **SSE** - 服务器发送事件（远程服务器）

## 配置

### 本地 MCP 服务器

```json
{
  "mcp": {
    "my-server": {
      "type": "local",
      "command": ["path/to/server", "--arg"],
      "environment": {
        "API_KEY": "value"
      },
      "enabled": true,
      "timeout": 5000
    }
  }
}
```

### 远程 MCP 服务器

```json
{
  "mcp": {
    "my-server": {
      "type": "remote",
      "url": "https://example.com/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer token"
      },
      "oauth": {
        "clientId": "client-id",
        "clientSecret": "client-secret",
        "scope": "read write"
      },
      "timeout": 5000
    }
  }
}
```

## API

### 获取 MCP 提示

```typescript
import { MCP } from "@/mcp"

const prompts = await MCP.prompts()
// 返回来自 MCP 服务器的可用提示数组
```

### 获取 MCP 工具

```typescript
const tools = await MCP.tools()
// 返回来自 MCP 服务器的可用工具数组
```

### 执行 MCP 提示

```typescript
const result = await MCP.getPrompt(client, name, arguments)
```

### 调用 MCP 工具

```typescript
const result = await MCP.callTool(client, name, arguments)
```

## OAuth 认证

MCP 服务器可以使用 OAuth 进行认证。系统支持：
- 动态客户端注册（RFC 7591）
- OAuth 2.0 流程
- 令牌管理

## 错误处理

- `MCP.Failed` - MCP 服务器故障错误

## 事件

MCP 集成为以下情况发布事件：
- 服务器连接/断开
- 工具执行
- 错误条件

## 相关文件

- **src/mcp/index.ts**：主要 MCP 实现
- **src/mcp/auth.ts**：认证处理
- **src/mcp/oauth-provider.ts**：OAuth 提供商
- **src/mcp/oauth-callback.ts**：OAuth 回调
- **src/config/config.ts**：MCP 配置加载
