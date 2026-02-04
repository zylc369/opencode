# Tool System

## Overview

The tool system provides a unified interface for AI-executable operations. Tools are the primary way AI agents interact with the system.

## Architecture

### Components

- **tool.ts** - Tool interface and definition
- **registry.ts** - Tool registry and discovery

### Tool List

| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands |
| `read` | Read file contents |
| `write` | Write files |
| `edit` | Edit files with search/replace |
| `glob` | Find files by pattern |
| `grep` | Search file contents |
| `webfetch` | Fetch web content |
| `websearch` | Search the web |
| `codesearch` | Search codebase |
| `task` | Launch subagent tasks |
| `todo` | Manage todo lists |
| `skill` | Execute skills |
| `apply_patch` | Apply unified diffs |
| `lsp` | Query LSP servers |
| `ls` | List directory contents |
| `multiedit` | Batch file edits |
| `plan` | Plan mode operations |
| `question` | Ask user questions |
| `external-directory` | External directory access |
| `batch` | Batch tool execution |

## Tool Definition

Tools are defined using the `Tool.define()` function:

```typescript
import { Tool } from "./tool"
import z from "zod"

export const MyTool = Tool.define("my_tool", {
  description: "Tool description",
  parameters: z.object({
    input: z.string().describe("Input parameter"),
  }),
  execute: async (args, context) => {
    // Check abort signal
    if (context.abort.signal.aborted) {
      throw new Error("Operation aborted")
    }

    // Execute tool logic
    const result = await doSomething(args.input)

    return {
      title: "Result Title",
      output: result,
      metadata: {},
    }
  },
})
```

## Tool Registry

Tools are registered and loaded dynamically:

```typescript
import { Tool } from "@/tool"

// Get all tools
const tools = await Tool.all()

// Get specific tool
const tool = await Tool.get("read")

// Check if tool exists
const exists = Tool.has("read")
```

## Tool Schema

```typescript
{
  name: string,
  description: string,
  parameters: ZodSchema,
  execute: (args, context) => Promise<{
    title: string,
    output: string,
    metadata: Record<string, any>
  }>
}
```

## Tool Context

The context parameter provides:

```typescript
{
  sessionID: string,
  messageID: string,
  agent: string,
  abort: {
    signal: AbortSignal
  },
  messages: Message[],
  metadata: (data) => void,
  ask: (question) => Promise<string>
}
```

## Tool Permissions

Tools are controlled by the permission system:

```json
{
  "permission": {
    "bash": "allow",
    "read": "allow",
    "edit": "ask"
  }
}
```

## Tool Documentation

Each tool has corresponding `.txt` files with documentation:
- `tool-name.txt` - Tool description for AI
- Examples: `bash.txt`, `read.txt`, `edit.txt`

## Related Files

- **src/tool/tool.ts**: Tool interface
- **src/tool/registry.ts**: Tool registry
- **src/tool/*.ts**: Individual tool implementations
