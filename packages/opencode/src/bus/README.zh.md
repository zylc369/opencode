# 事件总线系统

## 概述

事件总线为模块间的松耦合提供事件驱动架构。它支持带有通配符订阅的实例作用域事件，以及用于跨实例通信的全局事件发射器。

## 架构

### 组件

- **bus/index.ts**：带有实例作用域状态的主要发布/订阅实现
- **bus/bus-event.ts**：类型化的事件定义注册表
- **bus/global.ts**：用于跨实例事件的全局事件发射器

### 事件定义

使用 `BusEvent.define()` 函数定义事件：

```typescript
import { BusEvent } from "@/bus"
import z from "zod"

export const MyEvent = BusEvent.define(
  "module.action",
  z.object({
    id: z.string(),
    data: z.string(),
  })
)
```

这创建了一个可用于总线 API 的类型化事件定义。

## API

### 发布事件

```typescript
import { Bus } from "@/bus"
import { MyEvent } from "./events"

await Bus.publish(MyEvent, {
  id: "123",
  data: "hello"
})
```

事件发布到：
1. 特定事件类型的订阅者
2. 通配符订阅者（`*`）
3. 全局总线（带有目录上下文）

### 订阅事件

```typescript
// 订阅特定事件
const unsubscribe = Bus.subscribe(MyEvent, (event) => {
  console.log(event.type)      // "module.action"
  console.log(event.properties) // { id: "123", data: "hello" }
})

// 稍后取消订阅
unsubscribe()
```

### 一次性订阅

```typescript
Bus.once(MyEvent, (event) => {
  console.log("调用一次")
  return "done"  // 返回 "done" 以取消订阅
})
```

### 通配符订阅

```typescript
const unsubscribe = Bus.subscribeAll((event) => {
  console.log("任何事件：", event.type)
})
```

## 实例作用域事件

事件总线通过 `Instance.state()` 实例作用域化。这意味着：
- 每个项目/工作区都有自己的事件订阅
- 事件按实例隔离
- 实例处置触发清理事件

### 实例处置

当实例被处置时，自动发布 `Bus.InstanceDisposed`：

```typescript
Bus.InstanceDisposed = {
  type: "server.instance.disposed",
  properties: { directory: string }
}
```

## 全局事件

`GlobalBus`（EventEmitter）接收来自所有实例的所有事件：

```typescript
import { GlobalBus } from "@/bus/global"

GlobalBus.on("event", ({ directory, payload }) => {
  console.log(`在 ${directory} 中的事件：`, payload)
})
```

这支持跨实例通信，用于：
- 多项目监控
- 协调更新
- 全局状态同步

## 内置事件

### 实例处置

```typescript
Bus.InstanceDisposed = BusEvent.define(
  "server.instance.disposed",
  z.object({ directory: z.string() })
)
```

实例被处置时发出。

## 事件注册表

`BusEvent.payloads()` 函数返回一个表示所有已注册事件的 Zod 架构：

```typescript
const EventSchema = BusEvent.payloads()
// 所有事件类型的 discriminatedUnion
```

这支持：
- 类型安全的事件处理
- 事件验证
- 事件序列化/反序列化

## 使用模式

### 模块通信

```typescript
// 在模块 A 中
export const FileChanged = BusEvent.define(
  "file.changed",
  z.object({ path: z.string() })
)

await Bus.publish(FileChanged, { path: "/src/test.ts" })

// 在模块 B 中
Bus.subscribe(FileChanged, ({ properties }) => {
  console.log("文件已更改：", properties.path)
})
```

### 处置时清理

```typescript
Bus.subscribe(Bus.InstanceDisposed, ({ properties }) => {
  cleanupResources(properties.directory)
})
```

### 插件钩子

插件系统使用事件总线来执行钩子：

```typescript
Bus.subscribe(PluginHookEvent, async ({ properties }) => {
  // 触发插件钩子
})
```

## 相关文件

- **src/bus/index.ts**：主要事件总线实现
- **src/bus/bus-event.ts**：事件定义注册表
- **src/bus/global.ts**：全局事件发射器
- **src/project/instance.ts**：实例作用域状态
- **src/plugin/index.ts**：使用事件的插件钩子
