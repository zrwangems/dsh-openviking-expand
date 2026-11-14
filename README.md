# OpenViking 扩展（DSH 插件）

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

本插件是 OpenViking（OV）的 DSH 扩展插件，把 OV 接入 DeepSeek Harness（OV 仓库：<https://github.com/volcengine/OpenViking>），提供两个可独立开关的组件：

- **console**：左侧栏 OpenViking Studio 控制台；
- **sidebar**：右侧栏 `viking://` 文件与目录树。

一个插件包，两个组件，各自有独立开关；壳层只负责装配，不提供功能。

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

## 环境要求

- DSH Web 或 Desktop，`0.2.2-rc.3` 至 `<0.3.0`；
- OpenViking `0.5.x`，`/health` 可访问；
- 可选：`dsh-better-sidebar` `0.30.x`，用于右侧栏页签。

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

安装后在插件列表确认「OpenViking 扩展」已启用，硬刷新浏览器。

## 配置

不需要在 DSH 插件设置页填写 OV 连接。插件启动时自动读取本机配置：

1. `OPENVIKING_URL` / `OPENVIKING_BASE_URL`、`OPENVIKING_API_KEY` 等环境变量；
2. `~/.openviking/ovcli.conf`（`url`、`api_key`、`root_api_key`、`account`、`user`）；
3. `~/.openviking/ov.conf`（`server.url`，或 `server.host` + `server.port`，以及 `server.root_api_key`）；
4. 旧版插件保存的连接（仅作兼容兜底）；
5. 默认地址 `http://127.0.0.1:1933`。

也可以用 `OPENVIKING_CLI_CONFIG_FILE` 和 `OPENVIKING_CONFIG_FILE` 指定两个配置文件的路径。修改配置后重启 DSH 生效。日常推荐使用 `ov` CLI 配置好连接后直接打开插件。

嵌入的 Studio 仍支持自行添加和切换连接，侧边栏会跟随 Studio 当前选中的连接。插件创建的 `dsh-console` 默认连接会跟随本机 OV 配置更新，包括从旧的 `127.0.0.1` 地址迁移到新地址；用户自己创建的 Studio 连接不会被覆盖。

## 使用

### 控制台与侧边栏

- 左侧栏 OpenViking：打开 Studio；
- 右侧栏 `+`：选择 OpenViking，浏览 `viking://`；
- 行内 `@`：引用到当前会话；`↗`：新页签打开。

## 架构

```text
DSH 浏览器
   │
   ├── /openviking-expand/*  ──► 插件 Host ──► OpenViking
   └── /studio/*             ──► OpenViking Studio 静态代理
```

相关文件：

- 插件壳与组件入口：`host/index.mjs`、`host/components/*`；
- 浏览器客户端：`client/`，构建为 `lib/client.js`；
- 本机 OV 配置读取：`host/config.mjs`；旧版 `~/.dsh/openviking-expand.json` 只读兼容，不再写入。

## 安全

- 本机 OV 配置只由 Host 读取，插件不再另存地址或密钥，也不会把本机凭据转发给 Studio 中选择的其他服务；
- `viking://` 只读；拒绝 `..`、控制字符、查询串和反斜杠；
- 插件不安装、不修改、不删除任何外部服务或容器。

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
