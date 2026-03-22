# PWA Manifest 认证问题分析与解决

## 问题概述

在部署 OpenCode 到云端时，浏览器控制台报告以下错误：

```
Failed to load resource: the server responded with a status of 401 (Unauthorized) site.webmanifest:1
Manifest fetch from http://opencode.beaconkeep.com/site.webmanifest failed, code 401 (index):16
```

其他资源（如 JS、CSS、API 请求）均能正常访问，唯独 `site.webmanifest` 返回 401。

## 环境信息

- **部署方式**: Docker 容器
- **网络架构**: nginx → FRP server → FRP tunnel → FRP client → opencode
- **域名**: `opencode.beaconkeep.com`
- **opencode 启动命令**: `opencode web --hostname 0.0.0.0 --port 4096 --unmatched-request-proxy http://localhost:4173`

## 问题分析

### 1. 初步排查

首先检查 opencode server 的认证中间件（`packages/opencode/src/server/server.ts`）：

```typescript
.use((c, next) => {
  if (c.req.method === "OPTIONS") return next()
  const password = Flag.OPENCODE_SERVER_PASSWORD
  if (!password) return next()
  const username = Flag.OPENCODE_SERVER_USERNAME ?? "opencode"
  return basicAuth({ username, password })(c, next)
})
```

该中间件在 `OPENCODE_SERVER_PASSWORD` 设置时会对所有请求进行认证。

### 2. 矛盾现象

| 资源                | 状态 |
| ------------------- | ---- |
| `/global/health`    | 正常 |
| `/provider`         | 正常 |
| `/assets/*.js`      | 正常 |
| `/site.webmanifest` | 401  |

所有请求都经过同一个中间件，为何只有 manifest 失败？

### 3. 根因定位

通过 `curl` 测试发现问题不在 opencode server：

```bash
# 容器内直接访问 - 正常
curl -v http://localhost:4096/site.webmanifest
# HTTP/1.1 200 OK

# 外部通过域名访问 - 401
curl -v http://opencode.beaconkeep.com/site.webmanifest
# HTTP/1.1 401 Unauthorized
# Www-Authenticate: Basic realm="Restricted"
```

检查 FRP client 配置发现：

```toml
[[proxies]]
name = "http-opencode"
type = "http"
localPort = 4097
subdomain = "opencode"
httpUser = "用户名"      # FRP 层的 HTTP Basic Auth
httpPassword = "密码"
```

**根因**: FRP client 配置了 `httpUser` 和 `httpPassword`，对 HTTP 代理添加了认证。

### 4. 为什么其他资源正常？

浏览器访问网页时会弹出认证框，用户输入凭证后浏览器会缓存这些认证信息。后续的 XHR/Fetch 请求会自动带上 `Authorization` header。

但 `<link rel="manifest">` 是浏览器**自动发起**的 PWA 资源请求，**不会使用缓存的认证信息**，因此返回 401。

### 5. 本地测试验证

本地启动 opencode 并设置密码：

```bash
OPENCODE_SERVER_PASSWORD=2 bun run dev:web:local
```

同样出现 401 错误，说明问题本质是：**认证中间件没有对 PWA 静态资源做白名单处理**。

## 解决方案

### 方案一：FRP 层移除认证（推荐）

修改 FRP client 配置，移除 `httpUser` 和 `httpPassword`：

```toml
[[proxies]]
name = "http-opencode"
type = "http"
localPort = 4097
subdomain = "opencode"
# httpUser = "用户名"      # 移除
# httpPassword = "密码"  # 移除
```

然后使用 opencode 内置的 `OPENCODE_SERVER_PASSWORD` 进行认证：

```yaml
# docker-compose.yml
environment:
  - OPENCODE_SERVER_PASSWORD=your_secure_password
  - OPENCODE_SERVER_USERNAME=admin # 可选，默认 "opencode"
```

### 方案二：opencode 添加公开路径白名单

在 opencode server 的认证中间件中添加静态资源白名单：

```typescript
// packages/opencode/src/server/server.ts
.use((c, next) => {
  if (c.req.method === "OPTIONS") return next()

  // Public paths that don't require authentication
  // PWA resources and static assets are fetched by browser without auth headers
  const publicPaths = [
    "/site.webmanifest",
    "/favicon",
    "/apple-touch-icon",
    "/web-app-manifest-",
    "/social-share.png",
  ]
  if (publicPaths.some((p) => c.req.path.startsWith(p))) return next()

  const password = Flag.OPENCODE_SERVER_PASSWORD
  if (!password) return next()
  const username = Flag.OPENCODE_SERVER_USERNAME ?? "opencode"
  return basicAuth({ username, password })(c, next)
})
```

## 技术细节

### PWA Manifest 请求特性

`<link rel="manifest" href="/site.webmanifest" />` 触发的请求：

1. 由浏览器**自动发起**，不是 JavaScript 代码
2. **不会继承页面的认证状态**
3. **不会携带 Authorization header**
4. 即使浏览器缓存了其他请求的认证信息，manifest 请求也不会使用

### 认证层级

```
┌─────────────────────────────────────────────────────────────┐
│  浏览器                                                       │
│    ↓                                                         │
│  nginx (80/443) ← 无认证                                      │
│    ↓                                                         │
│  FRP server (8011) ← vhostHTTPPort                            │
│    ↓ [FRP 隧道]                                               │
│  FRP client ← httpUser/httpPassword 认证 (401 来源)           │
│    ↓                                                         │
│  opencode server ← OPENCODE_SERVER_PASSWORD 认证              │
└─────────────────────────────────────────────────────────────┘
```

## 修改记录

| 文件                                     | 修改内容                        |
| ---------------------------------------- | ------------------------------- |
| `packages/opencode/src/server/server.ts` | 添加 PWA 静态资源公开路径白名单 |

## 相关文件

- `packages/opencode/src/server/server.ts` - 认证中间件
- `packages/opencode/src/flag/flag.ts` - `OPENCODE_SERVER_PASSWORD` 定义
- `packages/app/public/site.webmanifest` - PWA manifest 文件
- `packages/app/index.html` - manifest 引用

## 参考资料

- [MDN: Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)
- [FRP HTTP Proxy Authentication](https://gofrp.org/docs/features/http-ftp/)
- [Hono Basic Auth Middleware](https://hono.dev/docs/middleware/builtin/basic-auth)
