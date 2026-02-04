# Utility Modules

## Overview

Collection of 22+ utility modules providing common functionality across the codebase.

## Utility List

| Module | Description |
|--------|-------------|
| `abort.ts` | Abort signal utilities |
| `archive.ts` | Archive operations |
| `color.ts` | Color utilities |
| `context.ts` | Context management |
| `defer.ts` | Defer execution |
| `eventloop.ts` | Event loop utilities |
| `filesystem.ts` | File system operations |
| `fn.ts` | Function utilities |
| `format.ts` | Formatting utilities |
| `iife.ts` | IIFE helpers |
| `keybind.ts` | Keyboard binding parsing |
| `lazy.ts` | Lazy evaluation |
| `locale.ts` | Internationalization |
| `lock.ts` | File locking |
| `log.ts` | Structured logging |
| `queue.ts` | Work queue |
| `rpc.ts` | RPC utilities |
| `scrap.ts` | Scrap operations |
| `signal.ts` | Signal handling |
| `timeout.ts` | Timeout utilities |
| `token.ts` | Token utilities |
| `wildcard.ts` | Pattern matching |

## Logging

```typescript
import { Log } from "@/util/log"

const log = Log.create({ service: "my-module" })

log.info("message", { data })
log.error("error", { error })
log.debug("debug info")
```

## Filesystem

```typescript
import { Filesystem } from "@/util/filesystem"

// Find files upward
const files = await Filesystem.findUp("filename", start, stop)

// Traverse upward
for await (const dir of Filesystem.up({ targets, start, stop })) {
  // Process directory
}
```

## Wildcard Matching

```typescript
import { Wildcard } from "@/util/wildcard"

const matches = Wildcard.match(pattern, string)
```

## Lock

```typescript
import { Lock } from "@/util/lock"

await Lock.acquire(lockfile, async () => {
  // Critical section
})
```

## Queue

```typescript
import { Queue } from "@/util/queue"

const queue = new Queue()

queue.add(async () => {
  await processTask()
})
```

## Keybind Parsing

```typescript
import { Keybind } from "@/util/keybind"

const parsed = Keybind.parse("ctrl+c,ctrl+d")
// Returns array of keybind objects
```

## Timeout

```typescript
import { Timeout } from "@/util/timeout"

await Timeout.set(5000, () => {
  // Timeout callback
})
```

## Abort

```typescript
import { Abort } from "@/util/abort"

const controller = Abort.controller()
const signal = controller.signal

// Check abort
if (signal.aborted) {
  // Handle abort
}
```

## Related Files

- **src/util/log.ts**: Logging
- **src/util/filesystem.ts**: File operations
- **src/util/wildcard.ts**: Pattern matching
- **src/util/lock.ts**: File locking
- **src/util/queue.ts**: Work queue
