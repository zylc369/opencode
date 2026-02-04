# Format Module

## Overview

Output formatting for terminal and UI display, including syntax highlighting, diff rendering, and text formatting.

## Components

### formatter.ts

Core formatting logic for:
- Syntax highlighting
- Diff rendering
- Markdown rendering
- Code block formatting

### index.ts

Public API for formatting operations.

## API

```typescript
import { Format } from "@/format"

// Format text
const formatted = Format.format(text, options)

// Render diff
const diff = Format.diff(original, modified)
```

## Related Files

- **src/format/formatter.ts**: Core formatting implementation
- **src/format/index.ts**: Public API
