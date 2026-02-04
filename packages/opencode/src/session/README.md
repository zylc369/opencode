# Session Management

## Overview

The session module manages AI conversations, messages, prompts, and LLM integration. This is the core module for handling user interactions with AI agents.

## Architecture

### Components

- **index.ts** - Session CRUD operations
- **message-v2.ts** - Message handling (~22KB)
- **message.ts** - Legacy message handling
- **prompt.ts** - System prompt building (~63KB)
- **processor.ts** - Message processing (~16KB)
- **llm.ts** - LLM integration
- **instruction.ts** - Instruction handling
- **compaction.ts** - Context compaction
- **summary.ts** - Session summaries
- **revert.ts** - Message reversion
- **status.ts** - Session status
- **system.ts** - System prompts
- **todo.ts** - Todo integration
- **retry.ts** - Retry logic
- **prompt/** - Model-specific prompt templates

## Session Schema

```typescript
{
  id: string,              // Unique session ID
  title: string,           // Session title
  agent: string,           // Agent name
  model: {                 // Model configuration
    providerID: string,
    modelID: string
  },
  messages: Message[],     // Message history
  status: "idle" | "busy",
  metadata: Record<string, any>
}
```

## API

### Creating Sessions

```typescript
import { Session } from "@/session"

const session = await Session.create({
  title: "My Session",
  agent: "build",
  model: { providerID: "openai", modelID: "gpt-4" }
})
```

### Processing Messages

```typescript
const response = await session.process({
  type: "user",
  content: "Hello, world!"
})
```

### Listing Sessions

```typescript
const sessions = await Session.list()
```

### Getting Session

```typescript
const session = await Session.get(id)
```

### Deleting Sessions

```typescript
await Session.remove(id)
```

## Message Types

| Type | Description |
|------|-------------|
| `user` | User message |
| `assistant` | AI response |
| `system` | System message |
| `tool` | Tool call result |

## Prompt Building

The `prompt.ts` module assembles system prompts from:
- Agent configuration
- Instructions files
- Project context
- Tool descriptions
- And more...

## Context Management

### Compaction

Automatic context compaction when token limit is approached:

```typescript
await Session.compact(session)
```

### Summary

Session summarization for context preservation:

```typescript
const summary = await Session.summary(session)
```

## LLM Integration

Streaming LLM responses:

```typescript
const stream = await Session.llm(messages, model)
for await (const chunk of stream) {
  // Process chunk
}
```

## Events

### Session Events

- `Session.Event.Created` - Session created
- `Session.Event.Updated` - Session updated
- `Session.Event.Deleted` - Session deleted
- `Session.Event.Error` - Session error

### Message Events

- `Session.Event.MessageAdded` - Message added
- `Session.Event.MessageUpdated` - Message updated

## Session Operations

### Compaction

Reduces context size by summarizing old messages:

```typescript
await session.compact()
```

### Revert

Reverts to a previous message state:

```typescript
await session.revert(messageID)
```

### Status

Get session status:

```typescript
const status = await Session.status(id)
```

## Instructions

Additional instructions can be loaded from:
- `CLAUDE.md` files
- `.opencode/instructions/*.md`
- Configured instruction paths

## Related Files

- **src/session/index.ts**: Session CRUD
- **src/session/message-v2.ts**: Message handling
- **src/session/prompt.ts**: Prompt building
- **src/session/processor.ts**: Message processing
- **src/session/llm.ts**: LLM integration
- **src/session/compaction.ts**: Context compaction
- **src/session/summary.ts**: Session summaries
