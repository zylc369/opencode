# NotificationProvider 代码分析文档

## 概述

`NotificationProvider` 是 OpenCode 应用中负责通知管理的 Provider。它处理各种应用通知，包括AI响应完成通知、错误通知等，支持声音提醒、系统通知、通知持久化等功能。

## 主要功能

### 1. 通知类型管理

- **AI响应通知**: 当AI完成响应时的通知
- **错误通知**: 当会话发生错误时的通知
- **会话级别通知**: 与特定会话相关的通知
- **项目级别通知**: 与项目相关的通知

### 2. 通知状态管理

- **已读/未读状态**: 管理通知的查看状态
- **通知持久化**: 通知状态的持久化存储
- **通知清理**: 自动清理过期和过多的通知
- **通知索引**: 高效的通知查询和过滤

### 3. 多渠道通知

- **应用内通知**: 应用内的通知显示
- **系统通知**: 操作系统级别的通知
- **声音提醒**: 可配置的声音提示
- **视觉指示**: 未读通知的视觉提示

## 核心组件

### 通知类型定义

#### 基础通知类型

```typescript
type NotificationBase = {
  directory?: string // 关联的目录
  session?: string // 关联的会话
  metadata?: any // 元数据
  time: number // 通知时间
  viewed: boolean // 是否已查看
}
```

#### AI响应完成通知

```typescript
type TurnCompleteNotification = NotificationBase & {
  type: "turn-complete" // AI响应完成类型
}
```

#### 错误通知

```typescript
type ErrorNotification = NotificationBase & {
  type: "error" // 错误类型
  error: EventSessionError["properties"]["error"] // 错误详情
}
```

#### 统一通知类型

```typescript
export type Notification = TurnCompleteNotification | ErrorNotification
```

### 通知生命周期管理

#### 通知清理策略

```typescript
const MAX_NOTIFICATIONS = 500
const NOTIFICATION_TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30天

function pruneNotifications(list: Notification[]) {
  const cutoff = Date.now() - NOTIFICATION_TTL_MS
  const pruned = list.filter((n) => n.time >= cutoff)
  if (pruned.length <= MAX_NOTIFICATIONS) return pruned
  return pruned.slice(pruned.length - MAX_NOTIFICATIONS)
}
```

**清理策略:**

- **时间限制**: 30天前的通知自动清理
- **数量限制**: 最多保留500条通知
- **最新优先**: 保留最新的通知记录

#### 通知添加

```typescript
const append = (notification: Notification) => {
  setStore("list", (list) => pruneNotifications([...list, notification]))
}
```

**特性:**

- **即时清理**: 添加新通知时立即执行清理
- **数量控制**: 严格控制通知数量
- **最新在前**: 新通知添加到列表前面

### 通知索引系统

#### 通知索引构建

```typescript
import { buildNotificationIndex } from "./notification-index"

const index = createMemo(() => buildNotificationIndex(store.list))
```

**索引功能:**

- **会话索引**: 按会话ID索引通知
- **项目索引**: 按目录索引通知
- **未读统计**: 统计未读通知数量
- **错误检测**: 检测是否包含错误通知

### 事件监听与处理

#### 事件监听

```typescript
const unsub = globalSDK.event.listen((e) => {
  const event = e.details
  if (event.type !== "session.idle" && event.type !== "session.error") return

  const directory = e.name
  const time = Date.now()
  const viewed = (sessionID?: string) => {
    const activeDirectory = currentDirectory()
    const activeSession = currentSession()
    if (!activeDirectory) return false
    if (!activeSession) return false
    if (!sessionID) return false
    if (directory !== activeDirectory) return false
    return sessionID === activeSession
  }
  // 处理事件...
})
```

#### AI响应完成处理

```typescript
case "session.idle": {
  const sessionID = event.properties.sessionID
  const [syncStore] = globalSync.child(directory, { bootstrap: false })
  const match = Binary.search(syncStore.session, sessionID, (s) => s.id)
  const session = match.found ? syncStore.session[match.index] : undefined
  if (session?.parentID) break

  playSound(soundSrc(settings.sounds.agent()))

  append({
    directory,
    time,
    viewed: viewed(sessionID),
    type: "turn-complete",
    session: sessionID,
  })

  const href = `/${base64Encode(directory)}/session/${sessionID}`
  if (settings.notifications.agent()) {
    void platform.notify(
      language.t("notification.session.responseReady.title"),
      session?.title ?? sessionID,
      href,
    )
  }
  break
}
```

#### 错误通知处理

```typescript
case "session.error": {
  const sessionID = event.properties.sessionID
  const [syncStore] = globalSync.child(directory, { bootstrap: false })
  const match = sessionID ? Binary.search(syncStore.session, sessionID, (s) => s.id) : undefined
  const session = sessionID && match?.found ? syncStore.session[match.index] : undefined
  if (session?.parentID) break

  playSound(soundSrc(settings.sounds.errors()))

  const error = "error" in event.properties ? event.properties.error : undefined
  append({
    directory,
    time,
    viewed: viewed(sessionID),
    type: "error",
    session: sessionID ?? "global",
    error,
  })
  const description =
    session?.title ??
    (typeof error === "string" ? error : language.t("notification.session.error.fallbackDescription"))
  const href = sessionID ? `/${base64Encode(directory)}/session/${sessionID}` : `/${base64Encode(directory)}`
  if (settings.notifications.errors()) {
    void platform.notify(language.t("notification.session.error.title"), description, href)
  }
  break
}
```

## 提供的 API

### 基础属性

```typescript
{
  ready: Accessor<boolean>,  // 是否准备就绪
}
```

### 会话级别通知

```typescript
{
  session: {
    all(session: string): Notification[],                    // 获取会话的所有通知
    unseen(session: string): Notification[],                 // 获取会话的未读通知
    unseenCount(session: string): number,                     // 获取会话的未读数量
    unseenHasError(session: string): boolean,                 // 检查会话是否有未读错误
    markViewed(session: string): void,                        // 标记会话通知为已读
  },
}
```

### 项目级别通知

```typescript
{
  project: {
    all(directory: string): Notification[],                  // 获取项目的所有通知
    unseen(directory: string): Notification[],               // 获取项目的未读通知
    unseenCount(directory: string): number,                  // 获取项目的未读数量
    unseenHasError(directory: string): boolean,              // 检查项目是否有未读错误
    markViewed(directory: string): void,                     // 标记项目通知为已读
  },
}
```

## 性能特性

### 1. 内存管理

- **数量限制**: 最多保留500条通知
- **时间限制**: 30天后自动清理
- **增量清理**: 添加新通知时增量清理
- **索引优化**: 使用索引提高查询效率

### 2. 状态优化

- **计算属性**: 使用 `createMemo` 优化索引计算
- **批量更新**: 批量更新通知状态
- **懒加载**: 按需计算通知统计信息

### 3. 存储优化

- **持久化**: 通知状态的持久化存储
- **版本管理**: 支持数据结构版本升级
- **增量保存**: 只保存变更的数据

## 用户体验特性

### 1. 多渠道通知

- **应用内通知**: 在应用内显示通知
- **系统通知**: 使用操作系统通知
- **声音提醒**: 可配置的声音提示
- **视觉指示**: 未读通知的视觉提示

### 2. 智能判断

- **上下文感知**: 根据当前上下文判断通知状态
- **过滤子会话**: 过滤掉子会话的通知
- **个性化**: 支持个性化通知设置

### 3. 便捷操作

- **快速跳转**: 点击通知快速跳转到相关页面
- **批量标记**: 支持批量标记已读
- **历史查看**: 查看历史通知记录

## 设计模式

### 1. 观察者模式

- **事件监听**: 监听会话状态事件
- **自动响应**: 自动生成相关通知
- **实时更新**: 实时更新通知状态

### 2. 策略模式

- **清理策略**: 基于时间和数量的清理策略
- **索引策略**: 多维度的通知索引
- **通知策略**: 不同类型的通知策略

### 3. 工厂模式

- **通知工厂**: 创建不同类型的通知
- **索引工厂**: 构建通知索引
- **声音工厂**: 生成声音提示

## 使用场景

### 1. AI交互

- **响应完成**: AI完成响应时通知用户
- **处理状态**: AI处理过程中的状态通知
- **交互提醒**: 需要用户交互时的提醒

### 2. 错误处理

- **错误通知**: 系统错误时的及时通知
- **异常提醒**: 异常情况的提醒
- **故障恢复**: 故障恢复后的通知

### 3. 协作开发

- **团队通知**: 团队相关的通知
- **项目状态**: 项目状态的变更通知
- **更新提醒**: 重要更新的提醒

## 依赖关系

- **GlobalSDKProvider**: 提供事件监听功能
- **GlobalSyncProvider**: 提供会话状态数据
- **PlatformProvider**: 提供系统通知功能
- **SettingsProvider**: 提供通知配置
- **LanguageProvider**: 提供国际化支持

## 最佳实践

1. **通知分类**: 合理分类不同类型的通知
2. **频率控制**: 避免过于频繁的通知
3. **内容清晰**: 通知内容简洁明了
4. **及时清理**: 定期清理过期通知
5. **用户控制**: 给用户充分的通知控制权

## 扩展指南

### 添加新的通知类型

```typescript
// 1. 定义新的通知类型
type CustomNotification = NotificationBase & {
  type: "custom"
  customData: any
}

// 2. 更新联合类型
export type Notification = TurnCompleteNotification | ErrorNotification | CustomNotification

// 3. 在事件监听中添加处理逻辑
case "custom.event": {
  // 处理自定义事件
  append({
    directory,
    time,
    viewed: viewed(sessionID),
    type: "custom",
    session: sessionID,
    customData: event.properties.customData,
  })
  break
}
```

## 总结

`NotificationProvider` 是应用的通知中心，提供了：

- **完整的通知管理功能**
- **智能的通知索引系统**
- **多渠道的通知提醒**
- **优秀的用户体验**

它确保了用户能够及时了解应用状态，是OpenCode应用用户体验的重要组成部分。
