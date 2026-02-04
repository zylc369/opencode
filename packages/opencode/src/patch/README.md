# Patch, Permission, and Plugin Modules

## Overview

These three modules provide core system functionality:
- **patch/** - Unified diff handling and patch application
- **permission/** - Fine-grained access control system
- **plugin/** - Plugin system for extensibility

## Patch Module

### Overview

Handles unified diff format parsing and application.

### API

```typescript
import { Patch } from "@/patch"

// Parse a unified diff
const patches = Patch.parse(diffString)

// Apply a patch
const result = Patch.apply(originalContent, patch)

// Format as unified diff
const diff = Patch.format(original, modified)
```

## Permission Module

### Overview

Implements fine-grained access control for tool usage with wildcard matching and rule evaluation.

### Components

- **index.ts** - Permission utilities
- **next.ts** - Main permission engine
- **arity.ts** - Permission arity handling

### Permission Actions

| Action | Description |
|--------|-------------|
| `allow` | Permit the action |
| `deny` | Block the action |
| `ask` | Prompt user for approval |

### Permission Rules

```typescript
{
  "*": "allow",                    // Wildcard: allow all
  "bash": "deny",                  // Deny bash commands
  "read": {                        // Object rules
    "*.env": "ask",                // Ask for .env files
    "*": "allow"                   // Allow other files
  },
  "edit": {
    "sensitive/**": "deny"         // Deny edits to sensitive dir
  }
}
```

### Wildcard Matching

The permission system supports glob-style wildcards:

- `*` - Match any sequence
- `**` - Match any path segments
- `?` - Match single character

### API

```typescript
import { PermissionNext } from "@/permission"

// Parse permissions from config
const ruleset = PermissionNext.fromConfig(config)

// Merge permissions
const merged = PermissionNext.merge(ruleset1, ruleset2)

// Check permission
const result = PermissionNext.check(ruleset, "bash", path)
```

## Plugin Module

### Overview

Plugin system for extending OpenCode functionality through hooks and custom code.

### Built-in Plugins

- **codex.ts** - OpenAI Codex authentication plugin
- **copilot.ts** - GitHub Copilot authentication plugin

### Plugin Hooks

| Hook | Description |
|------|-------------|
| `auth` | Authentication hooks |
| `config` | Configuration hooks |
| `event` | Event hooks |
| `tool` | Tool hooks |
| `chat.*` | Chat-specific hooks |

### Plugin Loading

Plugins are loaded from:
1. `.opencode/plugins/*.ts` (local)
2. `opencode.json` plugin field (npm packages)
3. `~/.opencode/plugins/` (global)

### API

```typescript
import { Plugin } from "@/plugin"

// Trigger a hook
await Plugin.trigger("hook:name", data, context)

// Register a hook
Plugin.register("hook:name", (data, context) => {
  // Handle hook
})
```

### Plugin Definition

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

- **src/patch/index.ts**: Patch operations
- **src/permission/next.ts**: Permission engine
- **src/permission/arity.ts**: Permission arity
- **src/plugin/index.ts**: Plugin system
- **src/plugin/codex.ts**: Codex plugin
- **src/plugin/copilot.ts**: Copilot plugin
