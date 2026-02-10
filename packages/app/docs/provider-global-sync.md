# GlobalSyncProvider 代码分析文档

## createGlobalSync 分析

### 程序执行流程图

```mermaid
graph TB
    Start[调用 createGlobalSync] --> InitVars[初始化变量/上下文]
    
    subgraph 初始化阶段
        InitVars --> GetContext[获取SDK, Platform, Language上下文]
        GetContext --> GetOwner[获取SolidJS Owner]
        GetOwner --> OwnerCheck{Owner存在?}
        OwnerCheck -->|否| Error[抛出错误]
        OwnerCheck -->|是| InitStats[初始化统计对象]
        InitStats --> InitCaches[初始化缓存Map]
        InitCaches --> InitStore[初始化全局Store]
        InitStore --> InitQueue[初始化刷新队列]
        InitQueue --> InitChildren[初始化子Store管理器]
    end
    
    subgraph 资源加载阶段
        InitChildren --> LoadProjects[加载缓存的项目数据]
        LoadProjects --> SetupEffects[设置响应式Effects]
        SetupEffects --> SetupEventListeners[设置SDK事件监听器]
        SetupEventListeners --> SetupCleanup[设置清理处理器]
        SetupCleanup --> TriggerBootstrap[触发全局Bootstrap]
    end
    
    subgraph 运行时操作
        TriggerBootstrap --> WaitEvents[等待事件]
        WaitEvents --> HandleEvent{事件类型?}
        
        HandleEvent -->|全局事件| HandleGlobal[处理全局事件]
        HandleGlobal --> ApplyGlobalEvent[应用全局事件更新]
        ApplyGlobalEvent --> UpdateGlobalStore[更新全局Store]
        UpdateGlobalStore --> RefreshQueue[触发刷新队列]
        
        HandleEvent -->|目录事件| HandleDirectory[处理目录事件]
        HandleDirectory --> CheckDirectory{目录Store存在?}
        CheckDirectory -->|否| Skip[跳过处理]
        CheckDirectory -->|是| ApplyDirEvent[应用目录事件]
        ApplyDirEvent --> MarkActive[标记目录活跃]
        MarkActive --> UpdateDirectory[更新目录Store]
        UpdateDirectory --> QueueOperation[将操作加入队列]
        
        RefreshQueue --> ProcessQueue{队列处理}
        ProcessQueue --> BootstrapDir[执行目录Bootstrap]
        BootstrapDir --> LoadSessions[加载会话数据]
        LoadSessions --> UpdateCache[更新会话缓存]
        
        QueueOperation --> BootstrapInstance[执行目录实例Bootstrap]
        BootstrapInstance --> LoadSessionData[加载会话数据]
        LoadSessionData --> UpdateDirStore[更新目录Store]
    end
    
    subgraph 清理阶段
        WaitEvents --> OnCleanup[组件卸载]
        OnCleanup --> Unsubscribe[取消事件订阅]
        Unsubscribe --> DisposeQueue[销毁刷新队列]
        DisposeQueue --> DisposeChildren[销毁所有子Store]
        DisposeChildren --> CleanupDone[清理完成]
    end
    
    UpdateGlobalStore --> PersistProjects[持久化项目数据]
    UpdateDirectory --> TriggerLSP{需要LSP?}
    TriggerLSP -->|是| LoadLSPStatus[加载LSP状态]
    LoadLSPStatus --> UpdateLSP[更新LSP状态]
    
    PersistProjects --> WaitEvents
    UpdateLSP --> WaitEvents
    UpdateCache --> WaitEvents
    UpdateDirStore --> WaitEvents
```



### 主要模块说明

#### 1. 初始化阶段 (Initialization)

- **获取上下文**: 获取SDK、平台、语言等依赖
- **创建Store**: 初始化全局状态存储
- **创建缓存**: 设置各种缓存(Map结构)
- **创建队列**: 建立刷新队列管理系统
- **创建子管理器**: 管理目录级别的子Store



#### 2. 资源加载阶段 (Resource Loading)

- **加载缓存项目**: 从持久化存储读取项目列表
- **设置Effects**: 建立响应式副作用监听
- **事件监听**: 订阅全局SDK事件
- **清理准备**: 设置组件卸载时的清理逻辑



#### 3. 运行时操作 (Runtime Operations)

- **事件处理**:
  - 全局事件 → 更新全局状态
  - 目录事件 → 更新目录特定状态
- **队列处理**:
  - 异步执行bootstrap操作
  - 管理目录加载顺序
- **会话加载**:
  - 缓存优先，回退到网络请求
  - 权限过滤和数量限制



#### 4. 数据流方向

```text
用户操作/系统事件 → SDK事件监听器 → 事件分发 → 状态更新 → UI更新
                            ↓
                    队列管理异步操作
                            ↓
                    持久化缓存更新
```



#### 5. 关键异步操作流程

```text
loadSessions:
  检查缓存 → 命中 → 使用缓存数据
         ↓ 未命中
  网络请求 → 成功 → 更新缓存 → 更新Store
         ↓ 失败
  错误处理 → 用户提示
```



```text
bootstrapInstance:
  检查是否正在启动 → 是 → 等待现有promise
               ↓ 否
  锁定目录 → SDK调用 → 数据加载 → 更新Store → 释放锁
```



#### 6. 清理机制

- 组件卸载时自动清理所有资源
- 目录销毁时清理相关缓存
- 事件监听器的正确取消订阅