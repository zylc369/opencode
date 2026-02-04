# Event Bus System

## Overview

The event bus provides an event-driven architecture for loose coupling between modules. It supports instance-scoped events with wildcard subscriptions and a global event emitter for cross-instance communication.

## Architecture

### Components

- **bus/index.ts**: Main pub/sub implementation with instance-scoped state
- **bus/bus-event.ts**: Typed event definition registry
- **bus/global.ts**: Global event emitter for cross-instance events

### Event Definition

Events are defined using the `BusEvent.define()` function:

```typescript
import { BusEvent } from "@/bus"
import z from "zod"

export const MyEvent = BusEvent.define(
  "module.action",
  z.object({
    id: z.string(),
    data: z.string(),
  })
)
```

This creates a typed event definition that can be used with the bus API.

## API

### Publishing Events

```typescript
import { Bus } from "@/bus"
import { MyEvent } from "./events"

await Bus.publish(MyEvent, {
  id: "123",
  data: "hello"
})
```

Events are published to:
1. Subscribers of the specific event type
2. Wildcard subscribers (`*`)
3. Global bus (with directory context)

### Subscribing to Events

```typescript
// Subscribe to specific event
const unsubscribe = Bus.subscribe(MyEvent, (event) => {
  console.log(event.type)      // "module.action"
  console.log(event.properties) // { id: "123", data: "hello" }
})

// Unsubscribe later
unsubscribe()
```

### One-time Subscription

```typescript
Bus.once(MyEvent, (event) => {
  console.log("Called once")
  return "done"  // Return "done" to unsubscribe
})
```

### Wildcard Subscription

```typescript
const unsubscribe = Bus.subscribeAll((event) => {
  console.log("Any event:", event.type)
})
```

## Instance-Scoped Events

The event bus is instance-scoped via `Instance.state()`. This means:
- Each project/workspace has its own event subscriptions
- Events are isolated per instance
- Instance disposal triggers cleanup events

### Instance Disposal

When an instance is disposed, `Bus.InstanceDisposed` is automatically published:

```typescript
Bus.InstanceDisposed = {
  type: "server.instance.disposed",
  properties: { directory: string }
}
```

## Global Events

The `GlobalBus` (EventEmitter) receives all events from all instances:

```typescript
import { GlobalBus } from "@/bus/global"

GlobalBus.on("event", ({ directory, payload }) => {
  console.log(`Event in ${directory}:`, payload)
})
```

This enables cross-instance communication for features like:
- Multi-project monitoring
- Coordinated updates
- Global state synchronization

## Built-in Events

### Instance Disposed

```typescript
Bus.InstanceDisposed = BusEvent.define(
  "server.instance.disposed",
  z.object({ directory: z.string() })
)
```

Emitted when an instance is disposed.

## Event Registry

The `BusEvent.payloads()` function returns a Zod schema representing all registered events:

```typescript
const EventSchema = BusEvent.payloads()
// discriminatedUnion of all event types
```

This enables:
- Type-safe event handling
- Event validation
- Event serialization/deserialization

## Usage Patterns

### Module Communication

```typescript
// In module A
export const FileChanged = BusEvent.define(
  "file.changed",
  z.object({ path: z.string() })
)

await Bus.publish(FileChanged, { path: "/src/test.ts" })

// In module B
Bus.subscribe(FileChanged, ({ properties }) => {
  console.log("File changed:", properties.path)
})
```

### Cleanup on Disposal

```typescript
Bus.subscribe(Bus.InstanceDisposed, ({ properties }) => {
  cleanupResources(properties.directory)
})
```

### Plugin Hooks

The plugin system uses the event bus for hook execution:

```typescript
Bus.subscribe(PluginHookEvent, async ({ properties }) => {
  // Trigger plugin hook
})
```

## Related Files

- **src/bus/index.ts**: Main event bus implementation
- **src/bus/bus-event.ts**: Event definition registry
- **src/bus/global.ts**: Global event emitter
- **src/project/instance.ts**: Instance-scoped state
- **src/plugin/index.ts**: Plugin hooks using events
