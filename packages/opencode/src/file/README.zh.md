# 文件操作

## 概述

文件模块提供文件系统操作，包括读取、差异、内容检测、git 集成和文件监视。

## 架构

### 组件

- **index.ts** - 主要文件操作（读取、差异、内容检测）
- **ripgrep.ts** - 通过 ripgrep 进行快速代码搜索
- **ignore.ts** - .gitignore 处理
- **time.ts** - 文件时间工具
- **watcher.ts** - 文件监视功能

## API

### 读取文件

```typescript
import { File } from "@/file"

const content = await File.read(path)
const lines = await File.readlines(path)
```

### 文件差异

```typescript
const diff = await File.diff(originalPath, modifiedPath)
// 返回统一差异字符串
```

### 内容检测

```typescript
const isBinary = File.isBinary(filename)
const isText = File.isText(filename)
```

### Ripgrep 集成

```typescript
import { Ripgrep } from "@/file/ripgrep"

const results = await Ripgrep.search("pattern", cwd)
```

### 忽略模式

```typescript
import { Ignore } from "@/file/ignore"

const ignore = Ignore.create(cwd)
const isIgnored = ignore.ignored(filepath)
```

### 文件监视

```typescript
import { Watcher } from "@/file/watcher"

const watcher = Watcher.create(cwd)
watcher.on("change", (path) => {
  console.log("文件已更改：", path)
})
```

## 二进制文件检测

系统维护一个广泛的二进制文件扩展名列表，以避免将二进制文件作为文本读取。

## 相关文件

- **src/file/index.ts**：主要文件操作
- **src/file/ripgrep.ts**：代码搜索
- **src/file/ignore.ts**：.gitignore 处理
- **src/file/watcher.ts**：文件监视
