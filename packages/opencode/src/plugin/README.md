# Plugin Module

## Overview

Plugin system for extending OpenCode functionality through hooks and custom code.

## Components

- **index.ts** - Main plugin system
- **codex.ts** - OpenAI Codex authentication plugin
- **copilot.ts** - GitHub Copilot authentication plugin

## Plugin Hooks

| Hook | Description |
|------|-------------|
| `auth` | Authentication hooks |
| `config` | Configuration hooks |
| `event` | Event hooks |
| `tool` | Tool hooks |
| `chat.*` | Chat-specific hooks |

## Plugin Loading

Plugins are loaded from:
1. `.opencode/plugins/*.ts` (local)
2. `opencode.json` plugin field (npm packages)
3. `~/.opencode/plugins/` (global)

## API

```typescript
import { Plugin } from "@/plugin"

// Trigger a hook
await Plugin.trigger("hook:name", data, context)

// Register a hook
Plugin.register("hook:name", (data, context) => {
  // Handle hook
})
```

## Plugin Definition

```typescript
export const plugin = {
  name: "my-plugin",
  hooks: {
    auth: async (data, context) => {
      // Handle auth hook
    }
  }
}
```

## Related Files

- **src/plugin/index.ts**: Main plugin system
- **src/plugin/codex.ts**: Codex plugin
- **src/plugin/copilot.ts**: Copilot plugin
