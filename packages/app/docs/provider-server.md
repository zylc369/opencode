# ServerProvider 代码分析文档

## 概述

`ServerProvider` 是 OpenCode 应用中负责管理服务器连接的核心 Provider。它提供了服务器列表管理、健康检查、项目跟踪等功能，是应用与后端服务交互的基础。



## init 调用流程图

**`origin`、`projectsList`、`isLocal` 是 `createMemo` 创建的响应式计算值，在组件初始化时会立即执行一次（用于建立依赖关系），而 `createEffect` 是在当前渲染周期结束后、下一次微任务中异步执行的。**

所以你会看到：

- 先执行了 `origin()`、`projectsList()`、`isLocal()`（因为它们是 `createMemo`）
- 然后才执行 `createEffect` 中设置 `active` 的逻辑

**原理解析：**

1. **`createMemo` 是同步执行的**：`createMemo` 在创建时会 **立即执行一次函数体**。

1. **`createEffect` 是异步调度的**：
   1. SolidJS 的 `createEffect` **不会在组件初始化时立即同步执行**。
   1. 它会在 **当前响应式上下文（render/update）完成后**，通过 `Promise.resolve().then(...)` 或类似机制 **异步调度**。
   1. 这是为了避免在计算过程中产生副作用（符合响应式最佳实践）。


```text
[Start]
   │
   ▼
[app.tsx] <ServerProvider defaultUrl={defaultServerUrl()}> 设置 defaultUrl = http://localhost:4096
   │
   ▼
[server] 初始化 origin 状态：
        active = ""（它是激活的域名，是当前打开opencode web端的域名。）
        projectsKey = ""（将域名转换为key，如果是本地启动的web端key是local，示例见《服务端配置示例》中的local。）
   │
   ▼
[server] 加载 projectsList：
        key = "" → projectsList = []（示例见《服务端配置示例》中的local。）
   │
   ▼
[server] 判断 isLocal：
        origin = "" → isLocal = false
   │
   ▼
[server] createEffect 触发 [setState][active]：
        url = http://localhost:4096
        defaultUrl = http://localhost:4096
        → 设置 active = "http://localhost:4096"
   │
   ▼
[server] createEffect 触发 [setState][healthy]：
        检查 url = http://localhost:4096 的健康状态
   │
   ▼
[server] 更新 origin 状态：
        active = "http://localhost:4096"
        projectsKey = "local"
   │
   ▼
[server] 重新加载 projectsList：
        key = "local"
        → projectsList = [
              { worktree: "/Users/aserlili/Documents/Codes/PersonalAssistant", expanded: true }
           ]
   │
   ▼
[server] 重新判断 isLocal：
        origin = "local" → isLocal = true
   │
   ▼
[End - Initialization Complete]
```



## 配置示例

### 服务端配置示例

```json
{
    "list": [],
    "projects": {
        "local": [
            {
                "worktree": "/a/b/c/ProjectA",
                "expanded": true
            },
            {
                "worktree": "/a/b/c/ProjectB",
                "expanded": true
            }
        ]
    },
    "lastProject": {
        "local": "/a/b/c/ProjectB"
    }
}
```

