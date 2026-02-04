# Command System

## Overview

The command system defines reusable AI agent commands (prompts) that can be invoked by users or agents. Commands are loaded from multiple sources: config files, MCP servers, and skill directories.

## Architecture

### Command Sources

Commands are loaded from three sources (in order of precedence, highest last):

1. **Built-in commands**: Default commands included with OpenCode
2. **Config commands**: Defined in `opencode.json` under the `command` key
3. **MCP prompts**: Prompts exposed by connected MCP servers
4. **Skills**: Skill files (`.md`) with SKILL frontmatter

### Command Schema

```typescript
{
  name: string,                    // Unique identifier
  description?: string,            // Human-readable description
  agent?: string,                  // Agent to use for execution
  model?: string,                  // Model override (provider/model)
  source?: "command" | "mcp" | "skill",  // Source of the command
  template: string | Promise<string>,  // Prompt template
  subtask?: boolean,               // Whether this is a subtask
  hints: string[],                 // Template variable hints
}
```

## Built-in Commands

### init

Creates or updates `AGENTS.md` file with development guidelines.

Template: `command/template/initialize.txt`

Usage: `init [options]`

### review

Reviews code changes (commits, branches, PRs).

Template: `command/template/review.txt`

Usage: `review [commit|branch|pr]`

## Template Syntax

Command templates support special variables:

- **`$ARGUMENTS`**: Replaced with command arguments
- **`$1`, `$2`, `$3`, ...**: Positional arguments
- **`@filepath`**: File references (extracted from template)
- **``!`command` ``: Shell command execution

### Hints

The `hints` field contains template variables that need substitution:

```typescript
Command.hints(template) // Returns ["$1", "$2", "$ARGUMENTS"]
```

## Command Loading

Commands are instance-scoped and loaded via `Instance.state()`:

```typescript
const state = Instance.state(async () => {
  // Load from config
  for (const [name, command] of Object.entries(cfg.command ?? {})) {
    result[name] = { name, ...command, source: "command" }
  }

  // Load from MCP servers
  for (const [name, prompt] of Object.entries(await MCP.prompts())) {
    result[name] = { name, ...prompt, source: "mcp" }
  }

  // Load from skills
  for (const skill of await Skill.all()) {
    if (!result[skill.name]) {
      result[skill.name] = { name: skill.name, ...skill, source: "skill" }
    }
  }

  return result
})
```

## Events

### Command.Executed

Published when a command is executed:

```typescript
BusEvent.define("command.executed", z.object({
  name: string,
  sessionID: string,
  arguments: string,
  messageID: string,
}))
```

## API

### Getting a Command

```typescript
const command = await Command.get("init")
```

### Listing Commands

```typescript
const commands = await Command.list()
// Returns array of all registered commands
```

## Config Definition

Commands can be defined in `opencode.json`:

```json
{
  "command": {
    "my-command": {
      "description": "My custom command",
      "agent": "build",
      "template": "Do something with $ARGUMENTS"
    }
  }
}
```

Or as markdown files in `.opencode/command/**/*.md`:

```markdown
---
description: My command
agent: general
---

Do something with $ARGUMENTS
```

## Related Files

- **src/command/index.ts**: Main command implementation
- **src/command/template/initialize.txt**: Init command template
- **src/command/template/review.txt**: Review command template
- **src/config/config.ts**: Config loading
- **src/mcp/index.ts**: MCP prompt loading
- **src/skill/skill.ts**: Skill loading
