# Development Log

## 2026-02-05 优化

### 基本信息

1. **分支**：`feature/optimization_v1`。
2. **开发日期**：
   1. 开始时间：2026-02-05
   2. 结束时间：TODO




### 变更记录

1. **session相关**：
    1. 显示session及其数据所在目录。
    2. 在session内cd后，会更改新的工作目录，创建新session后继承更改后的工作目录。
2. **命令行及其相关功能增强**：
    1. web新增`--title`参数：支持自定义标题。
3. **开发参数增强**：
    1. `[已完成]` **支持直接启动opencode web**：`packages/opencode/package.json`添加`dev:web`。
4. **构建命令增强**：
    1. 支持构建不包含share功能的产物。
5. **日志优化**：
    1. 网页连接失败后显示请求上下文。改造位置：`server.ts -> App -> onError`。
    2. 在日志中打印请求入参和响应。
    3. 日志k=v之间空格分隔改为逗号分隔。
6. **添加代码注释**




## 问题排查记录

### 开发环境web页面打开失败

#### 背景

**我在公司**在开发环境启动opencode web模式失败，执行`bun run --conditions=browser ./src/index.ts web`命令后，自动打开的网页显示：`{"name":"UnknownError","data":{"message":"Error: Unable to connect. Is the computer able to access the url?"}}`。

> 操作步骤：进入`packages/opencode`目录，运行`bun run --conditions=browser ./src/index.ts web`。



#### 原因

opencode web启动后打开`http://127.0.0.1:4096/`网页，下面是这个网页的源码：

```html
<!doctype html>
<html lang="en" style="background-color: var(--background-base)">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OpenCode</title>
    <link rel="icon" type="image/png" href="/favicon-96x96-v3.png" sizes="96x96" />
    <link rel="icon" type="image/svg+xml" href="/favicon-v3.svg" />
    <link rel="shortcut icon" href="/favicon-v3.ico" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-v3.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <meta name="theme-color" content="#F8F7F7" />
    <meta name="theme-color" content="#131010" media="(prefers-color-scheme: dark)" />
    <meta property="og:image" content="/social-share.png" />
    <meta property="twitter:image" content="/social-share.png" />
    <script id="oc-theme-preload-script" src="/oc-theme-preload.js"></script>
    <script type="module" crossorigin src="/assets/index-BKrUGdlg.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-BTXs942x.css">
  </head>
  <body class="antialiased overscroll-none text-12-regular overflow-hidden">
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root" class="flex flex-col h-dvh p-px"></div>
  </body>
</html>
```

这个网页里面引用的资源是从`app.opencode.ai`中获取到的，公司把这个域名封禁了导致访问资源失败，进而导致页面报错。



#### 解决方案

1. `app.opencode.ai`对应代码库在`packages/app`里面。进入目录，运行`bun i`安装依赖库，运行`bun run dev`启动，假设启动后域名是`http://localhost:3000/`。

2. 打开`packages/opencode/src/server/server.ts`文件，找到`.all("/*", async (c) => {`代码块：

   ```typescript
   const path = c.req.path
   
   const response = await proxy(`https://app.opencode.ai${path}`, {
     ...c.req,
     headers: {
       ...c.req.raw.headers,
       host: "app.opencode.ai",
     },
   })
   response.headers.set(
     "Content-Security-Policy",
     "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; media-src 'self' data:; connect-src 'self' data:",
   )
   return response
   ```

3. 更改第2步找到的代码，将`https://app.opencode.ai`更换为`http://localhost:3000`，将`host: "app.opencode.ai"`更换为`host: "localhost:3000`。

**按照上述步骤改完后，遇到了新问题：页面打开白屏。解决方案请见《开发环境web页面打开白屏》一节**

> 注意：
>
> `packages/app`运行`bun run dev`打开的是`http://localhost:3000`
>
> `packages/opencode`运行`bun run --conditions=browser ./src/index.ts web`打开的是`http://localhost:4096`。



### 开发环境web页面打开白屏

#### 背景

**请先看《开发环境web页面打开失败》一节。**



#### 排查

打开chrome的“开发者工具”，点击`Console`标签页会看到这样的错误：

```text
Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "application/json". Strict MIME type checking is enforced for module scripts per HTML spec.
```

这就很奇怪了，我在网页源代码中没有看到script标签加载json的情况。



经过一番排查，我发现`packages/app/src/entry.tsx`里面有这样的语句`import pkg from "../package.json"`，我将它注释掉，然后将当前文件中使用pkg的地方替换成其他值后，在`packages/app`下再次运行`bun run dev`，然后刷新`packages/opencode`打开的`http://localhost:4096`页面，又看到很多类似这样的错误：

```text
Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "font/woff2". Strict MIME type checking is enforced for module scripts per HTML spec.
```

package.json的问题解决了，现在又出现了字体的问题，字体使用的地方就太多了，很难改过来。



此时，我在想为什么`const response = await proxy`语句代理到远程域名`https://app.opencode.ai`就可以正确的访问到资源，我本地为什么不行？它们的区别在哪里？

我最大的区别可能在于：我是开发命令启动的，远程域名运行的应该是发布版的构建产物，我使用`vite build`构建，再使用`vite preview`预览，预览的网站是`http://localhost:4173`。我将之前在`.all`里面改的`localhost:3000`在改成`localhost:4173`，然后重启，此时`http://127.0.0.1:4096/`正确的显示出前端页面。



#### 原因和解决方案总结

- **原因**：vite下，开发启动和构建后启动，它们对本地资源的处理是不同的。
- **解决方案**：
  - **方案一**：`packages/app`构建后预览。
  - **方案二**：阅读`packages/app/AGENTS.md`文档，这里面给出了开发模式下app如何与opencode web配合。

