# 工具模块

## 概述

提供整个代码库中常见功能的 22+ 工具模块集合。

## 工具列表

| 模块 | 描述 |
|--------|-------------|
| `abort.ts` | 中止信号工具 |
| `archive.ts` | 存档操作 |
| `color.ts` | 颜色工具 |
| `context.ts` | 上下文管理 |
| `defer.ts` | 延迟执行 |
| `eventloop.ts` | 事件循环工具 |
| `filesystem.ts` | 文件系统操作 |
| `fn.ts` | 函数工具 |
| `format.ts` | 格式化工具 |
| `iife.ts` | IIFE 助手 |
| `keybind.ts` | 键盘绑定解析 |
| `lazy.ts` | 惰性求值 |
| `locale.ts` | 国际化 |
| `lock.ts` | 文件锁定 |
| `log.ts` | 结构化日志 |
| `queue.ts` | 工作队列 |
| `rpc.ts` | RPC 工具 |
| `scrap.ts` | Scrap 操作 |
| `signal.ts` | 信号处理 |
| `timeout.ts` | 超时工具 |
| `token.ts` | 令牌工具 |
| `wildcard.ts` | 模式匹配 |

## 日志

```typescript
import { Log } from "@/util/log"

const log = Log.create({ service: "my-module" })

log.info("message", { data })
log.error("error", { error })
log.debug("调试信息")
```

## 文件系统

```typescript
import { Filesystem } from "@/util/filesystem"

// 向上查找文件
const files = await Filesystem.findUp("filename", start, stop)

// 向上遍历
for await (const dir of Filesystem.up({ targets, start, stop })) {
  // 处理目录
}
```

## 通配符匹配

```typescript
import { Wildcard } from "@/util/wildcard"

const matches = Wildcard.match(pattern, string)
```

## 锁

```typescript
import { Lock } from "@/util/lock"

await Lock.acquire(lockfile, async () => {
  // 临界区
})
```

## 队列

```typescript
import { Queue } from "@/util/queue"

const queue = new Queue()

queue.add(async () => {
  await processTask()
})
```

## 键绑定解析

```typescript
import { Keybind } from "@/util/keybind"

const parsed = Keybind.parse("ctrl+c,ctrl+d")
// 返回键绑定对象数组
```

## 超时

```typescript
import { Timeout } from "@/util/timeout"

await Timeout.set(5000, () => {
  // 超时回调
})
```

## 中止

```typescript
import { Abort } from "@/util/abort"

const controller = Abort.controller()
const signal = controller.signal

// 检查中止
if (signal.aborted) {
  // 处理中止
}
```

## 相关文件

- **src/util/log.ts**：日志
- **src/util/filesystem.ts**：文件操作
- **src/util/wildcard.ts**：模式匹配
- **src/util/lock.ts**：文件锁定
- **src/util/queue.ts**：工作队列
