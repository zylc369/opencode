# Installation and Version Management

## Overview

Handles version detection, update checking, and installation method detection.

## Installation Methods

| Method | Description |
|--------|-------------|
| `local` | Development/local installation |
| `npm` | Installed via npm |
| `bun` | Installed via bun |
| `homebrew` | Installed via Homebrew |
| `curl` | Installed via curl script |
| `unknown` | Unable to determine |

## API

### Version Information

```typescript
import { Installation } from "@/installation"

const version = Installation.VERSION  // Current version
const method = await Installation.method()  // Installation method
```

### Update Checking

```typescript
const latest = await Installation.latest(method)
// Returns latest version string or undefined
```

### Update Operations

```typescript
await Installation.upgrade(method, targetVersion)
```

### Events

```typescript
// Published when update is available
Installation.Event.UpdateAvailable = BusEvent.define(
  "installation.update-available",
  z.object({ version: z.string() })
)

// Published after successful update
Installation.Event.Updated = BusEvent.define(
  "installation.updated",
  z.object({ version: z.string() })
)
```

## Version Detection

The system determines the installation method by checking:
- File paths relative to global node_modules
- Homebrew installation paths
- Executable location
- Package.json metadata

## Related Files

- **src/installation/index.ts**: Installation logic
