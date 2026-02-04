# 调度器模块

## 概述

用于延迟执行的简单任务调度工具。

## API

```typescript
import { Scheduler } from "@/scheduler"

// 调度任务
Scheduler.schedule(() => {
  console.log("任务已执行")
}, delay)
```

## 相关文件

- **src/scheduler/index.ts**：调度器实现
