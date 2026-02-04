# 快照模块

## 概述

用于跟踪更改和启用回滚的文件快照。

## API

```typescript
import { Snapshot } from "@/snapshot"

// 创建快照
const snapshot = await Snapshot.create(path)

// 获取快照
const content = await Snapshot.get(path, hash)

// 列出快照
const snapshots = await Snapshot.list(path)
```

## 用例

- 跟踪文件更改
- 启用回滚
- 生成差异
- 更改历史

## 相关文件

- **src/snapshot/index.ts**：快照操作
