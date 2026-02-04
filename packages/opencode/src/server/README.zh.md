# HTTP 服务器模块

## 概述

使用 Hono 框架的 HTTP API 服务器，支持 WebSocket、CORS 和 mDNS 发现。

## 架构

### 组件

- **server.ts** - 主服务器实现（~20KB）
- **routes/** - API 路由处理器
- **error.ts** - 错误定义
- **event.ts** - 服务器事件
- **mdns.ts** - mDNS 服务发现

### API 路由

| 路由 | 描述 |
|-------|-------------|
| `GET /` | 服务器信息 |
| `POST /session` | 创建会话 |
| `GET /session/:id` | 获取会话 |
| `DELETE /session/:id` | 删除会话 |
| `POST /session/:id/message` | 发送消息 |
| `GET /project` | 获取项目信息 |
| `GET /file/*` | 读取文件 |
| `POST /file/*` | 写入文件 |
| `GET /config` | 获取配置 |
| `GET /mcp` | 列出 MCP 服务器 |
| `GET /provider` | 列出提供商 |
| `POST /pty` | 创建 PTY |
| `GET /tui` | TUI WebSocket |
| `/experimental/*` | 实验性路由 |

## 服务器配置

```typescript
const server = new Server({
  port: 4096,
  hostname: "127.0.0.1",
  cors: ["http://localhost:3000"],
  mdns: true,
  mdnsDomain: "opencode.local"
})
```

## WebSocket 支持

服务器支持用于以下功能的 WebSocket 连接：
- TUI 实时更新
- 会话流式传输
- PTY 输出

## mDNS 发现

启用后，服务器通过 mDNS 广播自己：
- 服务：`_opencode._tcp`
- 域：`opencode.local`（默认）
- 自动将主机名设置为 `0.0.0.0`

## CORS

CORS 为以下内容配置：
- localhost 源
- 配置的额外域
- TUI 和 Web 界面

## API

### 启动服务器

```typescript
import { Server } from "@/server"

const server = await Server.start(options)
```

### 停止服务器

```typescript
await server.stop()
```

## 事件

- `Server.Event.Ready` - 服务器就绪
- `Server.Event.Error` - 服务器错误

## 相关文件

- **src/server/server.ts**：主服务器
- **src/server/routes/**：API 路由
- **src/server/error.ts**：错误定义
- **src/server/event.ts**：服务器事件
- **src/server/mdns.ts**：mDNS 发现
