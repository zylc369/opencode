# Git 工作树管理

## 概述

Git 工作树管理，用于维护单个仓库的多个工作树。

## API

```typescript
import { Worktree } from "@/worktree"

// 列出工作树
const worktrees = await Worktree.list()

// 创建工作树
await Worktree.create(branch, path)

// 移除工作树
await Worktree.remove(path)

// 获取工作树信息
const info = Worktree.info(directory)
```

## 工作树检测

系统自动检测工作树：

```typescript
const isWorktree = Worktree.isWorktree(directory)
```

## 工作树结构

```typescript
{
  root: string,      // 仓库根目录
  worktree: string,  // 工作树路径
  gitdir: string     // .git 目录位置
}
```

## 用例

- 并行开发
- 隔离测试
- 热修复准备
- 功能分支隔离

## 相关文件

- **src/worktree/index.ts**：工作树操作
