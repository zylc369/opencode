# CommandProvider 代码分析文档

## 概述

`CommandProvider` 是 OpenCode 应用中负责命令系统管理的核心 Provider。它提供了命令注册、快捷键绑定、命令面板、斜杠命令等功能，是应用快捷操作和用户体验的基础设施。

## 主要功能

### 1. 命令注册系统

- **动态注册**: 支持动态注册和注销命令
- **命令分类**: 按类别组织和管理命令
- **重复检测**: 自动检测和处理重复命令
- **生命周期管理**: 组件卸载时自动清理命令

### 2. 快捷键系统

- **快捷键绑定**: 支持复杂的快捷键组合
- **跨平台适配**: 自动适配不同操作系统的快捷键
- **自定义快捷键**: 支持用户自定义快捷键
- **冲突检测**: 检测和警告快捷键冲突

### 3. 命令面板

- **快速搜索**: 快速搜索和执行命令
- **建议命令**: 智能建议常用命令
- **分类显示**: 按类别组织命令显示
- **键盘导航**: 完全支持键盘操作

### 4. 斜杠命令

- **斜杠触发**: 在输入框中使用斜杠触发命令
- **自动补全**: 支持命令的自动补全
- **上下文相关**: 根据上下文提供相关命令

## 核心组件

### 类型定义

#### 命令选项接口

```typescript
export interface CommandOption {
  id: string // 命令唯一标识
  title: string // 命令标题
  description?: string // 命令描述
  category?: string // 命令分类
  keybind?: KeybindConfig // 默认快捷键
  slash?: string // 斜杠命令别名
  suggested?: boolean // 是否为建议命令
  disabled?: boolean // 是否禁用
  onSelect?: (source?: "palette" | "keybind" | "slash") => void // 选择回调
  onHighlight?: () => (() => void) | void // 高亮回调
}
```

#### 快捷键接口

```typescript
export interface Keybind {
  key: string // 按键
  ctrl: boolean // Ctrl键
  meta: boolean // Meta/Cmd键
  shift: boolean // Shift键
  alt: boolean // Alt键
}

export type KeybindConfig = string // 快捷键配置字符串
```

#### 命令注册接口

```typescript
export type CommandRegistration = {
  key?: string // 注册键（可选）
  options: Accessor<CommandOption[]> // 命令选项访问器
}
```

### 平台检测

#### 平台常量

```typescript
const IS_MAC = typeof navigator === "object" && /(Mac|iPod|iPhone|iPad)/.test(navigator.platform)
```

**用途:**

- **快捷键适配**: Mac使用Cmd，Windows/Linux使用Ctrl
- **显示格式**: 不同平台显示不同的快捷键格式
- **行为差异**: 处理平台特定的行为差异

### 快捷键解析

#### 快捷键配置解析

```typescript
export function parseKeybind(config: string): Keybind[] {
  if (!config || config === "none") return []

  return config.split(",").map((combo) => {
    const parts = combo.trim().toLowerCase().split("+")
    const keybind: Keybind = {
      key: "",
      ctrl: false,
      meta: false,
      shift: false,
      alt: false,
    }

    for (const part of parts) {
      switch (part) {
        case "ctrl":
        case "control":
          keybind.ctrl = true
          break
        case "meta":
        case "cmd":
        case "command":
          keybind.meta = true
          break
        case "mod":
          if (IS_MAC) keybind.meta = true
          else keybind.ctrl = true
          break
        case "alt":
        case "option":
          keybind.alt = true
          break
        case "shift":
          keybind.shift = true
          break
        default:
          keybind.key = part
          break
      }
    }

    return keybind
  })
}
```

**特性:**

- **多组合键**: 支持逗号分隔的多个组合键
- **修饰符**: 支持Ctrl、Meta、Shift、Alt修饰符
- **平台适配**: mod键根据平台自动适配
- **别名支持**: 支持命令的多种别名

#### 快捷键匹配

```typescript
export function matchKeybind(keybinds: Keybind[], event: KeyboardEvent): boolean {
  const eventKey = normalizeKey(event.key)

  for (const kb of keybinds) {
    const keyMatch = kb.key === eventKey
    const ctrlMatch = kb.ctrl === (event.ctrlKey || false)
    const metaMatch = kb.meta === (event.metaKey || false)
    const shiftMatch = kb.shift === (event.shiftKey || false)
    const altMatch = kb.alt === (event.altKey || false)

    if (keyMatch && ctrlMatch && metaMatch && shiftMatch && altMatch) {
      return true
    }
  }

  return false
}
```

#### 快捷键格式化

```typescript
export function formatKeybind(config: string): string {
  if (!config || config === "none") return ""

  const keybinds = parseKeybind(config)
  if (keybinds.length === 0) return ""

  const kb = keybinds[0]
  const parts: string[] = []

  if (kb.ctrl) parts.push(IS_MAC ? "⌃" : "Ctrl")
  if (kb.alt) parts.push(IS_MAC ? "⌥" : "Alt")
  if (kb.shift) parts.push(IS_MAC ? "⇧" : "Shift")
  if (kb.meta) parts.push(IS_MAC ? "⌘" : "Meta")

  if (kb.key) {
    const keys: Record<string, string> = {
      arrowup: "↑",
      arrowdown: "↓",
      arrowleft: "←",
      arrowright: "→",
      comma: ",",
      plus: "+",
      space: "Space",
    }
    const key = kb.key.toLowerCase()
    const displayKey = keys[key] ?? (key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1))
    parts.push(displayKey)
  }

  return IS_MAC ? parts.join("") : parts.join("+")
}
```

**特点:**

- **平台差异**: Mac使用符号，Windows/Linux使用文字
- **特殊键**: 特殊按键的符号化显示
- **美观显示**: 优化的快捷键显示格式

### 命令注册管理

#### 注册插入函数

```typescript
export function upsertCommandRegistration(registrations: CommandRegistration[], entry: CommandRegistration) {
  if (entry.key === undefined) return [entry, ...registrations]
  return [entry, ...registrations.filter((x) => x.key !== entry.key)]
}
```

#### 命令注册Hook

```typescript
function register(cb: () => CommandOption[]): void
function register(key: string, cb: () => CommandOption[]): void
function register(key: string | (() => CommandOption[]), cb?: () => CommandOption[]) {
  const id = typeof key === "string" ? key : undefined
  const next = typeof key === "function" ? key : cb
  if (!next) return
  const options = createMemo(next)
  const entry: CommandRegistration = {
    key: id,
    options,
  }
  setStore("registrations", (arr) => upsertCommandRegistration(arr, entry))
  onCleanup(() => {
    setStore("registrations", (arr) => arr.filter((x) => x !== entry))
  })
}
```

**特性:**

- **自动清理**: 组件卸载时自动清理命令
- **响应式**: 使用SolidJS的响应式系统
- **重复处理**: 处理重复的命令注册

### 键盘事件处理

#### 键盘事件监听

```typescript
const handleKeyDown = (event: KeyboardEvent) => {
  if (suspended() || dialog.active) return

  const sig = signatureFromEvent(event)

  if (palette().has(sig)) {
    event.preventDefault()
    showPalette()
    return
  }

  const option = keymap().get(sig)
  if (!option) return
  event.preventDefault()
  option.onSelect?.("keybind")
}
```

**特性:**

- **挂起检查**: 检查命令系统是否挂起
- **对话框检查**: 避免与对话框快捷键冲突
- **事件阻止**: 阻止默认行为
- **上下文传递**: 传递触发上下文信息

### 命令选项管理

#### 注册命令处理

```typescript
const registered = createMemo(() => {
  const seen = new Set<string>()
  const all: CommandOption[] = []

  for (const reg of store.registrations) {
    for (const opt of reg.options()) {
      if (seen.has(opt.id)) {
        if (import.meta.env.DEV && !warnedDuplicates.has(opt.id)) {
          warnedDuplicates.add(opt.id)
          console.warn(`[command] duplicate command id \"${opt.id}\" registered; keeping first entry`)
        }
        continue
      }
      seen.add(opt.id)
      all.push(opt)
    }
  }

  return all
})
```

#### 选项解析

```typescript
const options = createMemo(() => {
  const resolved = registered().map((opt) => ({
    ...opt,
    keybind: bind(opt.id, opt.keybind),
  }))

  const suggested = resolved.filter((x) => x.suggested && !x.disabled)

  return [
    ...suggested.map((x) => ({
      ...x,
      id: SUGGESTED_PREFIX + x.id,
      category: language.t("command.category.suggested"),
    })),
    ...resolved,
  ]
})
```

**特性:**

- **重复检测**: 自动检测和处理重复命令
- **建议命令**: 优先显示建议命令
- **动态解析**: 动态解析快捷键绑定

## 提供的 API

### 命令注册

```typescript
{
  register: (cb: () => CommandOption[]) => void,                    // 注册命令
  register: (key: string, cb: () => CommandOption[]) => void,     // 带键注册命令
}
```

### 命令执行

```typescript
{
  trigger: (id: string, source?: "palette" | "keybind" | "slash") => void,  // 触发命令
  show: () => void,                                                  // 显示命令面板
}
```

### 快捷键管理

```typescript
{
  keybind: (id: string) => string,               // 获取快捷键显示文本
  keybinds: (enabled: boolean) => void,          // 启用/禁用快捷键
  suspended: () => boolean,                      // 检查是否挂起
}
```

### 命令查询

```typescript
{
  get catalog(): CommandCatalogItem[],           // 获取命令目录
  get options(): CommandOption[],                 // 获取所有选项
}
```

## 性能特性

### 1. 内存管理

- **自动清理**: 组件卸载时自动清理命令
- **重复检测**: 避免重复注册相同命令
- **延迟计算**: 使用计算属性延迟计算

### 2. 响应式优化

- **计算属性**: 使用SolidJS计算属性优化性能
- **增量更新**: 只更新变更的部分
- **缓存机制**: 缓存计算结果

### 3. 事件优化

- **事件委托**: 使用事件委托减少事件监听器
- **快速匹配**: 优化的快捷键匹配算法
- **防抖处理**: 避免频繁的事件处理

## 设计模式

### 1. 注册表模式

- **命令注册表**: 集中管理所有命令
- **生命周期**: 自动管理命令的生命周期
- **去重机制**: 自动处理重复命令

### 2. 策略模式

- **平台策略**: 不同平台的快捷键策略
- **显示策略**: 不同平台的显示格式策略
- **解析策略**: 快捷键配置的解析策略

### 3. 观察者模式

- **键盘监听**: 监听键盘事件并触发命令
- **状态响应**: 响应命令状态的变化
- **事件传播**: 命令触发事件的传播

## 使用场景

### 1. 开发效率

- **快速操作**: 通过快捷键快速执行操作
- **命令面板**: 快速搜索和执行命令
- **自定义配置**: 个性化快捷键配置

### 2. 用户体验

- **一致性**: 统一的快捷键体验
- **可发现性**: 通过命令面板发现功能
- **无障碍**: 完整的键盘导航支持

### 3. 开发者工具

- **命令扩展**: 开发者可以扩展命令系统
- **插件支持**: 支持插件的命令注册
- **调试支持**: 开发模式下的调试信息

## 依赖关系

- **DialogProvider**: 提供对话框状态管理
- **SettingsProvider**: 提供快捷键设置
- **LanguageProvider**: 提供国际化支持

## 最佳实践

1. **命令ID**: 使用唯一的命令ID
2. **快捷键**: 选择符合平台习惯的快捷键
3. **分类**: 合理分类命令便于查找
4. **描述**: 提供清晰的命令描述
5. **冲突避免**: 避免快捷键冲突

## 扩展指南

### 注册自定义命令

```typescript
// 在组件中注册命令
const { register } = useCommand()

register(() => [
  {
    id: "my-custom-command",
    title: "My Custom Command",
    description: "A custom command example",
    category: "Custom",
    keybind: "mod+shift+c",
    onSelect: () => {
      console.log("Custom command executed")
    },
  },
])
```

### 动态命令注册

```typescript
// 根据状态动态注册命令
register(() => {
  const commands: CommandOption[] = []

  if (someCondition) {
    commands.push({
      id: "conditional-command",
      title: "Conditional Command",
      onSelect: () => {
        /* ... */
      },
    })
  }

  return commands
})
```

## 总结

`CommandProvider` 是应用的命令系统核心，提供了：

- **完整的命令注册和管理功能**
- **强大的快捷键系统**
- **智能的命令面板**
- **优秀的跨平台支持**

它确保了用户能够高效地使用应用功能，是OpenCode应用用户体验的重要基石。
