# PTY 模块

## 概述

用于命令执行和正确终端处理的伪终端包装器。

## API

```typescript
import { PTY } from "@/pty"

// 为命令执行创建 PTY
const pty = new PTY(command, args, options)

// 写入 PTY
pty.write(data)

// 从 PTY 读取
const data = pty.read()

// 调整 PTY 大小
pty.resize(rows, cols)

// 关闭 PTY
pty.close()
```

## 用例

- 交互式命令执行
- 终端模拟
- 正确的信号处理
- 终端大小管理

## 相关文件

- **src/pty/index.ts**：PTY 实现
