# Skill Module

## Overview

Skill system for reusable prompt templates stored as markdown files.

## Skill Locations

Skills are loaded from:
1. `.opencode/skill/`
2. `.claude/skills/`
3. `.agents/skills/`
4. Configured skill paths

## Skill Format

```markdown
---
description: My skill
---

Skill prompt content here.
```

## API

```typescript
import { Skill } from "@/skill"

// List all skills
const skills = await Skill.all()

// Get skill directories
const dirs = await Skill.dirs()

// Load skill from file
const skill = await Skill.load(path)
```

## Skill Schema

```typescript
{
  name: string,
  description?: string,
  content: string,
  path: string
}
```

## Related Files

- **src/skill/skill.ts**: Skill loading
