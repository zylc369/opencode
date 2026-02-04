# 技能模块

## 概述

用于可重用提示模板的技能系统，存储为 markdown 文件。

## 技能位置

技能从以下位置加载：
1. `.opencode/skill/`
2. `.claude/skills/`
3. `.agents/skills/`
4. 配置的技能路径

## 技能格式

```markdown
---
description: 我的技能
---

技能提示内容在这里。
```

## API

```typescript
import { Skill } from "@/skill"

// 列出所有技能
const skills = await Skill.all()

// 获取技能目录
const dirs = await Skill.dirs()

// 从文件加载技能
const skill = await Skill.load(path)
```

## 技能架构

```typescript
{
  name: string,
  description?: string,
  content: string,
  path: string
}
```

## 相关文件

- **src/skill/skill.ts**：技能加载
