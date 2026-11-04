# OpenViking 扩展（DSH 插件）

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

把 OpenViking 接入 DeepSeek Harness，并提供三个可独立开关的组件：

- **console**：左侧栏 OpenViking Studio 控制台；
- **sidebar**：右侧栏 `viking://` 文件与目录树；
- **vika**：Vika 管理面板、本地回环桥，以及由 Vika 驱动 DSH 会话的编排能力。

一个插件包，三个组件，各自有独立开关；壳层只负责装配，不提供功能。

## 致谢

本项目在设计和实现过程中抄袭、参考、学习了以下开源项目，感谢原作者与贡献者：

- [deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype)
- [Linjiangxian0203/dsh-superagent-prototype](https://github.com/Linjiangxian0203/dsh-superagent-prototype)
- [hxh230802/dsh-superagent-prototype](https://github.com/hxh230802/dsh-superagent-prototype)
- [volcengine/OpenViking（feat/vika 分支）](https://github.com/volcengine/OpenViking/tree/feat/vika)
- [volcengine/OpenViking](https://github.com/volcengine/OpenViking)

本项目是独立开发，不代表上述项目的官方发布，也不保证与上游版本同步。

## 组件

### console

左侧栏入口 + 中间列嵌入 OpenViking Studio。请求由宿主代理，浏览器端不保存 OpenViking 的 key。

### sidebar

右侧栏 `viking://` 目录树：

- 懒加载目录；
- 文件正文预览；
- 目录的 L0 摘要 + L1 概览组合视图；
- hover 行可把 URI 引用到当前会话，或在新页签打开；
- 根 URI 可随时修改。

右侧栏依赖 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)；未安装时 console 仍可正常使用。

### vika

Vika 是 Router，DSH 的每个物理会话是 Worker：

- 完整 vika 管理面板：概览、触发、评估、执行、设置；
- Vika 容器通过本地回环桥调用 DSH：触发、评估、接单、工单、worker 报告；
- 内置 `vika-router` 与 `vika-worker` 两个固定 agent preset；
- 一键检测/配置 Vika 容器：部署工具、角色、桥配置并重启；
- 一键恢复：删除插件注入内容，恢复 Vika 原始角色；
- GitHub CLI 安装/登录入口；GitHub 凭据只留在 Vika 容器。

**vika 组件默认关闭**：安装后只启用 console / sidebar，不会启动桥和 vika 运行时；需要时在插件页把 `vika` 行打开。

Vika 本体、OpenViking 服务、飞书机器人都需要用户自己部署；插件不安装、不删除容器。

## 环境要求

- DSH Web 或 Desktop，`0.2.1+`；
- OpenViking `0.5.x`，`/health` 可访问；
- 可选：`dsh-better-sidebar`，用于右侧栏页签；
- 可选：Docker + 用户自己部署的 Vika 容器（vika 组件需要）。

## 安装

在 DSH 插件管理器中搜索并安装：

```text
dsh-openviking-expand
```

也可以使用命令行：

```bash
dsh plugin --profile web add dsh-openviking-expand
```

从源码开发：

```bash
git clone <this-repository-url>
cd dsh-openviking-expand
node scripts/build-client.mjs
dsh plugin --profile web add .
```

安装后在插件列表确认「OpenViking 扩展」已启用，硬刷新浏览器。`vika` 组件默认关闭，需要时在插件页单独打开。

## 配置

### OpenViking 页

配置服务类型、地址、语言和密钥。也可以在嵌入的 Studio 里添加连接，侧边栏会跟随 Studio 当前选中的连接。

### vika 页

1. 选择/检测已运行的 Vika 容器；
2. 点「一键配置 Vika」：部署工具、角色、桥配置，并重启 Vika；
3. 需要 GitHub 时点「安装/登录 GitHub CLI」；
4. 需要撤销插件注入时点「恢复 Vika 原始接线」。

Vika 的工作区直接取容器 `/workspace` 的宿主挂载目录；插件不要求用户另配工作区、bridge token、GitHub 身份或分支前缀。

Vika 自己的飞书、OpenViking、模型配置用 Vika 的 setup 完成，插件不保存这些凭据。

## 使用

### 控制台与侧边栏

- 左侧栏 OpenViking：打开 Studio；
- 右侧栏 `+`：选择 OpenViking，浏览 `viking://`；
- 行内 `@`：引用到当前会话；`↗`：新页签打开。

### Vika router 模式

与 Vika 的飞书对话中使用以下命令：

| 命令 | 作用 |
| --- | --- |
| `/dshin` | 进入 router 模式，列出 DSH 已有工作区 |
| `/dshnew` | 新建一个 worker/session：选择工作区、描述任务、确认后创建 |
| `/dshout` | 退出 router 模式，只使用 Vika 自身能力 |

在 `/dshin` 状态下也可以直接对 Vika 说任务，但 Vika 不会立刻创建 worker，而是先把以下内容发给用户确认：

1. 使用的工作区路径；
2. 准备发给 worker 的完整提示词。

用户明确确认后，Vika 才会通过桥创建 Ticket 和 DSH Worker session。只是聊天或问问题时，Vika 自己回答，不创建 worker。

工作区只能使用 DSH 已存在的工作区；需要新工作区时，由 Vika 给出建议目录、用户确认后再浏览/创建，不允许隐式新建。

### Preset

- `vika-router`：只读文件系统，负责路由、状态和轻量工具；
- `vika-worker`：可写文件系统，负责实际代码、命令和测试执行。

两个 preset 由插件固定注册，不供用户手动选择。

## 架构

```text
DSH 浏览器
   │
   ├── /openviking-expand/*  ──► 插件 Host ──► OpenViking
   ├── /studio/*             ──► OpenViking Studio 静态代理
   │
   └── vika 面板
          │
          ▼
   插件 Host 的 vika 运行时
          │ 127.0.0.1 回环桥 + Bearer token
          ▼
   Vika 容器（Router）
          │ sa-trigger / sa-decide
          ▼
   DSH Engine ──► Ticket ──► Worker Session
```

相关文件：

- 插件壳与组件入口：`host/index.mjs`、`host/components/*`；
- 浏览器客户端：`client/`，构建为 `lib/client.js`；
- Vika 运行时与面板：`vika/runtime/`；
- Vika 容器工具：`vika/tools/`；
- Vika 角色补充：`vika/role-dsh.md`、`vika/role-github.md`；
- 插件配置持久化：`~/.dsh/openviking-expand.json`；
- Vika 运行状态：`<Vika 容器挂载目录>/.vika/state`。

## 安全

- OpenViking key 只在 Host 侧使用，不进浏览器；
- `viking://` 只读；拒绝 `..`、控制字符、查询串和反斜杠；
- vika 桥只绑 `127.0.0.1`，只接受回环请求，所有请求需要 Bearer token；
- Worker 的 cwd 必须来自已有 DSH 工作区；
- GitHub 凭据只在 Vika 容器内，worker 不接触；
- 一键恢复会删除插件注入到容器的工具、桥配置和角色，并恢复内置 `colleague` 角色；Vika 的飞书/OV/模型配置以及 gh 登录会保留。

## 开发

```bash
npm run check      # 构建客户端并做语法检查
npm test           # 单元测试
npm run smoke      # 客户端冒烟测试
```

发布前建议执行：

```bash
npm run check && npm test
npm pack --dry-run
```

## 许可证

AGPL-3.0-only，见 [LICENSE](LICENSE)。

上游 OpenViking、dsh-superagent-prototype 及其相关标识归各自作者所有。
