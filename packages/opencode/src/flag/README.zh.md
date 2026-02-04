# 特性标志

## 概述

集中的特性标志和基于环境的配置管理。

## 标志

| 标志 | 环境变量 | 用途 |
|------|---------------------|---------|
| `OPENCODE_CONFIG` | `OPENCODE_CONFIG` | 自定义配置文件路径 |
| `OPENCODE_CONFIG_DIR` | `OPENCODE_CONFIG_DIR` | 额外的 .opencode 目录 |
| `OPENCODE_CONFIG_CONTENT` | `OPENCODE_CONFIG_CONTENT` | 内联 JSON 配置 |
| `OPENCODE_DISABLE_AUTOCOMPACT` | `OPENCODE_DISABLE_AUTOCOMPACT` | 禁用自动压缩 |
| `OPENCODE_DISABLE_PRUNE` | `OPENCODE_DISABLE_PRUNE` | 禁用上下文修剪 |
| `OPENCODE_DISABLE_AUTOUPDATE` | `OPENCODE_DISABLE_AUTOUPDATE` | 禁用自动更新 |
| `OPENCODE_DISABLE_PROJECT_CONFIG` | `OPENCODE_DISABLE_PROJECT_CONFIG` | 禁用项目配置 |
| `OPENCODE_PERMISSION` | `OPENCODE_PERMISSION` | 权限覆盖（JSON） |
| `OPENCODE_TEST_MANAGED_CONFIG_DIR` | `OPENCODE_TEST_MANAGED_CONFIG_DIR` | 测试托管配置路径 |

## API

```typescript
import { Flag } from "@/flag/flag"

if (Flag.OPENCODE_CONFIG) {
  // 使用自定义配置
}

if (Flag.OPENCODE_DISABLE_AUTOCOMPACT) {
  // 跳过自动压缩
}
```

## 相关文件

- **src/flag/flag.ts**：标志定义
