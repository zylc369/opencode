# Development Log


## 2026-02-05 分支：`feature/optimization_v1`

### 开发日期

1. 开始时间：2026-02-05
2. 结束时间：TODO

### 变更记录

1. opencode web支持自定义标题，需要指定`--title`参数。
2. 支持构建不包含share功能的产物。
3. 显示session及其数据所在目录。
4. 在session内cd后，会更改新的工作目录，创建新session后继承更改后的工作目录。
5. 其他：
    1. \[已完成\]`packages/opencode/package.json`添加`dev:web`支持直接启动opencode web。