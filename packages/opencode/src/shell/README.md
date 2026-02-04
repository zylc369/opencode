# Shell Module

## Overview

Shell detection and execution utilities.

## API

```typescript
import { Shell } from "@/shell"

// Detect shell
const shell = Shell.detect()
// Returns "bash", "zsh", "fish", etc.

// Execute command
const result = await Shell.exec(command, args)
```

## Related Files

- **src/shell/shell.ts**: Shell utilities
