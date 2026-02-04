# Model Context Protocol (MCP) Integration

## Overview

The MCP module provides integration with the Model Context Protocol, enabling external tool and resource servers to extend OpenCode's capabilities.

## Architecture

### Components

- **index.ts** - Main MCP client management (~29KB)
- **auth.ts** - MCP authentication handling
- **oauth-provider.ts** - OAuth provider integration
- **oauth-callback.ts** - OAuth callback handling

### Transport Types

MCP servers can communicate via different transports:

1. **Stdio** - Standard input/output (local servers)
2. **HTTP** - HTTP requests (remote servers)
3. **SSE** - Server-Sent Events (remote servers)

## Configuration

### Local MCP Server

```json
{
  "mcp": {
    "my-server": {
      "type": "local",
      "command": ["path/to/server", "--arg"],
      "environment": {
        "API_KEY": "value"
      },
      "enabled": true,
      "timeout": 5000
    }
  }
}
```

### Remote MCP Server

```json
{
  "mcp": {
    "my-server": {
      "type": "remote",
      "url": "https://example.com/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer token"
      },
      "oauth": {
        "clientId": "client-id",
        "clientSecret": "client-secret",
        "scope": "read write"
      },
      "timeout": 5000
    }
  }
}
```

## API

### Getting MCP Prompts

```typescript
import { MCP } from "@/mcp"

const prompts = await MCP.prompts()
// Returns array of available prompts from MCP servers
```

### Getting MCP Tools

```typescript
const tools = await MCP.tools()
// Returns array of available tools from MCP servers
```

### Executing MCP Prompts

```typescript
const result = await MCP.getPrompt(client, name, arguments)
```

### Calling MCP Tools

```typescript
const result = await MCP.callTool(client, name, arguments)
```

## OAuth Authentication

MCP servers can use OAuth for authentication. The system supports:

- Dynamic client registration (RFC 7591)
- OAuth 2.0 flows
- Token management

## Error Handling

- `MCP.Failed` - MCP server failure errors

## Events

MCP integration publishes events for:
- Server connection/disconnection
- Tool execution
- Error conditions

## Related Files

- **src/mcp/index.ts**: Main MCP implementation
- **src/mcp/auth.ts**: Authentication handling
- **src/mcp/oauth-provider.ts**: OAuth provider
- **src/mcp/oauth-callback.ts**: OAuth callback
- **src/config/config.ts**: MCP configuration loading
