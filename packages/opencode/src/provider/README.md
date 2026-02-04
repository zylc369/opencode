# AI Provider Integration

## Overview

The provider module manages AI model providers, supporting 20+ providers with unified authentication and parameter handling.

## Architecture

### Components

- **provider.ts** - Provider registry and initialization (~44KB)
- **models.ts** - Model definitions and costs
- **auth.ts** - Provider-specific authentication
- **transform.ts** - Provider-specific parameter transforms (~27KB)
- **sdk/copilot/** - GitHub Copilot SDK integration

## Supported Providers

| Provider | Provider ID | Models |
|----------|-------------|--------|
| OpenAI | `openai` | GPT-4, GPT-3.5, etc. |
| Anthropic | `anthropic` | Claude 3 Opus/Sonnet/Haiku |
| Google | `google` | Gemini Pro/Ultra |
| AWS Bedrock | `bedrock` | Various AWS models |
| Azure | `azure` | Azure OpenAI |
| Groq | `groq` | Llama, Mixtral |
| Mistral | `mistral` | Mistral models |
| Cohere | `cohere` | Command models |
| And 10+ more... | | |

## Provider Configuration

```json
{
  "provider": {
    "openai": {
      "apiKey": "sk-...",
      "baseURL": "https://api.openai.com/v1",
      "timeout": 300000
    },
    "anthropic": {
      "apiKey": "sk-ant-...",
      "timeout": 300000
    }
  }
}
```

## API

### Getting Provider

```typescript
import { Provider } from "@/provider"

const provider = await Provider.get("openai")
```

### Getting Model

```typescript
const model = await Provider.getModel("openai", "gpt-4")
```

### Listing Models

```typescript
const models = await Provider.models()
```

### Getting Default Model

```typescript
const model = await Provider.defaultModel()
// Returns { providerID, modelID }
```

### Provider Initialization

```typescript
const instance = await Provider.init(providerID, model)
```

## Model Identifiers

Models are identified as `provider/model`:

- `openai/gpt-4`
- `anthropic/claude-3-opus-20240229`
- `google/gemini-pro`

## Error Types

- `Provider.InitError` - Provider initialization failed
- `Provider.ModelNotFoundError` - Model not found (with suggestions)

## Provider-Specific Transforms

The `transform.ts` module handles provider-specific parameter transformations:

- Temperature scaling
- Top-p sampling
- Streaming format
- Tool calling formats
- And more...

## Authentication

Authentication is handled via the `Auth` module. Each provider may use:
- API keys (`api` type)
- OAuth tokens (`oauth` type)
- Well-known authentication (`wellknown` type)

See `src/auth/index.ts` for details.

## Related Files

- **src/provider/provider.ts**: Provider registry
- **src/provider/models.ts**: Model definitions
- **src/provider/auth.ts**: Provider authentication
- **src/provider/transform.ts**: Parameter transforms
- **src/provider/sdk/copilot/**: Copilot SDK
- **src/auth/index.ts**: Authentication storage
