# Global Paths and Constants

## Overview

Provides global path definitions following XDG Base Directory specification and cache management.

## Paths

| Path | Location | Purpose |
|------|----------|---------|
| `Global.Path.config` | `~/.config/opencode` | User configuration |
| `Global.Path.data` | `~/.local/share/opencode` | Data files |
| `Global.Path.cache` | `~/.cache/opencode` | Cache files |
| `Global.Path.state` | `~/.local/state/opencode` | State files |
| `Global.Path.log` | `~/.local/state/opencode/log` | Log files |
| `Global.Path.bin` | Varies | Binary installation |
| `Global.Path.home` | `~` | User home directory |

## Cache Management

Cache is version-based for automatic invalidation:

```typescript
const cache = Global.cachePath("key")
// Returns path with version component
```

## Platform Differences

### macOS

- Config: `~/Library/Application Support/opencode`
- Data: `~/.local/share/opencode`
- Cache: `~/Library/Caches/opencode`

### Linux

- Config: `~/.config/opencode`
- Data: `~/.local/share/opencode`
- Cache: `~/.cache/opencode`

### Windows

- Config: `%APPDATA%\opencode`
- Data: `%LOCALAPPDATA%\opencode`
- Cache: `%TEMP%\opencode`

## Related Files

- **src/global/index.ts**: Path definitions
