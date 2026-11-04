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
- 内置 `vika-router` 与 `vika-worker` 两个固定 agent preset。

**vika 组件默认关闭**：安装后只启用 console / sidebar，不会启动桥和 vika 运行时；需要时在插件页把 `vika` 行打开。

**容器接线不再由插件界面注入**：插件不再提供 vika 配置页，也不修改 Vika 容器。工具、角色、桥配置和 `/dshin` 放行补丁请按下方 [vika 接线（用提示词配置）](#vika-接线用提示词配置) 的提示词完成。

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

安装后在插件列表确认「OpenViking 扩展」已启用，硬刷新浏览器。`vika` 组件默认关闭，需要时在插件页单独打开；打开后面板会在 vika 运行时就绪后自动出现（最多约 30 秒），不需要刷新页面。

## 配置

### OpenViking 页

配置服务类型、地址、语言和密钥。也可以在嵌入的 Studio 里添加连接，侧边栏会跟随 Studio 当前选中的连接。

### vika 接线（用提示词配置）

插件不再提供 vika 容器配置界面，也不会自己修改 Vika 容器。把下面整段提示词发给一个能操作 Docker 的 AI 助手（例如 DSH 里的 agent），它会先向你确认信息，再按步骤配置；任何一步失败都会停下来问你。

```text
你是我的 Vika 接入配置助手。目标：把 dsh-openviking-expand 的 vika 组件接到我已有的 Vika 容器上。

先不要动任何文件，按顺序问我下面这些问题，等我逐项回答后再开始：
1. Vika 容器名是什么？（docker ps -a 里名字或镜像带 vika 的那个）
2. 这个容器的 /workspace 挂载到宿主哪个绝对目录？
3. 插件桥监听地址和端口？（默认 127.0.0.1:3742，可改）
4. 容器里的 Vika 现在是否已运行？vika status 的输出是什么？
5. 飞书、OpenViking、模型是否已经用 vika setup 配好？没配好要不要先帮你完成 setup？
6. 是否需要 GitHub CLI（gh）能力？容器里是否已经安装/登录过 gh？
7. 是否允许重启 Vika 守护进程/容器？什么时候可以重启？
8. DSH 侧是否已安装 dsh-openviking-expand，并在插件页打开了 vika 行？

拿到答案后按下面步骤执行，每一步做完告诉我结果；任何一步失败就停下问我，不要跳过：
1. 找到已安装的插件包（DSH profile 的 node_modules/dsh-openviking-expand），读取 vika/role-dsh.md、vika/role-github.md、vika/tools/*.mjs；
2. 备份容器 /root/.vika/config.json、/root/.vika/roles/vika.md（如存在）；
3. 把 vika/tools/*.mjs 复制到容器 /root/.vika/tools/；
4. 用容器里的 colleague.md 加上 role-dsh.md、role-github.md 生成 /root/.vika/roles/vika.md，把 {{AGENT_NAME}} 替换成容器 config.json 里 agents[0].displayName；
5. 写 /root/.dsh-bridge.json：url 用 http://host.docker.internal:<端口>，token 随机生成并保存到宿主工作区 .vika/state/bridge.token，hostWorkspace 用第 2 题的目录，hostReposRoot 和 hostTasksRoot 分别用它的 repos、tasks 子目录；
6. 给容器里的命令解析器打 /dshin、/dshout、/dshnew 放行补丁（在解析 token 之后插入放行判断），改完读回验证；
7. 把容器 config.json 的 agents[0].role 指向 /root/.vika/roles/vika.md；
8. 重启 Vika，确认 primary/web/updater 就绪，并执行容器内的 dsh-bridge health 检查桥；
9. 验证角色真的加载进了守护进程：找到 vika daemon 进程，读 /proc/<pid>/environ，确认有 VIKA_ROLE=/root/.vika/roles/vika.md。如果缺失（0.4.0 源码构建的已知缺陷：ecosystem.config.cjs 拼 daemon 环境时漏了 VIKA_ROLE，config.json 的 role 在这个构建上是死字段），先备份 /root/.vika/current/ecosystem.config.cjs，在 daemon env 的 VIKA_AGENT_NAME 行后插入一行 VIKA_ROLE: agent.role || ''，用容器自带 node 对文件跑 --check，重启后重新验证；这个补丁在 Vika 升级后会被覆盖，升级后要重新检查；
10. 最后告诉我：每一步结果、改了哪些文件、如何回滚（包括 /dshin 放行补丁和 VIKA_ROLE 注入补丁的还原方式）。

约束：不要删除容器或数据卷；不要改飞书/OpenViking/模型配置；不要执行 vika setup（除非第 5 题里我明确同意）；所有删除/覆盖前先备份。
```

Vika 自己的飞书、OpenViking、模型配置用 Vika 的 setup 完成，插件不保存这些凭据。

### 已知问题：源码构建的 Vika 缺 VIKA_ROLE 注入

部分从源码构建的 Vika（例如 0.4.0）在 `ecosystem.config.cjs` 拼 daemon 环境时漏掉了 `VIKA_ROLE`，而 daemon 只认这个环境变量；`config.json` 里的 `agents[0].role` 在这些构建上是死字段——角色文件写得再对，模型也拿不到 DSH 指示。

接线提示词第 9 步会检查 daemon 环境里的 `VIKA_ROLE`，缺失时按下面的方式打补丁（先备份，改完验证）：

1. 在 daemon env 的 `VIKA_AGENT_NAME: agent.displayName,` 行后插入 `VIKA_ROLE: agent.role || '',`；
2. 用 Vika 自带的 node 对 `ecosystem.config.cjs` 跑 `--check`；
3. `vika restart` 后重新读 `/proc/<pid>/environ`，确认 `VIKA_ROLE` 已生效；
4. 回滚就是还原备份并重启。

`ecosystem.config.cjs` 的 `VIKA_ROLE` 注入和 `commands.mjs` 的 `/dshin`、`/dshout`、`/dshnew` 放行补丁都改在 release 源码里，**Vika 升级或重装后会被覆盖**：升级后重新检查这两处，不在就按同样方式重打。

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
- 插件不再向 Vika 容器注入工具/角色/桥配置，也不提供一键配置/恢复界面；容器接线由用户按 README 提示词执行，插件本身不修改容器。

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
