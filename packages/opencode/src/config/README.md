# Configuration System

## Overview

The configuration system manages hierarchical configuration loading from multiple sources with a well-defined precedence order. It supports JSON/JSONC formats, markdown frontmatter, and environment variable substitution.

## Architecture

### Config Precedence (Lowest to Highest)

1. **Remote** - `.well-known/opencode` from well-known auth providers
2. **Global** - `~/.config/opencode/opencode.json{,c}`
3. **Custom** - `OPENCODE_CONFIG` environment variable
4. **Project** - `opencode.json{,c}` found by searching upward from current directory
5. **.opencode directories** - `.opencode/opencode.json{,c}` in parent directories
6. **Inline** - `OPENCODE_CONFIG_CONTENT` environment variable
7. **Managed** - `/etc/opencode` (Linux), `/Library/Application Support/opencode` (macOS), `C:\ProgramData\opencode` (Windows)

### Configuration Merging

- Arrays are concatenated (not replaced) for `plugin` and `instructions` fields
- All other fields use deep merge
- Later sources override earlier sources

## Config Schema

The main config schema (`Config.Info`) includes:

### Core Settings

```typescript
{
  $schema?: string,           // JSON schema reference
  model?: string,             // Default model (provider/model)
  small_model?: string,       // Small model for title generation
  default_agent?: string,     // Default agent name
  username?: string,          // Display username
  logLevel?: LogLevel,        // Logging level
  theme?: string,             // UI theme
}
```

### Agent Configuration

```typescript
{
  agent: {
    [name: string]: {
      model?: string,
      variant?: string,
      temperature?: number,
      top_p?: number,
      prompt?: string,
      mode?: "subagent" | "primary" | "all",
      hidden?: boolean,
      color?: string,
      steps?: number,
      permission?: Permission,
      options?: Record<string, any>,
    }
  }
}
```

### Permission Configuration

```typescript
{
  permission: {
    "*": "allow" | "ask" | "deny",
    "bash": "allow" | "ask" | "deny",
    "edit": "allow" | "ask" | "deny",
    "read": { "*.env": "ask" },
    // ... more tools
  }
}
```

### Keybinds Configuration

```typescript
{
  keybinds: {
    leader: string,
    input_submit: string,
    // ... 80+ keybind options
  }
}
```

### Server Configuration

```typescript
{
  server: {
    port?: number,
    hostname?: string,
    mdns?: boolean,
    mdnsDomain?: string,
    cors?: string[],
  }
}
```

### TUI Configuration

```typescript
{
  tui: {
    scroll_speed?: number,
    scroll_acceleration?: { enabled: boolean },
    diff_style?: "auto" | "stacked",
  }
}
```

### Provider Configuration

```typescript
{
  provider: {
    [providerID: string]: {
      apiKey?: string,
      baseURL?: string,
      enterpriseUrl?: string,
      timeout?: number | false,
      whitelist?: string[],
      blacklist?: string[],
      models?: {
        [modelID: string]: {
          variants?: { [variant: string]: { disabled?: boolean } }
        }
      }
    }
  }
}
```

### MCP Configuration

```typescript
{
  mcp: {
    [name: string]: {
      type: "local" | "remote",
      // For local:
      command?: string[],
      environment?: Record<string, string>,
      // For remote:
      url?: string,
      headers?: Record<string, string>,
      oauth?: OAuthConfig | false,
      enabled?: boolean,
      timeout?: number,
    }
  }
}
```

### LSP Configuration

```typescript
{
  lsp: false | {
    [serverID: string]: {
      command?: string[],
      extensions?: string[],
      disabled?: boolean,
      env?: Record<string, string>,
      initialization?: Record<string, any>,
    }
  }
}
```

## Special Features

### Environment Variable Substitution

```json
{
  "provider": {
    "openai": {
      "apiKey": "{env:OPENAI_API_KEY}"
    }
  }
}
```

### File Inclusion

```json
{
  "instructions": [
    "{file:~/path/to/instructions.md}",
    "{file:./local/instructions.txt}"
  ]
}
```

### Markdown Configuration

Configuration can be embedded in markdown files with frontmatter:

```markdown
---
description: My agent
mode: subagent
---

System prompt content here
```

See `src/config/markdown.ts` for parsing logic.

## Directory Loading

### .opencode Directory Structure

```
.opencode/
├── opencode.json          # Directory config
├── agents/**/*.md         # Agent definitions
├── commands/**/*.md       # Command definitions
├── plugins/**/*.ts        # Plugin files
└── skills/**/*.md         # Skill definitions
```

### Auto-Installation

`.opencode` directories with a `package.json` trigger automatic dependency installation:

```bash
cd .opencode
bun add @opencode-ai/plugin
bun install
```

See `installDependencies()` and `needsInstall()` functions.

## API

### Getting Config

```typescript
const config = await Config.get()
// Returns merged config for current instance
```

### Getting Global Config

```typescript
const globalConfig = await Config.global()
// Returns global config only
```

### Updating Config

```typescript
await Config.update({ model: "anthropic/claude-3-opus" })
// Updates project config
```

### Updating Global Config

```typescript
await Config.updateGlobal({ model: "anthropic/claude-3-opus" })
// Updates global config
```

### Getting Directories

```typescript
const dirs = await Config.directories()
// Returns array of config directories
```

## Error Types

- `Config.JsonError` - Invalid JSON in config file
- `Config.ConfigDirectoryTypoError` - Common directory typos (e.g., `agents` vs `agent`)
- `Config.InvalidError` - Config validation failures with Zod issues
- `ConfigMarkdown.FrontmatterError` - Markdown frontmatter parsing errors

## Migration

### Legacy Config Migration

The system automatically migrates:
- `autoshare: true` → `share: "auto"`
- `mode` field → `agent` field (with `mode: "primary"`)
- `tools` field → `permission` field
- `maxSteps` → `steps`

### TOML Config

Legacy TOML configs are automatically converted to JSON.

## Related Files

- **src/config/config.ts**: Main config implementation (~55KB)
- **src/config/markdown.ts**: Markdown config parsing
- **src/command/index.ts**: Command loading
- **src/agent/agent.ts**: Agent loading
- **src/plugin/index.ts**: Plugin loading
