# Scheduler Module

## Overview

Simple task scheduling utilities for deferred execution.

## API

```typescript
import { Scheduler } from "@/scheduler"

// Schedule a task
Scheduler.schedule(() => {
  console.log("Task executed")
}, delay)
```

## Related Files

- **src/scheduler/index.ts**: Scheduler implementation
