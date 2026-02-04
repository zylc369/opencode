# PTY Module

## Overview

Pseudo-terminal wrapper for command execution with proper terminal handling.

## API

```typescript
import { PTY } from "@/pty"

// Create a PTY for command execution
const pty = new PTY(command, args, options)

// Write to PTY
pty.write(data)

// Read from PTY
const data = pty.read()

// Resize PTY
pty.resize(rows, cols)

// Close PTY
pty.close()
```

## Use Cases

- Interactive command execution
- Terminal emulation
- Proper signal handling
- Terminal size management

## Related Files

- **src/pty/index.ts**: PTY implementation
