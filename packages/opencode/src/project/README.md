# Project and Instance Management

## Overview

The project module handles workspace discovery, git-based project detection, and per-instance context management.

## Architecture

### Components

- **project.ts** - Project discovery and metadata
- **instance.ts** - Per-instance context management
- **bootstrap.ts** - Project initialization
- **state.ts** - State management utilities
- **vcs.ts** - Version control system integration

## Project Discovery

Projects are discovered by searching for Git repositories:

```typescript
import { Project } from "@/project"

const project = await Project.find(cwd)
// Returns { root, worktree, gitdir }
```

### Project Structure

```typescript
{
  root: string,      // Git repository root
  worktree: string,  // Git worktree (or root if not a worktree)
  gitdir: string     // .git directory location
}
```

## Instance Management

Instances provide per-project context and state:

```typescript
import { Instance } from "@/project/instance"

// Provide instance context
await Instance.provide({
  directory: cwd,
  init: bootstrapFunction,
  fn: async () => {
    // Code runs with instance context
  }
})

// Get current instance directory
const dir = Instance.directory
const tree = Instance.worktree
```

### Instance-Scoped State

Modules can create instance-scoped state:

```typescript
const state = Instance.state(async () => {
  // Initialize state for this instance
  return { /* state */ }
})

// Access state
const data = await state()
```

### Instance Lifecycle

- **Creation**: Via `Instance.provide()`
- **Initialization**: Via init function
- **Disposal**: Automatic via `Instance.dispose()`

## Version Control Integration

### VCS Detection

```typescript
import { VCS } from "@/project/vcs"

const info = VCS.info(directory)
// Returns { root, gitdir }
```

### Git Operations

- Repository root detection
- Worktree detection
- Git directory location

## State Management

### State Utilities

```typescript
import { State } from "@/project/state"

// Create state key
const key = State.key("module", "name")

// Manage state
State.set(key, value)
const value = State.get(key)
```

## API

### Finding Projects

```typescript
const project = await Project.find(directory)
```

### Getting Instance Info

```typescript
const directory = Instance.directory
const worktree = Instance.worktree
```

### Disposing Instances

```typescript
await Instance.dispose()      // Dispose current instance
await Instance.disposeAll()   // Dispose all instances
```

## Related Files

- **src/project/project.ts**: Project discovery
- **src/project/instance.ts**: Instance management
- **src/project/bootstrap.ts**: Project initialization
- **src/project/state.ts**: State utilities
- **src/project/vcs.ts**: VCS integration
