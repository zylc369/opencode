# Feature Flags

## Overview

Centralized feature flag and environment-based configuration management.

## Flags

| Flag | Environment Variable | Purpose |
|------|---------------------|---------|
| `OPENCODE_CONFIG` | `OPENCODE_CONFIG` | Custom config file path |
| `OPENCODE_CONFIG_DIR` | `OPENCODE_CONFIG_DIR` | Additional .opencode directory |
| `OPENCODE_CONFIG_CONTENT` | `OPENCODE_CONFIG_CONTENT` | Inline JSON config |
| `OPENCODE_DISABLE_AUTOCOMPACT` | `OPENCODE_DISABLE_AUTOCOMPACT` | Disable auto compaction |
| `OPENCODE_DISABLE_PRUNE` | `OPENCODE_DISABLE_PRUNE` | Disable context pruning |
| `OPENCODE_DISABLE_AUTOUPDATE` | `OPENCODE_DISABLE_AUTOUPDATE` | Disable auto-update |
| `OPENCODE_DISABLE_PROJECT_CONFIG` | `OPENCODE_DISABLE_PROJECT_CONFIG` | Disable project config |
| `OPENCODE_PERMISSION` | `OPENCODE_PERMISSION` | Permission overrides (JSON) |
| `OPENCODE_TEST_MANAGED_CONFIG_DIR` | `OPENCODE_TEST_MANAGED_CONFIG_DIR` | Test managed config path |

## API

```typescript
import { Flag } from "@/flag/flag"

if (Flag.OPENCODE_CONFIG) {
  // Use custom config
}

if (Flag.OPENCODE_DISABLE_AUTOCOMPACT) {
  // Skip auto compaction
}
```

## Related Files

- **src/flag/flag.ts**: Flag definitions
