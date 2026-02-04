# 项目和实例管理

## 概述

项目模块处理工作区发现、基于 git 的项目检测和每个实例的上下文管理。

## 架构

### 组件

- **project.ts** - 项目发现和元数据
- **instance.ts** - 每实例上下文管理
- **bootstrap.ts** - 项目初始化
- **state.ts** - 状态管理工具
- **vcs.ts** - 版本控制系统集成

## 项目发现

通过搜索 Git 仓库来发现项目：

```typescript
import { Project } from "@/project"

const project = await Project.find(cwd)
// 返回 { root, worktree, gitdir }
```

### 项目结构

```typescript
{
  root: string,      // Git 仓库根目录
  worktree: string,  // Git 工作树（如果不是工作树则为根目录）
  gitdir: string     // .git 目录位置
}
```

## 实例管理

实例为每个项目提供上下文和状态：

```typescript
import { Instance } from "@/project/instance"

// 提供实例上下文
await Instance.provide({
  directory: cwd,
  init: bootstrapFunction,
  fn: async () => {
    // 代码在实例上下文中运行
  }
})

// 获取当前实例目录
const dir = Instance.directory
const tree = Instance.worktree
```

### 实例作用域状态

模块可以创建实例作用域状态：

```typescript
const state = Instance.state(async () => {
  // 为此实例初始化状态
  return { /* state */ }
})

// 访问状态
const data = await state()
```

### 实例生命周期

- **创建**：通过 `Instance.provide()`
- **初始化**：通过 init 函数
- **处置**：通过 `Instance.dispose()` 自动进行

## 版本控制集成

### VCS 检测

```typescript
import { VCS } from "@/project/vcs"

const info = VCS.info(directory)
// 返回 { root, gitdir }
```

### Git 操作

- 仓库根目录检测
- 工作树检测
- Git 目录位置

## 状态管理

### 状态工具

```typescript
import { State } from "@/project/state"

// 创建状态键
const key = State.key("module", "name")

// 管理状态
State.set(key, value)
const value = State.get(key)
```

## API

### 查找项目

```typescript
const project = await Project.find(directory)
```

### 获取实例信息

```typescript
const directory = Instance.directory
const worktree = Instance.worktree
```

### 处置实例

```typescript
await Instance.dispose()      // 处置当前实例
await Instance.disposeAll()   // 处置所有实例
```

## 相关文件

- **src/project/project.ts**：项目发现
- **src/project/instance.ts**：实例管理
- **src/project/bootstrap.ts**：项目初始化
- **src/project/state.ts**：状态工具
- **src/project/vcs.ts**：VCS 集成
