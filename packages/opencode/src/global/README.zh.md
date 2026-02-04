# 全局路径和常量

## 概述

提供遵循 XDG 基础目录规范和缓存管理的全局路径定义。

## 路径

| 路径 | 位置 | 用途 |
|------|----------|---------|
| `Global.Path.config` | `~/.config/opencode` | 用户配置 |
| `Global.Path.data` | `~/.local/share/opencode` | 数据文件 |
| `Global.Path.cache` | `~/.cache/opencode` | 缓存文件 |
| `Global.Path.state` | `~/.local/state/opencode` | 状态文件 |
| `Global.Path.log` | `~/.local/state/opencode/log` | 日志文件 |
| `Global.Path.bin` | 各异 | 二进制安装 |
| `Global.Path.home` | `~` | 用户主目录 |

## 缓存管理

缓存基于版本以自动失效：

```typescript
const cache = Global.cachePath("key")
// 返回带有版本组件的路径
```

## 平台差异

### macOS

- Config：`~/Library/Application Support/opencode`
- Data：`~/.local/share/opencode`
- Cache：`~/Library/Caches/opencode`

### Linux

- Config：`~/.config/opencode`
- Data：`~/.local/share/opencode`
- Cache：`~/.cache/opencode`

### Windows

- Config：`%APPDATA%\opencode`
- Data：`%LOCALAPPDATA%\opencode`
- Cache：`%TEMP%\opencode`

## 相关文件

- **src/global/index.ts**：路径定义
