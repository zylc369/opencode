# Worktree Management

## Overview

Git worktree management for maintaining multiple working trees of a single repository.

## API

```typescript
import { Worktree } from "@/worktree"

// List worktrees
const worktrees = await Worktree.list()

// Create worktree
await Worktree.create(branch, path)

// Remove worktree
await Worktree.remove(path)

// Get worktree info
const info = Worktree.info(directory)
```

## Worktree Detection

The system automatically detects worktrees:

```typescript
const isWorktree = Worktree.isWorktree(directory)
```

## Worktree Structure

```typescript
{
  root: string,      // Repository root
  worktree: string,  // Worktree path
  gitdir: string     // .git directory location
}
```

## Use Cases

- Parallel development
- Isolated testing
- Hotfix preparation
- Feature branch isolation

## Related Files

- **src/worktree/index.ts**: Worktree operations
