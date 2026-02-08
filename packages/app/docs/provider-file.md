# FileProvider 代码分析文档

## 概述

`FileProvider` 是 OpenCode 应用中负责文件管理的核心 Provider。它提供了文件内容管理、文件树管理、文件搜索、文件状态缓存等功能，是应用中文件操作的基础设施。

## 主要功能

### 1. 文件内容管理

- **文件加载**: 异步加载文件内容并缓存
- **内容缓存**: LRU缓存机制管理文件内容
- **内存控制**: 自动清理不常用的文件内容
- **状态同步**: 与文件系统实时同步

### 2. 文件树管理

- **目录浏览**: 浏览和管理目录结构
- **树状态**: 管理目录的展开/折叠状态
- **实时更新**: 文件系统变更的实时响应
- **错误处理**: 完善的错误处理机制

### 3. 文件视图状态

- **滚动位置**: 保存和恢复文件的滚动位置
- **选择状态**: 管理文件中的行选择状态
- **视图缓存**: 缓存文件的视图状态
- **会话隔离**: 不同会话的视图状态独立

### 4. 文件搜索

- **内容搜索**: 在文件内容中搜索
- **文件搜索**: 搜索文件和目录
- **结果过滤**: 支持搜索结果的过滤
- **异步处理**: 异步搜索不阻塞UI

## 核心组件

### 文件状态类型

#### FileState接口

```typescript
type FileState = {
  path: string // 文件路径
  name: string // 文件名
  content?: string // 文件内容
  loaded?: boolean // 是否已加载
  loading?: boolean // 是否正在加载
  error?: string // 错误信息
}
```

#### 文件选择相关类型

```typescript
type FileSelection = {
  start: number // 选择开始位置
  end: number // 选择结束位置
}

type SelectedLineRange = {
  start: number // 开始行号
  end: number // 结束行号
}

type FileViewState = {
  scrollTop?: number // 垂直滚动位置
  scrollLeft?: number // 水平滚动位置
  selectedLines?: SelectedLineRange // 选中的行范围
}
```

### 路径管理

#### 路径辅助工具

```typescript
const path = createPathHelpers(scope)
```

**提供的功能:**

- **路径规范化**: 统一路径格式
- **路径解析**: 解析路径的各个部分
- **Tab路径**: 处理编辑器标签页的路径
- **相对路径**: 处理相对路径转换

### 文件内容缓存

#### LRU缓存机制

```typescript
import {
  approxBytes,
  evictContentLru,
  getFileContentBytesTotal,
  getFileContentEntryCount,
  hasFileContent,
  removeFileContentBytes,
  resetFileContentLru,
  setFileContentBytes,
  touchFileContent,
} from "./file/content-cache"
```

#### 缓存清理

```typescript
const evictContent = (keep?: Set<string>) => {
  evictContentLru(keep, (target) => {
    if (!store.file[target]) return
    setStore(
      "file",
      target,
      produce((draft) => {
        draft.content = undefined
        draft.loaded = false
      }),
    )
  })
}
```

**特性:**

- **LRU算法**: 最近最少使用的缓存淘汰策略
- **内存控制**: 自动控制缓存占用的内存
- **选择性保留**: 可以指定保留特定文件
- **状态同步**: 缓存清理时同步更新状态

### 文件树管理

#### 文件树存储

```typescript
const tree = createFileTreeStore({
  scope,
  normalizeDir: path.normalizeDir,
  list: (dir) => sdk.client.file.list({ path: dir }).then((x) => x.data ?? []),
  onError: (message) => {
    showToast({
      variant: "error",
      title: language.t("toast.file.listFailed.title"),
      description: message,
    })
  },
})
```

#### 树操作API

```typescript
tree: {
  list: tree.listDir,              // 列出目录内容
  refresh: (input: string) => tree.listDir(input, { force: true }),  // 刷新目录
  state: tree.dirState,            // 获取目录状态
  children: tree.children,        // 获取子节点
  expand: tree.expandDir,          // 展开目录
  collapse: tree.collapseDir,      // 折叠目录
  toggle(input: string) {          // 切换目录展开状态
    if (tree.dirState(input)?.expanded) {
      tree.collapseDir(input)
      return
    }
    tree.expandDir(input)
  },
}
```

### 文件加载机制

#### 加载函数

```typescript
const load = (input: string, options?: { force?: boolean }) => {
  const file = path.normalize(input)
  if (!file) return Promise.resolve()

  const directory = scope()
  const key = `${directory}\n${file}`
  ensure(file)

  const current = store.file[file]
  if (!options?.force && current?.loaded) return Promise.resolve()

  const pending = inflight.get(key)
  if (pending) return pending

  setStore(
    "file",
    file,
    produce((draft) => {
      draft.loading = true
      draft.error = undefined
    }),
  )

  const promise = sdk.client.file
    .read({ path: file })
    .then((x) => {
      if (scope() !== directory) return
      const content = x.data
      setStore(
        "file",
        file,
        produce((draft) => {
          draft.loaded = true
          draft.loading = false
          draft.content = content
        }),
      )

      if (!content) return
      touchFileContent(file, approxBytes(content))
      evictContent(new Set([file]))
    })
    .catch((e) => {
      if (scope() !== directory) return
      setStore(
        "file",
        file,
        produce((draft) => {
          draft.loading = false
          draft.error = e.message
        }),
      )
      showToast({
        variant: "error",
        title: language.t("toast.file.loadFailed.title"),
        description: e.message,
      })
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise
}
```

**特性:**

- **防重复**: 避免重复加载同一文件
- **强制重载**: 支持强制重新加载
- **状态管理**: 完整的加载状态管理
- **错误处理**: 完善的错误处理和提示

### 文件视图缓存

#### 视图缓存管理

```typescript
const viewCache = createFileViewCache()
const view = createMemo(() => viewCache.load(scope(), params.id))
```

#### 视图状态API

```typescript
const scrollTop = (input: string) => view().scrollTop(path.normalize(input))
const scrollLeft = (input: string) => view().scrollLeft(path.normalize(input))
const selectedLines = (input: string) => view().selectedLines(path.normalize(input))

const setScrollTop = (input: string, top: number) => {
  view().setScrollTop(path.normalize(input), top)
}

const setScrollLeft = (input: string, left: number) => {
  view().setScrollLeft(path.normalize(input), left)
}

const setSelectedLines = (input: string, range: SelectedLineRange | null) => {
  view().setSelectedLines(path.normalize(input), range)
}
```

### 文件监听

#### 文件系统监听

```typescript
const stop = sdk.event.listen((e) => {
  invalidateFromWatcher(e.details, {
    normalize: path.normalize,
    hasFile: (file) => Boolean(store.file[file]),
    loadFile: (file) => {
      void load(file, { force: true })
    },
    node: tree.node,
    isDirLoaded: tree.isLoaded,
    refreshDir: (dir) => {
      void tree.listDir(dir, { force: true })
    },
  })
})
```

**特性:**

- **实时同步**: 文件系统变更的实时响应
- **智能更新**: 只更新受影响的文件和目录
- **自动刷新**: 自动刷新受影响的目录
- **状态一致性**: 保持前后端状态一致

### 文件搜索

#### 搜索功能

```typescript
const search = (query: string, dirs: "true" | "false") =>
  sdk.client.find.files({ query, dirs }).then(
    (x) => (x.data ?? []).map(path.normalize),
    () => [],
  )
```

#### 搜索API

```typescript
searchFiles: (query: string) => search(query, "false"),              // 搜索文件
searchFilesAndDirectories: (query: string) => search(query, "true"), // 搜索文件和目录
```

## 提供的 API

### 基础属性

```typescript
{
  ready: () => boolean,                    // 是否准备就绪
}
```

### 路径操作

```typescript
{
  normalize: (path: string) => string,      // 规范化路径
  tab: (path: string) => string,          // 生成标签页路径
  pathFromTab: (tab: string) => string,   // 从标签页路径获取文件路径
}
```

### 文件树操作

```typescript
{
  tree: {
    list: (dir: string) => Promise<void>,     // 列出目录
    refresh: (input: string) => Promise<void>, // 刷新目录
    state: (dir: string) => DirState,         // 获取目录状态
    children: (dir: string) => TreeNode[],     // 获取子节点
    expand: (dir: string) => void,            // 展开目录
    collapse: (dir: string) => void,          // 折叠目录
    toggle: (input: string) => void,          // 切换目录状态
  },
}
```

### 文件操作

```typescript
{
  get: (input: string) => FileState | undefined,    // 获取文件状态
  load: (input: string, options?: { force?: boolean }) => Promise<void>,  // 加载文件
}
```

### 视图状态操作

```typescript
{
  scrollTop: (input: string) => number | undefined,     // 获取垂直滚动位置
  scrollLeft: (input: string) => number | undefined,   // 获取水平滚动位置
  selectedLines: (input: string) => SelectedLineRange | undefined,  // 获取选中行
  setScrollTop: (input: string, top: number) => void,   // 设置垂直滚动位置
  setScrollLeft: (input: string, left: number) => void, // 设置水平滚动位置
  setSelectedLines: (input: string, range: SelectedLineRange | null) => void,  // 设置选中行
}
```

### 搜索操作

```typescript
{
  searchFiles: (query: string) => Promise<string[]>,           // 搜索文件
  searchFilesAndDirectories: (query: string) => Promise<string[]>,  // 搜索文件和目录
}
```

## 性能特性

### 1. 内存管理

- **LRU缓存**: 智能的文件内容缓存
- **自动清理**: 自动清理不常用的文件内容
- **内存控制**: 控制缓存占用的内存大小
- **选择性保留**: 重要文件可以选择性保留

### 2. 加载优化

- **防重复加载**: 避免重复加载同一文件
- **异步加载**: 不阻塞UI的异步加载机制
- **增量更新**: 只加载变更的部分
- **预加载**: 智能的文件预加载

### 3. 视图优化

- **视图缓存**: 缓存文件的视图状态
- **会话隔离**: 不同会话的视图状态独立
- **状态恢复**: 快速恢复文件的视图状态
- **增量更新**: 只更新变更的视图状态

## 设计模式

### 1. 缓存模式

- **LRU缓存**: 最近最少使用的缓存策略
- **多级缓存**: 内容缓存和视图缓存的分离
- **缓存失效**: 智能的缓存失效机制
- **内存控制**: 缓存大小的动态控制

### 2. 观察者模式

- **文件监听**: 文件系统变更的实时监听
- **状态同步**: 前后端状态的自动同步
- **事件驱动**: 基于事件的状态更新
- **响应式更新**: 响应式的状态更新机制

### 3. 工厂模式

- **状态工厂**: 创建文件状态的工厂函数
- **缓存工厂**: 创建缓存管理器的工厂函数
- **树工厂**: 创建文件树的工厂函数

## 使用场景

### 1. 代码编辑

- **文件浏览**: 浏览和管理项目文件
- **内容编辑**: 编辑文件内容并实时保存
- **状态恢复**: 恢复文件的编辑状态
- **多文件**: 同时管理多个文件

### 2. 项目管理

- **文件搜索**: 快速查找项目文件
- **目录导航**: 在项目目录间导航
- **状态同步**: 与文件系统状态同步
- **批量操作**: 批量文件操作

### 3. 协作开发

- **实时同步**: 文件变更的实时同步
- **状态共享**: 团队成员的状态共享
- **冲突处理**: 文件冲突的处理
- **版本控制**: 与版本控制系统的集成

## 依赖关系

- **SDKProvider**: 提供文件操作API客户端
- **SyncProvider**: 提供文件同步功能
- **LanguageProvider**: 提供国际化支持
- **Router**: 提供路由参数解析

## 最佳实践

1. **内存管理**: 合理控制文件缓存的大小
2. **异步操作**: 使用异步API避免阻塞UI
3. **错误处理**: 完善的错误处理机制
4. **状态恢复**: 及时保存文件状态
5. **搜索优化**: 使用合适的搜索策略

## 扩展指南

### 添加新的文件操作

```typescript
// 在FileProvider中添加新方法
return {
  // ... existing methods
  customOperation(file: string, options: any) {
    // 自定义文件操作
  },
  batchOperation(files: string[], operation: string) {
    // 批量文件操作
  },
}
```

## 总结

`FileProvider` 是应用的文件管理核心，提供了：

- **完整的文件管理功能**
- **智能的缓存和内存管理**
- **实时的文件系统同步**
- **优秀的性能优化特性**

它确保了开发者能够高效地管理项目文件，是OpenCode应用开发体验的基础支撑。
