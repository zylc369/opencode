# 分享模块

## 概述

处理会话分享功能，用于协作和导出。

## 组件

- **share.ts** - 原始分享实现
- **share-next.ts** - 新分享实现

## API

```typescript
import { Share } from "@/share"

// 分享会话
const url = await Share.create(session)

// 使用新实现分享
const url = await ShareNext.create(session)
```

## 相关文件

- **src/share/share.ts**：原始分享
- **src/share/share-next.ts**：新分享实现
