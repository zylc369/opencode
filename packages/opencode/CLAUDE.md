# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenCode is an AI-powered coding assistant built with TypeScript and Bun runtime. It provides multiple interfaces (CLI, TUI, Web) for interacting with AI models to assist with software development tasks.

## Common Commands

### Development
```bash
# Install dependencies
bun install

# Type check
bun run typecheck

# Run tests
bun test

# Development mode (run CLI)
bun run dev

# Build
bun run build
```

### Running the Application
```bash
# Run the CLI assistant
bun run --conditions=browser ./src/index.ts

# Start HTTP server (default port 4096)
bun run src/index.ts serve

# Start TUI
bun run src/index.ts tui

# List available commands
bun run src/index.ts --help
```

### Testing
```bash
# Run all tests
bun test

# Run specific test file
bun test test/tool/read.test.ts

# Run tests with coverage
bun test --coverage

# Watch mode
bun test --watch
```

## Architecture Overview

OpenCode uses a modular architecture with clear separation of concerns:

### Core Layers

1. **Entry Point** (`src/index.ts`) - CLI using Yargs with 18 commands
2. **Session Layer** (`src/session/`) - Conversation and message management
3. **Agent Layer** (`src/agent/`) - AI agent configurations and behaviors
4. **Tool Layer** (`src/tool/`) - 23+ tools for file operations, code search, etc.
5. **Provider Layer** (`src/provider/`) - Abstraction over 20+ AI providers
6. **Permission Layer** (`src/permission/`) - Fine-grained access control
7. **Project Layer** (`src/project/`) - Workspace and instance management

### Key Design Patterns

1. **Instance-Scoped State**: `project/instance.ts` provides async context for per-directory state using `Instance.provide()`
2. **Event-Driven Architecture**: `bus/` enables loose coupling via pub/sub with typed events
3. **Plugin System**: `plugin/` allows extensibility via hooks (auth, config, event, tool, chat)
4. **Layered Configuration**: `config/config.ts` implements 7-layer precedence (remote, global, custom, project, .opencode, inline, managed)
5. **Tool Registry**: Dynamic tool discovery and registration via `tool/registry.ts`
6. **Namespace Pattern**: Most modules export a namespace object with related functions

### Module Dependencies

```
Entry Point (index.ts)
    ↓
CLI Commands (cli/cmd/)
    ↓
├── Session Management (session/) → Agent (agent/) → Tool (tool/)
├── Provider (provider/) → Auth (auth/)
├── Project Context (project/) → Instance (project/instance.ts)
├── Configuration (config/)
├── Storage (storage/)
├── Event Bus (bus/)
└── Utilities (util/)
```

## Adding New Features

### Adding a New Tool

Tools are defined in `src/tool/` and registered in `src/tool/registry.ts`. Each tool exports a `Tool.Info` object:

```typescript
// src/tool/my-tool.ts
import { Tool } from "./tool"
import z from "zod"

export const MyTool = Tool.define("my_tool", {
  description: "Tool description",
  parameters: z.object({
    input: z.string().describe("Input parameter"),
  }),
  execute: async (args, ctx) => {
    if (ctx.abort.signal.aborted) {
      throw new Error("Operation aborted")
    }
    return {
      title: "Result Title",
      output: "Result content",
      metadata: {},
    }
  },
})
```

Register in `src/tool/registry.ts`:
```typescript
export async function all(): Promise<Tool.Info[]> {
  return [
    // ... existing tools
    await MyTool.init(),
  ]
}
```

### Adding a New Agent

Agents are defined in `src/agent/agent.ts`. Each agent has a mode, permissions, model, and prompt:

```typescript
import { Agent } from "./agent"
import { PermissionNext } from "@/permission/next"

export const MyAgent: Agent.Info = {
  name: "my-agent",
  description: "Agent description",
  mode: "subagent",
  permission: PermissionNext.Ruleset.parse({ /* permissions */ }),
  model: {
    providerID: "openai",
    modelID: "gpt-4",
  },
  prompt: `You are a specialized assistant for...`,
}
```

### Adding a New CLI Command

Commands are in `src/cli/cmd/`. Use the `cmd()` helper:

```typescript
import { cmd } from "./cmd"
import type { Argv } from "yargs"
import { bootstrap } from "../bootstrap"

export const MyCommand = cmd({
  command: "my-command <arg>",
  describe: "Command description",
  builder: (yargs: Argv) => {
    return yargs
      .positional("arg", { describe: "Argument", type: "string" })
      .option("option", { alias: "o", type: "string" })
  },
  handler: async (argv) => {
    await bootstrap(process.cwd(), async () => {
      // Command logic
    })
  },
})
```

## Important File Locations

- **Entry point**: `src/index.ts` - CLI command registration
- **Configuration**: `src/config/config.ts` - Multi-layer config loading
- **Session core**: `src/session/index.ts` - Session CRUD operations
- **Message handling**: `src/session/message-v2.ts` - Message processing
- **Prompt building**: `src/session/prompt.ts` - System prompt assembly
- **Tool registry**: `src/tool/registry.ts` - Tool discovery and loading
- **Provider registry**: `src/provider/provider.ts` - AI provider initialization
- **Permissions**: `src/permission/next.ts` - Access control engine
- **Event bus**: `src/bus/index.ts` - Pub/sub event system
- **Storage**: `src/storage/storage.ts` - Persistent data layer
- **LSP integration**: `src/lsp/server.ts` - Bundled LSP server configs

## Configuration Precedence (Highest to Lowest)

1. Remote `.well-known/opencode`
2. Global config (`~/.config/opencode/config.json`)
3. Custom config (`OPENCODE_CONFIG` env var)
4. Project config (`.opencode/config.json` in project root)
5. `.opencode` directories (parent directories)
6. Inline config (in documents)
7. Managed config (enterprise)

## Storage Locations

- **Config**: `~/.config/opencode/`
- **Data**: `~/.local/share/opencode/`
- **Cache**: `~/.cache/opencode/`
- **State**: `~/.local/state/opencode/`
- **Logs**: `~/.local/state/opencode/log/`

## Supported AI Providers

The project supports 20+ AI providers including: OpenAI, Anthropic, Google, AWS Bedrock, Azure, Groq, Mistral, Cohere, Cerebras, DeepInfra, TogetherAI, XAI, Perplexity, OpenRouter, and more. Each provider is configured in `src/provider/` with specific auth and parameter transformations.

## Protocol Support

- **MCP** (Model Context Protocol): `src/mcp/` - External tool integration
- **ACP** (Agent Client Protocol): `src/acp/` - IDE integration (Zed, etc.)
- **LSP** (Language Server Protocol): `src/lsp/` - Code intelligence

## UI Frameworks

- **CLI**: Yargs with custom styling via `src/cli/ui.ts`
- **TUI**: SolidJS + @opentui/solid (terminal UI)
- **HTTP API**: Hono framework with WebSocket support

## Key Utilities

- **Logging**: `src/util/log.ts` - Structured logging with service prefix
- **File operations**: `src/util/filesystem.ts` - Safe file I/O
- **Wildcard matching**: `src/util/wildcard.ts` - Pattern matching
- **Locking**: `src/util/lock.ts` - File-based locking
- **Queue**: `src/util/queue.ts` - Work queue management
