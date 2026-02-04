# CLI System

## Overview

The CLI (Command Line Interface) system provides the primary user interaction layer for OpenCode. It is built on Yargs and includes 18 commands for various operations including running the AI assistant, managing authentication, and controlling the HTTP/TUI servers.

## Architecture

### Directory Structure

```
cli/
├── bootstrap.ts    # Instance initialization wrapper
├── cmd.ts          # Command type helper
├── cmd/            # Individual command implementations
│   ├── tui/        # Terminal UI application
│   └── debug/      # Debug/development commands
├── error.ts        # Error formatting
├── logo.ts         # ASCII art logo
├── network.ts      # Network configuration options
├── ui.ts           # Terminal UI utilities
└── upgrade.ts      # Auto-update logic
```

### Commands

Located in `cli/cmd/`, the available commands are:

| Command | File | Description |
|---------|------|-------------|
| `run` | run.ts | Run the AI assistant (main command) |
| `serve` | serve.ts | Start HTTP server |
| `tui` | tui/app.tsx | Start terminal UI |
| `web` | web.ts | Start web interface |
| `auth` | auth.ts | Manage provider authentication |
| `agent` | agent.ts | Manage AI agents |
| `session` | session.ts | Manage sessions |
| `mcp` | mcp.ts | Manage MCP servers |
| `models` | models.ts | List available models |
| `github` | github.ts | GitHub integration |
| `pr` | pr.ts | Pull request operations |
| `acp` | acp.ts | ACP server management |
| `export` | export.ts | Export session data |
| `import` | import.ts | Import session data |
| `uninstall` | uninstall.ts | Uninstall OpenCode |
| `upgrade` | upgrade.ts | Upgrade to latest version |
| `generate` | generate.ts | Generate configurations |
| `stats` | stats.ts | Display usage statistics |

## Command Definition Pattern

Commands use the `cmd()` helper for type safety:

```typescript
import { cmd } from "./cmd"
import type { Argv } from "yargs"

export const MyCommand = cmd({
  command: "my-command <arg>",
  describe: "Command description",
  builder: (yargs: Argv) => {
    return yargs
      .positional("arg", {
        describe: "Argument",
        type: "string",
      })
      .option("option", {
        alias: "o",
        type: "string",
      })
  },
  handler: async (argv) => {
    // Command logic
  },
})
```

## Bootstrap Pattern

Commands use the `bootstrap()` function to initialize the project instance:

```typescript
import { bootstrap } from "../bootstrap"

export const MyCommand = cmd({
  // ...
  handler: async (argv) => {
    await bootstrap(process.cwd(), async () => {
      // Instance is initialized here
      // Command logic runs with instance context
    })
  },
})
```

The bootstrap function:
1. Creates an instance via `Instance.provide()`
2. Runs the initialization function
3. Disposes the instance in a `finally` block

## Terminal UI (TUI)

The TUI is a SolidJS application running in the terminal:

```
cli/cmd/tui/
├── app.tsx          # Main TUI application
├── attach.ts        # Attach to running session
├── component/       # UI components
├── context/         # React-like context providers
├── event.ts         # Event handling
├── routes/          # Route handlers
├── thread.ts        # Thread management
├── ui/              # UI utilities
├── util/            # Helper functions
└── worker.ts        # Web Worker for parallel processing
```

### TUI Framework

- **SolidJS**: Reactive UI framework
- **@opentui/solid**: Terminal UI components
- **@opentui/core**: Core TUI primitives

## Debug Commands

Located in `cli/cmd/debug/`, these commands help with development:

| Command | Description |
|---------|-------------|
| `agent` | Debug agent configurations |
| `config` | Debug configuration loading |
| `file` | Debug file operations |
| `lsp` | Debug LSP servers |
- `ripgrep` | Debug ripgrep integration
| `scrap` | Debug scrap operations |
| `skill` | Debug skill loading |
| `snapshot` | Debug file snapshots |

## UI Utilities

### Styling

Terminal colors and styles are defined in `cli/ui.ts`:

```typescript
UI.Style.TEXT_HIGHLIGHT      // Cyan
UI.Style.TEXT_HIGHLIGHT_BOLD // Bold cyan
UI.Style.TEXT_DIM           // Gray
UI.Style.TEXT_WARNING       // Yellow
UI.Style.TEXT_DANGER        // Red
UI.Style.TEXT_SUCCESS       // Green
UI.Style.TEXT_INFO          // Blue
```

### Printing

```typescript
import { UI } from "@/cli/ui"

UI.println("Hello", "world")  // Print with newline
UI.print("Hello", "world")    // Print without newline
UI.empty()                    // Print blank line (deduped)
UI.error("Error message")     // Print error
UI.logo()                     // Print ASCII logo
```

### Logo

The ASCII logo is defined in `cli/logo.ts` using special characters:
- `_` = background block
- `^` = foreground block
- `~` = shadow block

## Error Handling

Errors are formatted by `cli/error.ts`:

```typescript
import { FormatError, FormatUnknownError } from "@/cli/error"

try {
  // ...
} catch (error) {
  const message = FormatError(error) ?? FormatUnknownError(error)
  UI.error(message)
}
```

Supported error types:
- `MCP.Failed` - MCP server failures
- `Provider.ModelNotFoundError` - Invalid model names
- `Provider.InitError` - Provider initialization failures
- `Config.JsonError` - Invalid JSON in config
- `Config.ConfigDirectoryTypoError` - Common directory typos
- `ConfigMarkdown.FrontmatterError` - Markdown frontmatter errors
- `Config.InvalidError` - Configuration validation errors
- `UI.CancelledError` - User cancelled operations

## Network Options

Commands that start servers use shared network options from `cli/network.ts`:

```typescript
import { withNetworkOptions, resolveNetworkOptions } from "@/cli/network"

// In builder
builder: (yargs) => withNetworkOptions(yargs)

// In handler
const { hostname, port, mdns, mdnsDomain, cors } = await resolveNetworkOptions(args)
```

Options:
- `--port` - Port to listen on (default: 0 / auto)
- `--hostname` - Hostname to bind (default: 127.0.0.1)
- `--mdns` - Enable mDNS discovery (defaults hostname to 0.0.0.0)
- `--mdns-domain` - mDNS domain (default: opencode.local)
- `--cors` - Additional CORS domains

## Auto-Update

The `cli/upgrade.ts` module handles automatic updates:

1. Checks for new version via `Installation.latest()`
2. Respects `config.autoupdate` setting:
   - `false` - Disable
   - `"notify"` - Publish `UpdateAvailable` event
   - `true` - Auto-upgrade
3. Publishes `Updated` event on success

## Related Files

- **src/cli/bootstrap.ts**: Instance initialization
- **src/cli/cmd/**: Command implementations
- **src/cli/cmd/tui/app.tsx**: TUI application
- **src/cli/error.ts**: Error formatting
- **src/cli/ui.ts**: Terminal UI utilities
- **src/index.ts**: Main CLI entry point
- **src/server/server.ts**: HTTP server implementation
