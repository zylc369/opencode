# 安装和版本管理

## 概述

处理版本检测、更新检查和安装方法检测。

## 安装方法

| 方法 | 描述 |
|--------|-------------|
| `local` | 开发/本地安装 |
| `npm` | 通过 npm 安装 |
| `bun` | 通过 bun 安装 |
| `homebrew` | 通过 Homebrew 安装 |
| `curl` | 通过 curl 脚本安装 |
| `unknown` | 无法确定 |

## API

### 版本信息

```typescript
import { Installation } from "@/installation"

const version = Installation.VERSION  // 当前版本
const method = await Installation.method()  // 安装方法
```

### 更新检查

```typescript
const latest = await Installation.latest(method)
// 返回最新版本字符串或 undefined
```

### 更新操作

```typescript
await Installation.upgrade(method, targetVersion)
```

### 事件

```typescript
// 有更新可用时发布
Installation.Event.UpdateAvailable = BusEvent.define(
  "installation.update-available",
  z.object({ version: z.string() })
)

// 成功更新后发布
Installation.Event.Updated = BusEvent.define(
  "installation.updated",
  z.object({ version: z.string() })
)
```

## 版本检测

系统通过检查以下内容来确定安装方法：
- 相对于全局 node_modules 的文件路径
- Homebrew 安装路径
- 可执行文件位置
- Package.json 元数据

## 相关文件

- **src/installation/index.ts**：安装逻辑
