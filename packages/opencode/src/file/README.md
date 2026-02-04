# File Operations

## Overview

The file module provides file system operations including reading, diffing, content detection, git integration, and file watching.

## Architecture

### Components

- **index.ts** - Main file operations (read, diff, content detection)
- **ripgrep.ts** - Fast code search via ripgrep
- **ignore.ts** - .gitignore handling
- **time.ts** - File time utilities
- **watcher.ts** - File watching capabilities

## API

### Reading Files

```typescript
import { File } from "@/file"

const content = await File.read(path)
const lines = await File.readlines(path)
```

### File Diffs

```typescript
const diff = await File.diff(originalPath, modifiedPath)
// Returns unified diff string
```

### Content Detection

```typescript
const isBinary = File.isBinary(filename)
const isText = File.isText(filename)
```

### Ripgrep Integration

```typescript
import { Ripgrep } from "@/file/ripgrep"

const results = await Ripgrep.search("pattern", cwd)
```

### Ignore Patterns

```typescript
import { Ignore } from "@/file/ignore"

const ignore = Ignore.create(cwd)
const isIgnored = ignore.ignored(filepath)
```

### File Watching

```typescript
import { Watcher } from "@/file/watcher"

const watcher = Watcher.create(cwd)
watcher.on("change", (path) => {
  console.log("File changed:", path)
})
```

## Binary File Detection

The system maintains an extensive list of binary file extensions to avoid reading binary files as text.

## Related Files

- **src/file/index.ts**: Main file operations
- **src/file/ripgrep.ts**: Code search
- **src/file/ignore.ts**: .gitignore handling
- **src/file/watcher.ts**: File watching
