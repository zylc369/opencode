# Question Module

## Overview

Interactive question prompts for CLI and TUI applications.

## API

```typescript
import { Question } from "@/question"

// Ask a question
const answer = await Question.ask({
  type: "text",
  message: "What is your name?",
  default: "User"
})

// Confirm action
const confirmed = await Question.confirm({
  message: "Are you sure?",
  default: false
})
```

## Question Types

- `text` - Text input
- `confirm` - Yes/No confirmation
- `select` - Select from options
- `multiselect` - Select multiple options

## Related Files

- **src/question/index.ts**: Question implementation
