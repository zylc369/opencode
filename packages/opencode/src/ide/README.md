# IDE Detection and Integration

## Overview

Detects installed IDEs and manages IDE extension installation.

## Supported IDEs

- **Windsurf** - AI-powered IDE
- **VS Code** - Visual Studio Code
- **Cursor** - AI code editor
- **VSCodium** - Open-source VS Code

## Detection

IDEs are detected via environment variables and file system checks:

```typescript
import { IDE } from "@/ide"

const detected = await IDE.detect()
// Returns array of detected IDEs
```

## Installation

Install OpenCode extension for detected IDEs:

```typescript
await IDE.install(IDEType.VSCode)
```

## Related Files

- **src/ide/index.ts**: IDE detection and installation
