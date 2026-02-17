# GlobalSDKProvider 代码分析文档

## 概述

`GlobalSDKProvider` 是 OpenCode 应用中最核心的 Provider 之一，负责管理全局的 SDK 客户端和服务器发送事件（SSE）连接。它提供了统一的 API 客户端和实时事件分发机制。



## 总体架构图

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                        GlobalSDKProvider                                 │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      createSimpleContext                        │   │
│  │                                                                 │   │
│  │  init() {                                                      │   │
│  │    ├─ 1. 获取依赖 (server, platform)                            │   │
│  │    ├─ 2. 创建 SSE 客户端 (eventSdk)                            │   │
│  │    ├─ 3. 创建全局事件发射器 (emitter)                          │   │
│  │    ├─ 4. 初始化事件队列系统                                     │   │
│  │    │    ├─ queue/buffer: 双缓冲队列                             │   │
│  │    │    ├─ coalesced: 合并事件映射表                           │   │
│  │    │    └─ timer: 刷新定时器                                   │   │
│  │    ├─ 5. 启动 SSE 事件循环                                     │   │
│  │    ├─ 6. 创建 API 客户端 (sdk)                                 │   │
│  │    └─ 7. 设置清理函数                                         │   │
│  │  }                                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```



## 详细执行流程

### 1. 初始化阶段 (Initialization)

```Mermaid
flowchart TD
    A[GlobalSDKProvider 创建] --> B[调用 init 函数]
    
    B --> C[获取依赖项]
    C --> D[useServer<br/>获取服务器配置]
    C --> E[usePlatform<br/>获取平台功能]
    
    D --> F[创建 AbortController]
    E --> F
    
    F --> G[创建 SSE 客户端 eventSdk]
    G --> H[创建全局事件发射器 emitter]
    
    H --> I[初始化队列系统]
    subgraph I [队列系统初始化]
        direction LR
        I1[queue: 事件队列]
        I2[buffer: 双缓冲区]
        I3[coalesced: 合并映射]
        I4[timer: undefined]
        I5[last: 0]
    end
    
    I --> J[定义内部函数]
    subgraph J [内部函数定义]
        direction LR
        J1[key函数]
        J2[flush函数]
        J3[schedule函数]
    end
    
    J --> K[启动 SSE 事件循环]
    K --> L[创建 API 客户端 sdk]
    
    L --> M[设置清理函数 onCleanup]
    M --> N[返回上下文对象]
    
    subgraph N [返回对象结构]
        direction LR
        N1[url]
        N2[client]
        N3[event]
    end
```



### 2. SSE 事件循环流程 (SSE Event Loop)

```mermaid
graph TD
    A[SSE 事件循环开始] --> B[建立 SSE 连接 eventSdk.global.event]
    B --> C{开始遍历 stream}
    C --> D[收到新事件 event]
    D --> E[提取 directory 和 payload]
    E --> F[生成事件合并键 key]
    
    F --> G{事件是否需要合并?}
    G -- 是 --> H[查找已存在的相同键事件]
    H --> I[标记旧事件为 undefined]
    I --> J[记录新事件位置]
    G -- 否 --> J
    
    J --> K[将事件加入队列 queue.push]
    K --> L[调度刷新 schedule]
    
    L --> M{需要让出事件循环?}
    M -- 是 --> N[setTimeout 让出控制权]
    N --> C
    M -- 否 --> C
    
    C -- 连接结束 --> O[最终刷新 flush]
    O --> P[处理错误/结束]
```



### 3. 事件合并逻辑 (Event Coalescing)

```mermaid
graph TD
    A[收到事件] --> B[检查事件类型]
    
    B --> C{事件类型}
    C -- session.status --> D[按 sessionID 合并]
    C -- lsp.updated --> E[按 directory 合并]
    C -- message.part.updated --> F[按 messageID + part.id 合并]
    C -- 其他事件 --> G[不合并]
    
    D --> H[生成键: session.status:directory:sessionID]
    E --> I[生成键: lsp.updated:directory]
    F --> J[生成键: message.part.updated:directory:messageID:partID]
    G --> K[返回 undefined]
    
    H --> L[检查 coalesced Map]
    I --> L
    J --> L
    K --> M[跳过合并逻辑]
    
    L --> N{键已存在?}
    N -- 是 --> O[标记旧事件为 undefined]
    N -- 否 --> P[直接添加新事件]
    O --> P
```



### 4. 事件刷新流程 (Flush Process)

```mermaid
graph TD
    A[schedule 被调用] --> B{定时器已存在?}
    B -- 是 --> C[直接返回]
    B -- 否 --> D[计算延迟时间]
    D --> E[设置定时器 setTimeout]
    
    E --> F[定时器触发]
    F --> G[调用 flush 函数]
    G --> H[清除定时器]
    H --> I{队列为空?}
    I -- 是 --> J[直接返回]
    I -- 否 --> K[交换队列和缓冲区]
    
    K --> L[清空合并映射表]
    L --> M[记录刷新时间]
    M --> N[开始 batch 操作]
    
    N --> O[遍历所有事件]
    O --> P{事件有效?}
    P -- 是 --> Q[通过 emitter 分发事件]
    P -- 否 --> R[跳过]
    
    Q --> O
    R --> O
    
    O -- 遍历完成 --> S[结束 batch 操作]
    S --> T[清空缓冲区]
    T --> U[流程结束]
```



### 5. 清理流程 (Cleanup)

```mermaid
graph TD
    A[组件卸载] --> B[触发 onCleanup]
    B --> C[AbortController.abort]
    C --> D[中断 SSE 连接]
    D --> E[调用 flush]
    E --> F[处理剩余事件]
    F --> G[清理完成]
```



## 关键数据结构

typescript

```typescript
// 事件队列系统
let queue: Array<Queued | undefined> = []      // 当前处理队列
let buffer: Array<Queued | undefined> = []     // 双缓冲区
const coalesced = new Map<string, number>()   // 合并事件映射
let timer: ReturnType<typeof setTimeout> | undefined  // 刷新定时器
let last = 0                                   // 上次刷新时间戳

// 事件类型
type Queued = {
  directory: string  // 项目目录
  payload: Event     // 事件负载
}

// 返回对象
return {
  url: server.url,           // 服务器 URL
  client: sdk,               // API 客户端
  event: emitter            // 事件发射器
}
```



## 性能优化策略

1. **事件合并 (Coalescing)**
   - 高频率事件自动合并
   - 避免重复渲染
2. **双缓冲队列 (Double Buffering)**
   - 处理时锁定队列
   - 新事件进入新队列
3. **批量更新 (Batching)**
   - SolidJS batch 包装
   - 最小化重新渲染
4. **事件循环让步 (Event Loop Yielding)**
   - 8ms 检查点
   - 防止阻塞 UI
5. **防抖调度 (Debounced Scheduling)**
   - 16ms 目标帧率 (60fps)
   - 合并连续调度

## 使用示例

typescript

```
// 在组件中使用
const sdk = useGlobalSDK()

// 调用 API
sdk.client.projects.list()

// 监听事件
createEffect(() => {
  sdk.event.on("project-dir", (event) => {
    // 处理事件
  })
})
```



这个 SDK 上下文管理了 OpenCode 的 SSE 连接和 API 客户端，通过智能的事件合并和批处理机制，在高频率事件场景下依然能保持流畅的 UI 响应。
