# Snapshot and Storage Modules

## Overview

These modules provide file snapshotting for change tracking and persistent storage abstraction.

## Snapshot Module

### Overview

File snapshotting for tracking changes and enabling rollback.

### API

```typescript
import { Snapshot } from "@/snapshot"

// Create snapshot
const snapshot = await Snapshot.create(path)

// Get snapshot
const content = await Snapshot.get(path, hash)

// List snapshots
const snapshots = await Snapshot.list(path)
```

### Use Cases

- Track file changes
- Enable rollback
- Diff generation
- Change history

## Storage Module

### Overview

Persistent storage layer with JSON serialization and migrations.

### API

```typescript
import { Storage } from "@/storage"

// Read data
const data = await Storage.read(key)

// Write data
await Storage.write(key, data)

// Delete data
await Storage.remove(key)

// List keys
const keys = await Storage.list()
```

### Storage Location

Data is stored in `~/.local/state/opencode/`

### Migrations

Storage supports data migrations:

```typescript
Storage.migration(1, (data) => {
  // Migrate data from version 0 to 1
  return migratedData
})
```

## Related Files

- **src/snapshot/index.ts**: Snapshot operations
- **src/storage/storage.ts**: Storage implementation
