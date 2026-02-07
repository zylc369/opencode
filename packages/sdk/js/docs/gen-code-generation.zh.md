# Gen 目录代码生成分析

## 概述

`src/gen/` 目录包含 OpenCode API 的**自动生成** TypeScript SDK 代码。这些代码使用 `@hey-api/openapi-ts` 工具从 OpenAPI 规范生成。

---

## 生成流程

```
┌─────────────────────────────────────────────────────────────────┐
│  1. opencode 服务器生成 OpenAPI 规范                            │
│     └─ bun dev generate > openapi.json                          │
├─────────────────────────────────────────────────────────────────┤
│  2. @hey-api/openapi-ts 读取 openapi.json                        │
│     └─ 生成 TypeScript SDK 代码                                  │
├─────────────────────────────────────────────────────────────────┤
│  3. 输出到 src/gen/ 和 src/v2/gen/ 目录                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 理解 `bun dev generate`

### 命令解析

```bash
bun dev generate
│    │   │
│    │   └── 传递给 opencode CLI 的参数（不是 npm 脚本）
│    └── package.json 中的脚本
└── bun 运行时
```

### 工作原理

**文件**: `packages/opencode/package.json`

```json
{
  "scripts": {
    "dev": "bun run --conditions=browser ./src/index.ts"
  }
}
```

**文件**: `packages/opencode/src/index.ts`

```typescript
import { GenerateCommand } from "./cli/cmd/generate"

const cli = yargs(hideBin(process.argv)).command(GenerateCommand) // 注册 generate 子命令
// ... 其他命令

await cli.parse() // 解析命令行参数
```

**文件**: `packages/opencode/src/cli/cmd/generate.ts`

```typescript
export const GenerateCommand = {
  command: "generate", // ← 子命令名称
  handler: async () => {
    // 将 OpenAPI JSON 输出到 stdout
  },
}
```

### 运行目录

| 命令                          | 目录                |
| ----------------------------- | ------------------- |
| `bun dev generate`            | `packages/opencode` |
| `bun src/index.ts generate`   | `packages/opencode` |
| `bun src/cli/cmd/generate.ts` | `packages/opencode` |

**注意**: `generate` 命令是 **CLI 子命令**，不是独立的 npm 脚本。

---

## 详细步骤

### 步骤 1: 生成 OpenAPI 规范

**工作目录**: `packages/opencode`

**命令**: `bun run --conditions=browser ./src/index.ts generate`

**文件**: `packages/opencode/src/cli/cmd/generate.ts`

```typescript
export const GenerateCommand = {
  command: "generate",
  handler: async () => {
    // 调用 Server.openapi() 生成 OpenAPI 规范
    const specs = await Server.openapi()

    // 为每个操作添加代码示例
    for (const item of Object.values(specs.paths)) {
      for (const method of ["get", "post", "put", "delete", "patch"] as const) {
        const operation = item[method]
        if (!operation?.operationId) continue
        operation["x-codeSamples"] = [
          {
            lang: "js",
            source: [
              `import { createOpencodeClient } from "@opencode-ai/sdk"`,
              ``,
              `const client = createOpencodeClient()`,
              `await client.${operation.operationId}({`,
              `  ...`,
              `})`,
            ].join("\n"),
          },
        ]
      }
    }

    // 将 JSON 输出到 stdout
    const json = JSON.stringify(specs, null, 2)
    await new Promise<void>((resolve) => {
      process.stdout.write(json, () => resolve())
    })
  },
}
```

**Server.openapi() 的工作原理**:

**文件**: `packages/opencode/src/server/server.ts`

```typescript
export async function openapi() {
  // 从所有注册的路由生成 OpenAPI 规范
  const result = await generateSpecs(App() as Hono, {
    documentation: {
      info: {
        title: "opencode",
        version: "1.0.0",
        description: "opencode api",
      },
      openapi: "3.1.1",
    },
  })
  return result
}
```

`hono-openapi` 的 `generateSpecs` 函数会扫描：

- 所有使用 `describeRoute()` 装饰器的路由定义
- 来自 Zod 验证器的请求/响应架构
- 参数类型和验证规则
- 生成完整的 OpenAPI 3.1.1 规范

### 步骤 2: SDK 构建脚本

**工作目录**: `packages/sdk/js`

**文件**: `packages/sdk/js/script/build.ts`

```typescript
import { createClient } from "@hey-api/openapi-ts"

// 1. 从 opencode 服务器生成 openapi.json
//    使用 .cwd() 切换到 opencode 目录
await $`bun dev generate > ${dir}/openapi.json`.cwd(path.resolve(dir, "../../opencode"))

// 2. 使用 @hey-api/openapi-ts 生成代码
await createClient({
  input: "./openapi.json",
  output: {
    path: "./src/v2/gen", // ← v2 SDK 输出目录
    clean: true, // 生成前删除旧文件
  },
  plugins: [
    {
      name: "@hey-api/typescript",
      exportFromIndex: false,
    },
    {
      name: "@hey-api/sdk",
      instance: "OpencodeClient",
      exportFromIndex: false,
      auth: false,
      paramsStructure: "flat",
    },
    {
      name: "@hey-api/client-fetch",
      exportFromIndex: false,
      baseUrl: "http://localhost:4096",
    },
  ],
})

// 3. 格式化生成的代码
await $`bun prettier --write src/gen`
await $`bun prettier --write src/v2`

// 4. 编译 TypeScript
await $`bun tsc`

// 5. 清理
await $`rm openapi.json`
```

---

## V1 与 V2 SDK

项目有两个 SDK 版本：

| 目录          | 版本 | 状态                   |
| ------------- | ---- | ---------------------- |
| `src/gen/`    | V1   | 旧版本，为兼容性而维护 |
| `src/v2/gen/` | V2   | 当前版本，积极开发中   |

### 导出配置

**文件**: `packages/sdk/js/package.json`

```json
{
  "exports": {
    ".": "./src/index.ts", // V1 SDK
    "/client": "./src/client.ts", // V1 Client
    "/server": "./src/server.ts", // V1 Server 类型
    "/v2": "./src/v2/index.ts", // V2 SDK
    "/v2/client": "./src/v2/client.ts", // V2 Client
    "/v2/server": "./src/v2/server.ts" // V2 Server 类型
  }
}
```

---

## 生成的文件结构

```
src/gen/
├── client.gen.ts          # 客户端配置
├── sdk.gen.ts             # SDK 主要方法
├── types.gen.ts           # TypeScript 类型定义
├── client/                # 客户端核心
│   ├── index.ts
│   ├── types.gen.ts
│   └── utils.gen.ts
└── core/                  # 核心功能
    ├── auth.gen.ts
    ├── bodySerializer.gen.ts
    ├── params.gen.ts
    ├── pathSerializer.gen.ts
    ├── queryKeySerializer.gen.ts
    ├── serverSentEvents.gen.ts
    ├── types.gen.ts
    └── utils.gen.ts
```

---

## 使用的工具

| 工具                    | 版本    | 用途                                    |
| ----------------------- | ------- | --------------------------------------- |
| `@hey-api/openapi-ts`   | 0.90.10 | OpenAPI 规范转 TypeScript SDK           |
| `@hey-api/typescript`   | -       | 生成 TypeScript 类型                    |
| `@hey-api/sdk`          | -       | 生成 SDK 客户端类                       |
| `@hey-api/client-fetch` | -       | 生成基于 fetch 的 HTTP 客户端           |
| `hono-openapi`          | -       | 从 Hono 路由生成 OpenAPI 规范（服务端） |

---

## 如何重新生成

```bash
# 在 packages/sdk/js 目录下
bun run build
```

这个命令会：

1. 切换到 `packages/opencode` 目录
2. 运行 `bun dev generate` 输出 OpenAPI 规范
3. 切换回 `packages/sdk/js` 目录
4. 清理旧的 gen 目录（`clean: true`）
5. 生成新的 TypeScript 代码
6. 运行 prettier 格式化
7. 编译 TypeScript
8. 删除临时的 openapi.json

---

## 独立运行 generate 命令

如果只想生成 OpenAPI 规范（不构建 SDK）：

```bash
cd packages/opencode
bun dev generate > openapi.json
```

或者使用替代语法：

```bash
cd packages/opencode
bun src/index.ts generate > openapi.json
```

---

## 自动生成文件标记

每个生成的文件开头都有：

```typescript
// This file is auto-generated by @hey-api/openapi-ts
```

这表明这些文件**不应该**手动编辑，因为它们会在下次构建时被覆盖。

---

## 构建依赖

来自 `packages/sdk/js/package.json`：

```json
{
  "devDependencies": {
    "@hey-api/openapi-ts": "0.90.10"
  }
}
```

---

## 关键设计决策

### 1. 独立的 Gen 目录

- 生成的代码隔离在 `gen/` 目录中
- 手写代码和生成代码清晰分离
- 可以重新生成而不影响其他文件

### 2. 清理输出

```typescript
output: {
  clean: true
}
```

- 生成新代码前删除旧文件
- 防止过时文件残留

### 3. 扁平参数结构

```typescript
paramsStructure: "flat"
```

- API 参数被扁平化（不嵌套在 `body`、`query` 等下）
- 为使用者提供更简单的 API 表面

### 4. 基于 Fetch 的客户端

```typescript
name: "@hey-api/client-fetch"
```

- 使用原生 `fetch` API
- 无需额外的 HTTP 客户端依赖
- 可在浏览器、Node.js、Bun 等环境运行

### 5. 基于 CLI 的生成

- `generate` 是 CLI 子命令，不是 npm 脚本
- 允许从不同上下文灵活调用
- 可以从构建脚本中程序化调用

---

## 使用示例

生成后，SDK 可以这样使用：

### V1 SDK

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
})

// 调用 API 方法
const result = await client.pathGet()
const commands = await client.commandList()
```

### V2 SDK

```typescript
import { createClient } from "@opencode-ai/sdk/v2"

const client = createClient({
  baseUrl: "http://localhost:4096",
})

// 调用 API 方法
const result = await client.pathGet()
const commands = await client.commandList()
```

所有类型都从 OpenAPI 规范自动推断。
