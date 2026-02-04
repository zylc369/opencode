# 插件模块

## 概述

通过钩子和自定义代码扩展 OpenCode 功能的插件系统。

## 组件

- **index.ts** - 主要插件系统
- **codex.ts** - OpenAI Codex 认证插件
- **copilot.ts** - GitHub Copilot 认证插件

## 插件钩子

| 钩子 | 描述 |
|------|-------------|
| `auth` | 认证钩子 |
| `config` | 配置钩子 |
| `event` | 事件钩子 |
| `tool` | 工具钩子 |
| `chat.*` | 聊天特定钩子 |

## 插件加载

插件从以下位置加载：
1. `.opencode/plugins/*.ts`（本地）
2. `opencode.json` 插件字段（npm 包）
3. `~/.opencode/plugins/`（全局）

## API

```typescript
import { Plugin } from "@/plugin"

// 触发钩子
await Plugin.trigger("hook:name", data, context)

// 注册钩子
Plugin.register("hook:name", (data, context) => {
  // 处理钩子
})
```

## 插件定义

```typescript
export const plugin = {
  name: "my-plugin",
  hooks: {
    auth: async (data, context) => {
      // 处理认证钩子
    }
  }
}
```

## 相关文件

- **src/plugin/index.ts**：主要插件系统
- **src/plugin/codex.ts**：Codex 插件
- **src/plugin/copilot.ts**：Copilot 插件
