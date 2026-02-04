# Share, Shell, and Skill Modules

## Overview

These modules provide session sharing, shell utilities, and skill management.

## Share Module

### Overview

Handles session sharing functionality for collaboration and export.

### Components

- **share.ts** - Original sharing implementation
- **share-next.ts** - New sharing implementation

### API

```typescript
import { Share } from "@/share"

// Share a session
const url = await Share.create(session)

// Share via new implementation
const url = await ShareNext.create(session)
```

## Shell Module

### Overview

Shell detection and execution utilities.

### API

```typescript
import { Shell } from "@/shell"

// Detect shell
const shell = Shell.detect()
// Returns "bash", "zsh", "fish", etc.

// Execute command
const result = await Shell.exec(command, args)
```

## Skill Module

### Overview

Skill system for reusable prompt templates stored as markdown files.

### Skill Locations

Skills are loaded from:
1. `.opencode/skill/`
2. `.claude/skills/`
3. `.agents/skills/`
4. Configured skill paths

### Skill Format

```markdown
---
description: My skill
---

Skill prompt content here.
```

### API

```typescript
import { Skill } from "@/skill"

// List all skills
const skills = await Skill.all()

// Get skill directories
const dirs = await Skill.dirs()

// Load skill from file
const skill = await Skill.load(path)
```

### Skill Schema

```typescript
{
  name: string,
  description?: string,
  content: string,
  path: string
}
```

## Related Files

- **src/share/share.ts**: Original sharing
- **src/share/share-next.ts**: New sharing
- **src/shell/shell.ts**: Shell utilities
- **src/skill/skill.ts**: Skill loading
