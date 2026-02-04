# Environment Variables

## Overview

Simple wrapper for accessing environment variables via `process.env`.

## API

```typescript
import { Env } from "@/env"

// Get environment variable
const value = Env.get("VARIABLE_NAME")

// All environment variables are accessed via process.env
const home = process.env.HOME
const path = process.env.PATH
```

## Related Files

- **src/env/index.ts**: Main implementation
