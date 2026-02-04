# 问题模块

## 概述

CLI 和 TUI 应用程序的交互式问题提示。

## API

```typescript
import { Question } from "@/question"

// 询问问题
const answer = await Question.ask({
  type: "text",
  message: "你叫什么名字？",
  default: "用户"
})

// 确认操作
const confirmed = await Question.confirm({
  message: "你确定吗？",
  default: false
})
```

## 问题类型

- `text` - 文本输入
- `confirm` - 是/否确认
- `select` - 从选项中选择
- `multiselect` - 选择多个选项

## 相关文件

- **src/question/index.ts**：问题实现
