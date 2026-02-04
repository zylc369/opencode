# 存储模块

## 概述

具有 JSON 序列化和迁移的持久化存储层。

## API

```typescript
import { Storage } from "@/storage"

// 读取数据
const data = await Storage.read(key)

// 写入数据
await Storage.write(key, data)

// 删除数据
await Storage.remove(key)

// 列出键
const keys = await Storage.list()
```

## 存储位置

数据存储在 `~/.local/state/opencode/` 中

## 迁移

存储支持数据迁移：

```typescript
Storage.migration(1, (data) => {
  // 将数据从版本 0 迁移到版本 1
  return migratedData
})
```

## 相关文件

- **src/storage/storage.ts**：存储实现
