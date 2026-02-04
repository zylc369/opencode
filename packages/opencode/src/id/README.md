# Identifier Generation

## Overview

Generates unique ascending identifiers with persistence for tracking entities.

## API

```typescript
import { ID } from "@/id"

const id1 = await ID.generate()  // "1"
const id2 = await ID.generate()  // "2"
```

## Implementation

IDs are stored in a file and incremented on each generation. This ensures:
- Uniqueness across restarts
- Ascending order
- Persistence

## Related Files

- **src/id/id.ts**: ID generation implementation
