# Storage Module

## Overview

Persistent storage layer with JSON serialization and migrations.

## API

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

## Storage Location

Data is stored in `~/.local/state/opencode/`

## Migrations

Storage supports data migrations:

```typescript
Storage.migration(1, (data) => {
  // Migrate data from version 0 to 1
  return migratedData
})
```

## Related Files

- **src/storage/storage.ts**: Storage implementation
