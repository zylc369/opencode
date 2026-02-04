# Tool 系统分析

## 概述

Tool 系统是 OpenCode 的核心组件之一，提供了一个标准化的工具集成框架。它允许 AI 代理安全地执行各种操作，如文件操作、命令执行、代码搜索等。

## 核心接口

### Tool.Info 接口

```typescript
interface Info<Parameters extends z.ZodType = z.ZodType, M extends Metadata = Metadata> {
  id: string
  init: (ctx?: InitContext) => Promise<{
    description: string
    parameters: Parameters
    execute(
      args: z.infer<Parameters>,
      ctx: Context,
    ): Promise<{
      title: string
      metadata: M
      output: string
      attachments?: MessageV2.FilePart[]
    }>
    formatValidationError?(error: z.ZodError): string
  }>
}
```

每个工具必须实现：

- `id`: 工具的唯一标识符
- `init`: 初始化函数，返回工具的配置和执行函数
- `description`: 工具描述
- `parameters`: Zod 参数验证模式
- `execute`: 执行函数，接收参数和上下文，返回结果

### Context 接口

工具执行上下文包含：

- `sessionID`: 会话标识
- `messageID`: 消息标识
- `agent`: 代理名称
- `abort`: 中断信号
- `messages`: 消息历史
- `metadata`: 元数据设置函数
- `ask`: 权限请求函数

## 工具定义

### Tool.define 函数

```typescript
export function define<Parameters extends z.ZodType, Result extends Metadata>(
  id: string,
  init: Info<Parameters, Result>["init"] | Awaited<ReturnType<Info<Parameters, Result>["init"]>>,
): Info<Parameters, Result>
```

`Tool.define` 是创建工具的主要方式，它：

1. 包装工具定义
2. 自动验证参数
3. 提供错误处理
4. 自动处理输出截断

## 内置工具

### 文件操作工具

- **ReadTool**: 读取文件内容
- **WriteTool**: 写入文件
- **EditTool**: 编辑文件内容
- **GlobTool**: 文件模式匹配
- **GrepTool**: 文本搜索

### 系统工具

- **BashTool**: 执行 shell 命令
- **QuestionTool**: 用户交互
- **TaskTool**: 子任务执行

### 网络工具

- **WebFetchTool**: 获取网页内容
- **WebSearchTool**: 网络搜索
- **CodeSearchTool**: 代码搜索

### 项目管理工具

- **TodoWriteTool / TodoReadTool**: 任务列表管理
- **SkillTool**: 技能系统
- **PlanExitTool / PlanEnterTool**: 计划模式

### 高级工具

- **LspTool**: Language Server Protocol 集成
- **BatchTool**: 批量操作
- **ApplyPatchTool**: 补丁应用

## 工具注册系统

### ToolRegistry

工具注册表负责：

1. 管理所有可用工具
2. 支持自定义工具
3. 插件工具集成
4. 条件性工具启用

### 工具发现

```typescript
// 自动发现本地工具
const glob = new Bun.Glob("{tool,tools}/*.{js,ts}")
for await (const match of glob.scan({...})) {
  // 加载并注册工具
}

// 插件工具
const plugins = await Plugin.list()
for (const plugin of plugins) {
  // 注册插件工具
}
```

## 安全特性

### 参数验证

每个工具使用 Zod 进行严格的参数验证：

```typescript
toolInfo.parameters.parse(args)
```

### 权限控制

通过 `PermissionNext` 系统控制工具访问权限：

```typescript
ask(input: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">): Promise<void>
```

### 输出截断

使用 `Truncate` 工具自动截断过长的输出，避免令牌超限。

## 工具条件启用

系统根据模型和配置条件性启用工具：

```typescript
// 根据提供商启用特定工具
if (t.id === "codesearch" || t.id === "websearch") {
  return model.providerID === "opencode" || Flag.OPENCODE_ENABLE_EXA
}

// 根据模型类型选择编辑工具
const usePatch = model.modelID.includes("gpt-") && !model.modelID.includes("oss")
if (t.id === "apply_patch") return usePatch
if (t.id === "edit" || t.id === "write") return !usePatch
```

## 插件工具支持

支持从插件加载工具：

```typescript
function fromPlugin(id: string, def: ToolDefinition): Tool.Info {
  return {
    id,
    init: async (initCtx) => ({
      parameters: z.object(def.args),
      description: def.description,
      execute: async (args, ctx) => {
        // 执行插件工具
        const result = await def.execute(args, pluginCtx)
        return result
      },
    }),
  }
}
```

## 最佳实践

### 工具设计原则

1. **单一职责**: 每个工具只做一件事
2. **幂等性**: 重复执行应产生相同结果
3. **错误处理**: 提供清晰的错误信息
4. **参数验证**: 严格验证所有输入
5. **资源清理**: 及时释放资源

### 错误处理

```typescript
try {
  toolInfo.parameters.parse(args)
} catch (error) {
  if (error instanceof z.ZodError && toolInfo.formatValidationError) {
    throw new Error(toolInfo.formatValidationError(error), { cause: error })
  }
  throw new Error(`The ${id} tool was called with invalid arguments: ${error}.`, { cause: error })
}
```

### 异步操作

所有工具操作都应该是异步的，支持中断信号：

```typescript
const execute = async (args, ctx) => {
  // 检查中断
  if (ctx.abort.signal.aborted) {
    throw new Error("Operation aborted")
  }

  // 执行操作
  const result = await doSomething(args)
  return result
}
```

## 扩展性

Tool 系统的设计确保了良好的扩展性：

1. **标准接口**: 所有工具遵循统一接口
2. **插件支持**: 可以通过插件添加新工具
3. **动态加载**: 支持运行时发现和加载工具
4. **配置驱动**: 通过配置控制工具可用性

这个设计使得 OpenCode 可以轻松集成各种工具，同时保持系统的安全性和稳定性。
