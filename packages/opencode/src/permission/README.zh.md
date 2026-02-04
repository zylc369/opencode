# 权限模块

## 概述

实现工具使用的细粒度访问控制，支持通配符匹配和规则评估。

## 组件

- **index.ts** - 权限工具
- **next.ts** - 主要权限引擎
- **arity.ts** - 权限元数处理

## 权限操作

| 操作 | 描述 |
|--------|-------------|
| `allow` | 允许操作 |
| `deny` | 阻止操作 |
| `ask` | 提示用户批准 |

## 权限规则

```typescript
{
  "*": "allow",                    // 通配符：允许所有
  "bash": "deny",                  // 拒绝 bash 命令
  "read": {                        // 对象规则
    "*.env": "ask",                // 询问 .env 文件
    "*": "allow"                   // 允许其他文件
  },
  "edit": {
    "sensitive/**": "deny"         // 拒绝对敏感目录的编辑
  }
}
```

## 通配符匹配

权限系统支持 glob 风格的通配符：
- `*` - 匹配任何序列
- `**` - 匹配任何路径段
- `?` - 匹配单个字符

## API

```typescript
import { PermissionNext } from "@/permission"

// 从配置解析权限
const ruleset = PermissionNext.fromConfig(config)

// 合并权限
const merged = PermissionNext.merge(ruleset1, ruleset2)

// 检查权限
const result = PermissionNext.check(ruleset, "bash", path)
```

## 相关文件

- **src/permission/next.ts**：权限引擎
- **src/permission/arity.ts**：权限元数
- **src/permission/index.ts**：权限工具
