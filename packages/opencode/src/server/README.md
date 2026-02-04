# HTTP Server Module

## Overview

HTTP API server using Hono framework with WebSocket support, CORS, and mDNS discovery.

## Architecture

### Components

- **server.ts** - Main server implementation (~20KB)
- **routes/** - API route handlers
- **error.ts** - Error definitions
- **event.ts** - Server events
- **mdns.ts** - mDNS service discovery

### API Routes

| Route | Description |
|-------|-------------|
| `GET /` | Server info |
| `POST /session` | Create session |
| `GET /session/:id` | Get session |
| `DELETE /session/:id` | Delete session |
| `POST /session/:id/message` | Send message |
| `GET /project` | Get project info |
| `GET /file/*` | Read file |
| `POST /file/*` | Write file |
| `GET /config` | Get config |
| `GET /mcp` | List MCP servers |
| `GET /provider` | List providers |
| `POST /pty` | Create PTY |
| `GET /tui` | TUI WebSocket |
| `/experimental/*` | Experimental routes |

## Server Configuration

```typescript
const server = new Server({
  port: 4096,
  hostname: "127.0.0.1",
  cors: ["http://localhost:3000"],
  mdns: true,
  mdnsDomain: "opencode.local"
})
```

## WebSocket Support

The server supports WebSocket connections for:
- TUI real-time updates
- Session streaming
- PTY output

## mDNS Discovery

When enabled, the server advertises itself via mDNS:
- Service: `_opencode._tcp`
- Domain: `opencode.local` (default)
- Automatically sets hostname to `0.0.0.0`

## CORS

CORS is configured for:
- localhost origins
- Configured additional domains
- TUI and web interfaces

## API

### Starting Server

```typescript
import { Server } from "@/server"

const server = await Server.start(options)
```

### Stopping Server

```typescript
await server.stop()
```

## Events

- `Server.Event.Ready` - Server is ready
- `Server.Event.Error` - Server error

## Related Files

- **src/server/server.ts**: Main server
- **src/server/routes/**: API routes
- **src/server/error.ts**: Error definitions
- **src/server/event.ts**: Server events
- **src/server/mdns.ts**: mDNS discovery
