# Authentication Module

## Overview

The authentication module manages credentials for AI providers and external services. It supports multiple authentication methods including OAuth tokens, API keys, and well-known authentication patterns.

## Architecture

### Storage Location

Credentials are stored in `~/.local/state/opencode/auth.json` with file permissions `0o600` (owner read/write only).

### Authentication Types

The module supports three authentication types via discriminated unions:

#### OAuth

For providers using OAuth 2.0 authentication flow:

```typescript
{
  type: "oauth",
  refresh: string,      // OAuth refresh token
  access: string,       // OAuth access token
  expires: number,      // Unix timestamp for token expiration
  accountId?: string,   // Provider-specific account ID
  enterpriseUrl?: string // Enterprise instance URL
}
```

Used by: OpenAI (OAuth), GitHub Copilot

#### API Key

For providers using simple API key authentication:

```typescript
{
  type: "api",
  key: string  // API key
}
```

Used by: Most providers (Anthropic, Google, AWS, etc.)

#### Well-Known

For providers with custom authentication requiring both key and token:

```typescript
{
  type: "wellknown",
  key: string,   // API key or similar
  token: string  // Additional token
}
```

## API

### Getting Credentials

```typescript
const auth = await Auth.get("openai")
// Returns Info | undefined
```

### Listing All Credentials

```typescript
const allAuth = await Auth.all()
// Returns Record<string, Info>
```

### Setting Credentials

```typescript
await Auth.set("openai", {
  type: "api",
  key: "sk-..."
})
```

### Removing Credentials

```typescript
await Auth.remove("openai")
```

## Security

- File permissions are set to `0o600` (owner only)
- Invalid credentials are silently filtered out when reading
- All operations are async and use Bun's file API

## Provider IDs

Common provider IDs:
- `openai` - OpenAI
- `anthropic` - Anthropic (Claude)
- `google` - Google AI
- `copilot` - GitHub Copilot
- `azure` - Azure OpenAI
- `bedrock` - AWS Bedrock
- And many more (see `src/provider/provider.ts`)

## Related Files

- **src/auth/index.ts**: Main auth implementation
- **src/provider/provider.ts**: Provider definitions and auth usage
- **src/provider/auth.ts**: Provider-specific auth handling
- **src/cli/cmd/auth.ts**: CLI auth commands
