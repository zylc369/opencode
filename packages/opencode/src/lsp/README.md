# Language Server Protocol (LSP) Integration

## Overview

Provides LSP client management and bundled LSP server configurations for code intelligence features.

## Architecture

### Components

- **index.ts** - LSP client management
- **server.ts** - Bundled LSP server configurations (~63KB)
- **client.ts** - LSP client wrapper
- **language.ts** - Language-to-LSP mapping

## Supported Languages

The system includes configurations for many language servers:

| Language | Server ID | Command |
|----------|-----------|---------|
| TypeScript | `typescript-language-server` | `typescript-language-server` |
| Python | `pylsp` | `pylsp` |
| Rust | `rust-analyzer` | `rust-analyzer` |
| Go | `gopls` | `gopls` |
| C/C++ | `clangd` | `clangd` |
| Java | `jdtls` | `jdtls` |
| And many more... | | |

## API

### Language Detection

```typescript
import { LSP } from "@/lsp"

const servers = LSP.language("file.ts")
// Returns array of matching LSP servers
```

### Client Management

```typescript
import { LSPClient } from "@/lsp/client"

const client = new LSPClient(command, args, options)
await client.start()
const result = await client.request("textDocument/codeCompletion", params)
await client.stop()
```

### Server Configurations

```typescript
import { LSPServer } from "@/lsp/server"

const config = LSPServer["typescript-language-server"]
// Returns { id, command, args, ... }
```

## Configuration

LSP servers can be configured in `opencode.json`:

```json
{
  "lsp": {
    "typescript-language-server": {
      "command": ["typescript-language-server", "--stdio"],
      "extensions": [".ts", ".tsx"],
      "disabled": false
    },
    "custom-server": {
      "command": ["my-lsp", "--stdio"],
      "extensions": [".custom"]
    }
  }
}
```

## Features

- Auto-detection based on file extensions
- Concurrent request handling
- Process lifecycle management
- Initialization options support
- Environment variable support

## Bundled Servers

The `server.ts` file contains pre-configured settings for 50+ language servers including:
- TypeScript/JavaScript
- Python
- Rust
- Go
- Java
- C/C++
- Ruby
- PHP
- And many more

## Related Files

- **src/lsp/index.ts**: Client management
- **src/lsp/server.ts**: Server configurations
- **src/lsp/client.ts**: Client wrapper
- **src/lsp/language.ts**: Language mapping
- **src/config/config.ts**: LSP configuration loading
