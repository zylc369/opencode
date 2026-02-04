# OpenCode 代码分析概览

## 项目简介

OpenCode 是一个基于 AI 的代码助手工具，使用 TypeScript 和 Bun 运行时构建。它支持多种 AI 提供商、协议（MCP、LSP、ACP），并提供 CLI、TUI 和 Web 三种交互方式。

## 代码学习路径

### 第一阶段：核心基础（1-2天）

从最简单、最基础的模块开始，建立对项目整体结构的理解。

#### 1. 全局配置和工具类

```
src/global/          → 全局路径定义（XDG 规范）
src/id/              → 唯一标识生成
src/flag/            → 特性标志
src/env/             → 环境变量包装
```

**阅读顺序**：
1. `src/global/index.ts` - 了解 XDG 目录结构
2. `src/id/id.ts` - 理解 ID 生成机制
3. `src/flag/flag.ts` - 了解配置覆盖机制

**关键点**：
- XDG Base Directory 规范
- 版本化缓存管理
- 环境变量如何影响配置

#### 2. 工具函数库

```
src/util/            → 通用工具函数集合
```

**推荐先读**：
- `src/util/log.ts` - 日志系统
- `src/util/wildcard.ts` - 通配符匹配
- `src/util/filesystem.ts` - 文件系统操作
- `src/util/lock.ts` - 文件锁机制

**关键点**：
- 结构化日志模式
- 文件向上搜索算法
- 通配符匹配规则

### 第二阶段：基础设施（2-3天）

理解项目的基础设施，包括配置、存储、事件系统等。

#### 3. 配置系统 ⭐ 核心

```
src/config/          → 配置管理（最重要）
```

**阅读顺序**：
1. `src/config/markdown.ts` - Markdown 配置解析
2. `src/config/config.ts` - 主配置加载逻辑

**关键点**：
- 7 层配置优先级
- 数组字段的合并策略
- 环境变量和文件引用替换

**配置优先级**（低→高）：
1. Remote `.well-known/opencode`
2. 全局配置 `~/.config/opencode/opencode.json`
3. 自定义配置 `OPENCODE_CONFIG`
4. 项目配置 `opencode.json`
5. `.opencode` 目录
6. 内联配置 `OPENCODE_CONFIG_CONTENT`
7. 托管配置 `/etc/opencode`

#### 4. 存储和认证

```
src/storage/         → 持久化存储
src/auth/            → 认证管理
```

**阅读顺序**：
1. `src/storage/storage.ts` - 存储 API
2. `src/auth/index.ts` - 认证类型

**关键点**：
- JSON 文件存储
- 数据迁移机制
- 三种认证类型（OAuth、API Key、Well-Known）

#### 5. 事件系统

```
src/bus/             → 事件总线
```

**阅读顺序**：
1. `src/bus/bus-event.ts` - 事件定义
2. `src/bus/global.ts` - 全局事件
3. `src/bus/index.ts` - 发布订阅

**关键点**：
- 实例作用域事件
- 全局跨实例事件
- 通配符订阅

### 第三阶段：项目和工作区（1-2天）

理解项目发现、实例管理和版本控制集成。

#### 6. 项目管理

```
src/project/         → 项目和工作区管理
```

**阅读顺序**：
1. `src/project/vcs.ts` - 版本控制集成
2. `src/project/project.ts` - 项目发现
3. `src/project/instance.ts` - 实例管理
4. `src/project/bootstrap.ts` - 项目初始化

**关键点**：
- Git 仓库发现
- Worktree 检测
- 实例作用域状态管理

### 第四阶段：AI 核心系统（3-4天）⭐⭐⭐

这是最核心的部分，理解 AI 如何与系统交互。

#### 7. Provider 系统 ⭐ 核心

```
src/provider/        → AI 提供商抽象
```

**阅读顺序**：
1. `src/provider/models.ts` - 模型定义
2. `src/provider/transform.ts` - 参数转换
3. `src/provider/auth.ts` - 提供商认证
4. `src/provider/provider.ts` - 提供商注册表

**关键点**：
- 20+ 提供商统一接口
- 模型标识符格式 `provider/model`
- 提供商特定的参数转换

#### 8. Tool 系统 ⭐ 核心

```
src/tool/            → 工具集成
```

**阅读顺序**：
1. `src/tool/tool.ts` - 工具接口定义
2. `src/tool/registry.ts` - 工具注册
3. 选择几个工具深入阅读：
   - `src/tool/read.ts` - 文件读取
   - `src/tool/bash.ts` - 命令执行
   - `src/tool/edit.ts` - 文件编辑

**关键点**：
- 工具定义模式
- 权限系统集成
- 中止信号处理

#### 9. Session 系统 ⭐⭐ 最核心

```
src/session/         → 会话管理（最重要）
```

**阅读顺序**：
1. `src/session/system.ts` - 系统提示
2. `src/session/message-v2.ts` - 消息处理
3. `src/session/processor.ts` - 消息处理器
4. `src/session/llm.ts` - LLM 集成
5. `src/session/prompt.ts` - 提示构建（核心）
6. `src/session/index.ts` - 会话 CRUD

**关键点**：
- 消息类型和流转
- 提示词组装
- 流式响应处理
- 上下文压缩机制

#### 10. Agent 系统

```
src/agent/           → AI 代理配置
```

**阅读顺序**：
1. `src/agent/agent.ts` - 代理定义
2. `src/agent/prompt/` - 各种提示模板

**关键点**：
- 代理模式（subagent、primary、all）
- 权限配置
- 提示模板系统

### 第五阶段：协议集成（2-3天）

理解各种协议的集成方式。

#### 11. LSP 集成

```
src/lsp/             → Language Server Protocol
```

**阅读顺序**：
1. `src/lsp/language.ts` - 语言映射
2. `src/lsp/server.ts` - 服务器配置（50+ 服务器）
3. `src/lsp/client.ts` - 客户端包装
4. `src/lsp/index.ts` - 客户端管理

**关键点**：
- 语言到 LSP 的映射
- 预配置的服务器
- 并发请求处理

#### 12. MCP 集成

```
src/mcp/             → Model Context Protocol
```

**阅读顺序**：
1. `src/mcp/auth.ts` - 认证处理
2. `src/mcp/oauth-provider.ts` - OAuth 集成
3. `src/mcp/index.ts` - MCP 客户端

**关键点**：
- 三种传输类型（stdio、HTTP、SSE）
- Prompt 和 Tool 暴露
- OAuth 流程

#### 13. ACP 集成

```
src/acp/             → Agent Client Protocol
```

**已有 README** - 阅读 `src/acp/README.md`

**关键点**：
- Zed 等 IDE 的集成
- JSON-RPC over stdio

### 第六阶段：用户界面（2-3天）

理解各种用户交互方式。

#### 14. CLI 系统

```
src/cli/             → 命令行界面
```

**阅读顺序**：
1. `src/cli/ui.ts` - UI 工具
2. `src/cli/error.ts` - 错误格式化
3. `src/cli/bootstrap.ts` - 启动流程
4. `src/cli/cmd/` - 各种命令

**关键点**：
- Yargs 命令框架
- 启动流程
- 错误处理

#### 15. TUI 应用

```
src/cli/cmd/tui/     → 终端用户界面
```

**阅读顺序**：
1. `src/cli/cmd/tui/app.tsx` - 主应用
2. `src/cli/cmd/tui/component/` - UI 组件
3. `src/cli/cmd/tui/context/` - 上下文提供者

**关键点**：
- SolidJS + @opentui/solid
- 组件架构
- 事件处理

#### 16. HTTP 服务器

```
src/server/          → HTTP API 服务器
```

**阅读顺序**：
1. `src/server/server.ts` - 主服务器
2. `src/server/routes/` - API 路由
3. `src/server/mdns.ts` - mDNS 发现

**关键点**：
- Hono 框架
- WebSocket 支持
- mDNS 服务发现

### 第七阶段：扩展系统（1-2天）

理解系统的扩展能力。

#### 17. 权限系统

```
src/permission/      → 访问控制
```

**阅读顺序**：
1. `src/permission/arity.ts` - 权限元数
2. `src/permission/next.ts` - 权限引擎

**关键点**：
- 三种操作（allow、deny、ask）
- 通配符匹配
- 规则评估

#### 18. 插件系统

```
src/plugin/          → 插件扩展
```

**阅读顺序**：
1. `src/plugin/index.ts` - 插件系统
2. `src/plugin/codex.ts` - Codex 插件示例
3. `src/plugin/copilot.ts` - Copilot 插件示例

**关键点**：
- Hook 系统
- 插件加载
- 依赖解析

#### 19. Command 和 Skill 系统

```
src/command/         → 命令系统
src/skill/           → 技能系统
```

**阅读顺序**：
1. `src/command/index.ts` - 命令注册
2. `src/skill/skill.ts` - 技能加载

**关键点**：
- 可重用提示模板
- 多种来源（配置、MCP、Skill）

### 第八阶段：辅助模块（1天）

其他支持模块。

#### 20. 其他模块

```
src/file/            → 文件操作
src/shell/           → Shell 工具
src/pty/             → 伪终端
src/question/        → 交互式问题
src/scheduler/       → 任务调度
src/snapshot/        → 文件快照
src/share/           → 会话分享
src/patch/           → 补丁操作
src/worktree/        → Git 工作树
src/format/          → 格式化输出
src/installation/    → 安装管理
src/ide/             → IDE 检测
```

## 推荐学习顺序总结

### 快速上手路径（1周）

1. **Day 1-2**: 基础模块
   - global, id, flag, env, util

2. **Day 3-4**: 基础设施
   - config, storage, auth, bus

3. **Day 5**: 项目管理
   - project, instance, vcs

4. **Day 6-7**: AI 核心
   - provider, tool, session, agent

### 深入理解路径（2-3周）

在快速上手的基础上，继续：

5. **Day 8-10**: 协议集成
   - lsp, mcp, acp

6. **Day 11-13**: 用户界面
   - cli, tui, server

7. **Day 14-15**: 扩展系统
   - permission, plugin, command, skill

8. **Day 16-18**: 辅助模块
   - file, shell, pty, 等

9. **Day 19-21**: 深入特定领域
   - 选择感兴趣的模块深入阅读

## 重点关注文件

### 架构理解必读

| 文件 | 大小 | 重要性 |
|------|------|--------|
| `src/config/config.ts` | ~55KB | ⭐⭐⭐ |
| `src/session/prompt.ts` | ~63KB | ⭐⭐⭐ |
| `src/provider/provider.ts` | ~44KB | ⭐⭐⭐ |
| `src/lsp/server.ts` | ~63KB | ⭐⭐ |
| `src/provider/transform.ts` | ~27KB | ⭐⭐ |
| `src/tool/edit.ts` | ~21KB | ⭐⭐ |
| `src/patch/index.ts` | ~21KB | ⭐⭐ |

### 核心流程理解

1. **配置加载流程**:
   `src/config/config.ts` → 7 层优先级合并

2. **会话处理流程**:
   `src/session/index.ts` → `processor.ts` → `llm.ts` → `message-v2.ts`

3. **工具执行流程**:
   `src/tool/registry.ts` → 具体工具 → 权限检查 → 执行

4. **提示词构建流程**:
   `src/session/prompt.ts` → agent prompt + instructions + tool descriptions

## 学习建议

### 代码阅读技巧

1. **先看接口定义** - 了解模块的输入输出
2. **追踪数据流** - 理解数据如何流转
3. **关注错误处理** - 了解边界情况
4. **查看测试文件** - 理解预期行为

### 调试技巧

```bash
# 启用调试日志
OPENCODE_LOG_LEVEL=DEBUG bun run dev

# 打印日志到控制台
bun run dev --print-logs
```

### 实践建议

1. 边读边运行命令，观察行为
2. 修改配置，理解优先级
3. 添加日志，追踪执行流程
4. 阅读现有文档（docs/ 目录）

## 相关文档

- `CLAUDE.md` - Claude Code 使用指南
- `docs/README.md` - 完整文档索引
- `docs/项目概览.md` - 项目总览
- `docs/目录结构详解.md` - 目录结构
- `docs/开发指南.md` - 开发指南

---

**最后更新**: 2025-02-05
**维护者**: OpenCode 团队
