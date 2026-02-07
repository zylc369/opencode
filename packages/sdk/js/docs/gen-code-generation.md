# Gen Directory Code Generation Analysis

## Overview

The `src/gen/` directory contains **auto-generated** TypeScript SDK code for the OpenCode API. The code is generated from OpenAPI specifications using the `@hey-api/openapi-ts` tool.

---

## Generation Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. opencode server generates OpenAPI specification              │
│     └─ bun dev generate > openapi.json                          │
├─────────────────────────────────────────────────────────────────┤
│  2. @hey-api/openapi-ts reads openapi.json                      │
│     └─ Generates TypeScript SDK code                            │
├─────────────────────────────────────────────────────────────────┤
│  3. Output to src/gen/ and src/v2/gen/ directories              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Understanding `bun dev generate`

### Command Breakdown

```bash
bun dev generate
│    │   │
│    │   └── Command passed to opencode CLI (NOT an npm script)
│    └── npm script from package.json
└── bun runtime
```

### How It Works

**File**: `packages/opencode/package.json`

```json
{
  "scripts": {
    "dev": "bun run --conditions=browser ./src/index.ts"
  }
}
```

**Command**: `bun run --conditions=browser ./src/index.ts generate`

**File**: `packages/opencode/src/index.ts`

```typescript
import { GenerateCommand } from "./cli/cmd/generate"

const cli = yargs(hideBin(process.argv)).command(GenerateCommand) // Registers "generate" subcommand
// ... other commands

await cli.parse() // Parses CLI arguments
```

**File**: `packages/opencode/src/cli/cmd/generate.ts`

```typescript
export const GenerateCommand = {
  command: "generate", // ← Subcommand name
  handler: async () => {
    // Outputs OpenAPI JSON to stdout
  },
}
```

### Running Directory

| Command                       | Directory           |
| ----------------------------- | ------------------- |
| `bun dev generate`            | `packages/opencode` |
| `bun src/index.ts generate`   | `packages/opencode` |
| `bun src/cli/cmd/generate.ts` | `packages/opencode` |

**Note**: The `generate` command is a **CLI subcommand**, not a standalone npm script.

---

## Detailed Steps

### Step 1: Generate OpenAPI Specification

**Working Directory**: `packages/opencode`

**Command**: `bun dev generate`

**File**: `packages/opencode/src/cli/cmd/generate.ts`

```typescript
export const GenerateCommand = {
  command: "generate",
  handler: async () => {
    // Call Server.openapi() to generate OpenAPI spec
    const specs = await Server.openapi()

    // Add code examples for each operation
    for (const item of Object.values(specs.paths)) {
      for (const method of ["get", "post", "put", "delete", "patch"] as const) {
        const operation = item[method]
        if (!operation?.operationId) continue
        operation["x-codeSamples"] = [
          {
            lang: "js",
            source: [
              `import { createOpencodeClient } from "@opencode-ai/sdk"`,
              ``,
              `const client = createOpencodeClient()`,
              `await client.${operation.operationId}({`,
              `  ...`,
              `})`,
            ].join("\n"),
          },
        ]
      }
    }

    // Output JSON to stdout
    const json = JSON.stringify(specs, null, 2)
    await new Promise<void>((resolve) => {
      process.stdout.write(json, () => resolve())
    })
  },
}
```

**How Server.openapi() Works**:

**File**: `packages/opencode/src/server/server.ts`

```typescript
export async function openapi() {
  // Generate OpenAPI spec from all registered routes
  const result = await generateSpecs(App() as Hono, {
    documentation: {
      info: {
        title: "opencode",
        version: "1.0.0",
        description: "opencode api",
      },
      openapi: "3.1.1",
    },
  })
  return result
}
```

The `generateSpecs` function from `hono-openapi` scans:

- All route definitions with `describeRoute()` decorators
- Request/response schemas from Zod validators
- Parameter types and validation rules
- Produces a complete OpenAPI 3.1.1 specification

### Step 2: SDK Build Script

**Working Directory**: `packages/sdk/js`

**File**: `packages/sdk/js/script/build.ts`

```typescript
import { createClient } from "@hey-api/openapi-ts"

// 1. Generate openapi.json from opencode server
//    Uses .cwd() to switch to opencode directory
await $`bun dev generate > ${dir}/openapi.json`.cwd(path.resolve(dir, "../../opencode"))

// 2. Use @hey-api/openapi-ts to generate code
await createClient({
  input: "./openapi.json",
  output: {
    path: "./src/v2/gen", // ← v2 SDK output
    clean: true, // Remove old files before generating
  },
  plugins: [
    {
      name: "@hey-api/typescript",
      exportFromIndex: false,
    },
    {
      name: "@hey-api/sdk",
      instance: "OpencodeClient",
      exportFromIndex: false,
      auth: false,
      paramsStructure: "flat",
    },
    {
      name: "@hey-api/client-fetch",
      exportFromIndex: false,
      baseUrl: "http://localhost:4096",
    },
  ],
})

// 3. Format generated code
await $`bun prettier --write src/gen`
await $`bun prettier --write src/v2`

// 4. Compile TypeScript
await $`bun tsc`

// 5. Cleanup
await $`rm openapi.json`
```

---

## V1 vs V2 SDK

The project has two SDK versions:

| Directory     | Version | Status                               |
| ------------- | ------- | ------------------------------------ |
| `src/gen/`    | V1      | Legacy, maintained for compatibility |
| `src/v2/gen/` | V2      | Current, actively developed          |

### Exports

**File**: `packages/sdk/js/package.json`

```json
{
  "exports": {
    ".": "./src/index.ts", // V1 SDK
    "/client": "./src/client.ts", // V1 Client
    "/server": "./src/server.ts", // V1 Server types
    "/v2": "./src/v2/index.ts", // V2 SDK
    "/v2/client": "./src/v2/client.ts", // V2 Client
    "/v2/server": "./src/v2/server.ts" // V2 Server types
  }
}
```

---

## Generated File Structure

```
src/gen/
├── client.gen.ts          # Client configuration
├── sdk.gen.ts             # SDK main methods
├── types.gen.ts           # TypeScript type definitions
├── client/                # Client core
│   ├── index.ts
│   ├── types.gen.ts
│   └── utils.gen.ts
└── core/                  # Core functionality
    ├── auth.gen.ts
    ├── bodySerializer.gen.ts
    ├── params.gen.ts
    ├── pathSerializer.gen.ts
    ├── queryKeySerializer.gen.ts
    ├── serverSentEvents.gen.ts
    ├── types.gen.ts
    └── utils.gen.ts
```

---

## Tools Used

| Tool                    | Version | Purpose                                              |
| ----------------------- | ------- | ---------------------------------------------------- |
| `@hey-api/openapi-ts`   | 0.90.10 | OpenAPI spec to TypeScript SDK                       |
| `@hey-api/typescript`   | -       | Generate TypeScript types                            |
| `@hey-api/sdk`          | -       | Generate SDK client class                            |
| `@hey-api/client-fetch` | -       | Generate fetch-based HTTP client                     |
| `hono-openapi`          | -       | Generate OpenAPI spec from Hono routes (server-side) |

---

## How to Regenerate

```bash
# From packages/sdk/js directory
bun run build
```

This command:

1. Switches to `packages/opencode` directory
2. Runs `bun dev generate` to output OpenAPI spec
3. Switches back to `packages/sdk/js` directory
4. Cleans old gen directory (`clean: true`)
5. Generates new TypeScript code
6. Runs prettier to format
7. Compiles TypeScript
8. Deletes temporary openapi.json

---

## Running generate Command Independently

If you only want to generate the OpenAPI spec (without building the SDK):

```bash
cd packages/opencode
bun dev generate > openapi.json
```

Or using the alternative syntax:

```bash
cd packages/opencode
bun src/index.ts generate > openapi.json
```

---

## Auto-generated File Marker

Each generated file starts with:

```typescript
// This file is auto-generated by @hey-api/openapi-ts
```

This indicates that these files should **NOT** be manually edited, as they will be overwritten on the next build.

---

## Build Dependencies

From `packages/sdk/js/package.json`:

```json
{
  "devDependencies": {
    "@hey-api/openapi-ts": "0.90.10"
  }
}
```

---

## Key Design Decisions

### 1. Separate Gen Directory

- Generated code is isolated in `gen/` directory
- Clear separation between handwritten and generated code
- Easy to regenerate without affecting other files

### 2. Clean Output

```typescript
output: {
  clean: true
}
```

- Removes old generated files before generating new ones
- Prevents stale files from persisting

### 3. Flat Parameters

```typescript
paramsStructure: "flat"
```

- API parameters are flattened (not nested under `body`, `query`, etc.)
- Simpler API surface for consumers

### 4. Fetch-based Client

```typescript
name: "@hey-api/client-fetch"
```

- Uses native `fetch` API
- No additional HTTP client dependencies
- Works in browser, Node.js, Bun, etc.

### 5. CLI-based Generation

- `generate` is a CLI subcommand, not a npm script
- Allows flexible invocation from different contexts
- Can be called programmatically from build scripts

---

## Example Usage

After generation, the SDK can be used like:

### V1 SDK

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
})

// Call API methods
const result = await client.pathGet()
const commands = await client.commandList()
```

### V2 SDK

```typescript
import { createClient } from "@opencode-ai/sdk/v2"

const client = createClient({
  baseUrl: "http://localhost:4096",
})

// Call API methods
const result = await client.pathGet()
const commands = await client.commandList()
```

All types are automatically inferred from the OpenAPI specification.
