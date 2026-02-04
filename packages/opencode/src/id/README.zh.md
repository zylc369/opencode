# 标识符生成

## 概述

生成具有持久化的唯一递增标识符，用于跟踪实体。

## API

```typescript
import { ID } from "@/id"

const id1 = await ID.generate()  // "1"
const id2 = await ID.generate()  // "2"
```

## 实现

ID 存储在文件中，每次生成时递增。这确保：
- 跨重启的唯一性
- 递增顺序
- 持久性

## 相关文件

- **src/id/id.ts**：ID 生成实现
