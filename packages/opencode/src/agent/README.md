# Agent System

## Overview

The agent system defines AI agent configurations with different modes, permissions, and behaviors. Agents are the core entities that interact with users through sessions, using tools and providers to accomplish tasks.

## Architecture

### Agent Schema

Each agent is defined by the `Agent.Info` schema:

```typescript
{
  name: string           // Unique identifier
  description?: string   // Human-readable description
  mode: "subagent" | "primary" | "all"  // Agent mode
  native?: boolean       // Built-in agent flag
  hidden?: boolean       // Hide from agent list
  temperature?: number   // LLM temperature
  topP?: number         // LLM top-p sampling
  color?: string        // UI color
  permission: PermissionNext.Ruleset  // Access control rules
  model?: {             // Model configuration
    providerID: string
    modelID: string
  }
  variant?: string      // Model variant
  prompt?: string       // System prompt
  options: Record<string, any>  // Additional options
  steps?: number        // Max steps for execution
}
```

### Agent Modes

- **subagent**: Specialized agents for specific tasks (e.g., explore, general). Can only be called by other agents, not used directly by users.
- **primary**: Main agents that can be selected by users (e.g., build, plan)
- **all**: Agents that work in both modes

## Built-in Agents

### Primary Agents

#### build
The default agent. Executes tools based on configured permissions with full access to most tools.

#### plan
Planning mode agent. Disallows edit tools except for plan files (`.opencode/plans/*.md`). Useful for creating implementation plans before making changes.

### Subagents

#### general
General-purpose agent for researching complex questions and executing multi-step tasks in parallel. Has access to most tools except todo operations.

#### explore
Fast agent specialized for exploring codebases. Only has read-only access:
- grep (content search)
- glob (file pattern matching)
- read (file reading)
- bash (read-only commands)
- webfetch, websearch, codesearch

Accepts thoroughness levels: "quick", "medium", "very thorough"

### Hidden Agents

#### compaction
Compacts conversation history by removing redundant information. No tool access.

#### title
Generates concise titles for conversations (≤50 characters). No tool access.

#### summary
Summarizes conversations for context preservation. No tool access.

## Agent Configuration

### Default Permissions

All agents start with a base permission set that:
- Allows most tools by default
- Asks for doom_loop prevention
- Asks for external directory access (except skill directories)
- Denies question/prompts by default
- Denies plan enter/exit
- Asks before reading `.env` files

### Permission Merging

Agent permissions are merged in order:
1. Default permissions
2. Agent-specific overrides
3. User configuration permissions
4. Always allow Truncate.GLOB (unless explicitly denied)

### Custom Agents

Users can define custom agents in config:

```json
{
  "agent": {
    "my-agent": {
      "model": "openai:gpt-4",
      "mode": "subagent",
      "prompt": "You are a specialist in...",
      "permission": {
        "bash": "deny"
      }
    }
  }
}
```

## Agent Generation

The `Agent.generate()` function creates new agent configurations based on user descriptions:

```typescript
const agent = await Agent.generate({
  description: "An agent that reviews code for security issues"
})
```

Returns:
```json
{
  "identifier": "security-reviewer",
  "whenToUse": "Use this agent when...",
  "systemPrompt": "You are a security specialist..."
}
```

## Prompt Templates

Located in `src/agent/prompt/`:

- **compaction.txt**: Instructions for summarizing conversations
- **explore.txt**: Instructions for codebase exploration
- **summary.txt**: Instructions for conversation summaries
- **title.txt**: Instructions for generating conversation titles

## Usage

### Getting an Agent

```typescript
const agent = await Agent.get("build")
```

### Listing Agents

```typescript
const agents = await Agent.list()
// Returns sorted array with default agent first
```

### Getting Default Agent

```typescript
const defaultAgent = await Agent.defaultAgent()
// Returns name of default primary visible agent
```

## Instance State

Agent configurations are instance-scoped via `Instance.state()`, meaning they can vary per project/workspace.

## Related Files

- **src/agent/agent.ts**: Main agent implementation
- **src/agent/generate.txt**: Prompt for generating new agents
- **src/agent/prompt/**: System prompts for built-in agents
- **src/permission/next.ts**: Permission system
- **src/provider/provider.ts**: AI provider integration
