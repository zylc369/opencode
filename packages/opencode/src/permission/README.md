# Permission Module

## Overview

Implements fine-grained access control for tool usage with wildcard matching and rule evaluation.

## Components

- **index.ts** - Permission utilities
- **next.ts** - Main permission engine
- **arity.ts** - Permission arity handling

## Permission Actions

| Action | Description |
|--------|-------------|
| `allow` | Permit the action |
| `deny` | Block the action |
| `ask` | Prompt user for approval |

## Permission Rules

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

## Wildcard Matching

The permission system supports glob-style wildcards:

- `*` - Match any sequence
- `**` - Match any path segments
- `?` - Match single character

## API

```typescript
import { PermissionNext } from "@/permission"

// Parse permissions from config
const ruleset = PermissionNext.fromConfig(config)

// Merge permissions
const merged = PermissionNext.merge(ruleset1, ruleset2)

// Check permission
const result = PermissionNext.check(ruleset, "bash", path)
```

## Related Files

- **src/permission/next.ts**: Permission engine
- **src/permission/arity.ts**: Permission arity
- **src/permission/index.ts**: Permission utilities
