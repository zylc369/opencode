# 环境变量

## 概述

用于通过 `process.env` 访问环境变量的简单包装器。

## API

```typescript
import { Env } from "@/env"

// 获取环境变量
const value = Env.get("VARIABLE_NAME")

// 所有环境变量都通过 process.env 访问
const home = process.env.HOME
const path = process.env.PATH
```

## 相关文件

- **src/env/index.ts**：主要实现
