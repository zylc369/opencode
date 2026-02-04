# HTTP 服务层

HTTP 服务层使用 Hono 框架提供 REST API 和 SSE 事件流。

## 核心结构

```typescript
const app = new Hono()
  // 错误处理
  .onError((err, c) => { /* ... */ })

  // 基础认证
  .use((c, next) => {
    const password = Flag.OPENCODE_SERVER_PASSWORD
    if (!password) return next()
    return basicAuth({ username, password })(c, next)
  })

  // 请求日志
  .use(async (c, next) => {
    log.info("request", { method: c.req.method, path: c.req.path })
    await next()
  })

  // CORS
  .use(cors({ /* ... */ }))

  // 实例上下文（中间件）
  .use(async (c, next) => {
    const directory = c.req.query("directory") || c.req.header("x-opencode-directory") || process.cwd()
    return Instance.provide({
      directory,
      init: InstanceBootstrap,
      async fn() {
        return next()
      },
    })
  })

  // 路由
  .route("/project", ProjectRoutes())
  .route("/session", SessionRoutes())
  .route("/permission", PermissionRoutes())
  // ... 更多路由
```

## SSE 事件流

```typescript
.get("/event", async (c) => {
  return streamSSE(c, async (stream) => {
    // 发送连接事件
    stream.writeSSE({
      data: JSON.stringify({
        type: "server.connected",
        properties: {},
      }),
    })

    // 订阅所有事件
    const unsub = Bus.subscribeAll(async (event) => {
      await stream.writeSSE({
        data: JSON.stringify(event),
      })
    })

    // 心跳保持连接
    const heartbeat = setInterval(() => {
      stream.writeSSE({
        data: JSON.stringify({
          type: "server.heartbeat",
          properties: {},
        }),
      })
    }, 30000)

    // 等待断开
    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        clearInterval(heartbeat)
        unsub()
        resolve()
      })
    })
  })
})
```

## 主要路由

| 路由 | 描述 |
|------|------|
| `/project` | 项目操作 |
| `/session` | 会话管理 |
| `/permission` | 权限请求 |
| `/question` | 用户交互 |
| `/provider` | 提供商信息 |
| `/config` | 配置管理 |
| `/event` | SSE 事件流 |
| `/auth` | 认证管理 |

## 学习检查点

完成本章学习后，你应该能够：

1. ✅ 理解 Hono 应用结构
2. ✅ 掌握中间件的使用
3. ✅ 理解 SSE 事件流实现
4. ✅ 了解主要 API 路由
