# Codex Account Manager

一个面向 Windows 的本地 Codex 多账号工作台。除了集中查看登录状态、5 小时额度、每周额度、真实可用的重置卡和异常官方额度恢复记录，还能直接管理提示词、第三方 API、路由、会话、Skills、MCP、TOML、登录凭据和备份。

> 本项目是社区开源工具，与 OpenAI 没有关联、授权或背书。账号登录由本机 Codex App Server 发起，项目不会提供或托管账号服务。

## 主要功能

- 为每个账号创建独立的 `CODEX_HOME`，登录状态互不覆盖。
- 通过浏览器完成 ChatGPT 登录，关闭应用后保留本机登录文件。
- 集中展示 5 小时额度、每周额度、重置倒计时和套餐信息。
- 独立工作区概览汇总当前模型、Provider、`config.toml`、`auth.json`、提示词、Skills、MCP 和会话状态，并在侧栏显示实际 Codex CLI 版本。
- 识别 Free、Go、Plus、Pro、Team、Business、Enterprise、Edu 等套餐；新套餐代码会保留原始值，不会误判为 Plus。
- 仅显示包含真实 ID、状态可用且尚未过期的重置卡。
- 支持单账号使用重置卡，以及带二次确认的批量使用流程。
- 标记额度耗尽、额度数据缺失、刷新异常和“疑似 BUG号”。
- “疑似 BUG号”只作为数据状态提示，不计入需处理数量；真实额度耗尽或低余量仍会单独告警。
- 每分钟自动串行刷新，手动刷新最多同时处理两个账号。
- 记录额度在计划时间之前全部恢复的异常官方重置时间；使用重置卡不会记为官方重置。
- 主数据损坏时可从校验通过的备份或中断写入文件恢复，并在恢复失败时保留全部账号目录。
- 可直接启动所选账号的 Codex 终端，或打开对应的本地配置目录。
- 提供离线提示词模板库，可分类、导入 Markdown、同步在线目录，并在“追加到 `AGENTS.md`”与“独立指令文件”两种模式间切换；一次只启用一个模板，停用后恢复原配置。
- 管理第三方 API Provider，支持预设、密钥脱敏、复制、模型发现、模型测试、SQLite 导入和 1M 上下文配置。
- 提供本地路由与故障转移，支持优先队列、超时、重试、熔断、线路健康状态和退出时恢复直连。
- 查看并启用或停用本地 Skills 与 MCP，支持备注、ZIP 安装/导出、已有内容预览导入和 Git 更新检查。
- 搜索、按项目筛选、批量同步、导出、移入回收站或二次确认后永久删除本地会话。
- 按账号编辑 `config.toml`；登录凭据默认隐藏，可显式查看和编辑 `auth.json`，写入前进行 JSON 校验。
- `AGENTS.md`、`config.toml` 和 `auth.json` 写入前自动备份，可在备份页恢复。
- 环境诊断会检查登录文件、配置健康、扩展、会话和目录写入状态；可对确认缺失的 Provider 字段执行带备份的修复。
- “关于”页集中提供 Telegram、VPN、开源主页和版本信息。
- 从 GitHub Releases 检查新版，可选择应用内下载安装或打开下载页。
- 主操作使用蓝色，次级操作使用蓝色描边；删除、永久删除等危险确认保留红色。

按此前产品范围，本项目不包含 Token 用量统计页面。

## 项目入口

- 项目官方频道：[Telegram / renminpin](https://t.me/renminpin)
- VPN 推荐：[renminde.com](https://renminde.com)

## 系统要求

- Windows 10 或 Windows 11 x64
- Node.js 20 或更高版本
- 已安装 Codex Desktop 或 `codex` 命令。应用优先识别 Codex Desktop 的真实 `codex.exe`，再使用 `PATH`。

## 本地开发

```powershell
npm install
npm run dev
```

运行测试和生产构建：

```powershell
npm test
npm run build
```

## Windows 打包

```powershell
npm run dist:win
```

安装版和便携版会生成在 `release/` 目录。打包只包含生产前端、Electron 运行代码、内置提示词目录和必要依赖，并使用最高压缩；参考源码、截图、测试和开发缓存不会进入安装包。

## 本地数据

Windows 版本将运行数据保存在：

```text
D:\codex-account-manager-data
```

其中包含账号索引、每个账号隔离的 Codex 配置、Electron 会话数据、日志和崩溃信息。`auth.json` 与账号索引均已加入 `.gitignore`，不应上传到仓库、Issue、聊天记录或截图中。

账号、登录文件、Provider 密钥、路由设置、提示词和备份都保存在各账号独立目录中。关闭应用再打开时会继续使用现有登录态。删除账号会同时删除对应的受管配置目录，因此界面提供明确确认流程。

## 数据恢复

账号索引采用主文件、已验证备份和 pending 文件三层恢复：

1. 主文件有效时直接读取。
2. 主文件缺失或损坏时，优先使用校验通过的备份。
3. 备份也失效时，尝试恢复完整的 pending 写入。
4. 仍未恢复时进入恢复界面并暂停孤儿目录清理，避免误删登录数据。

请在处理数据问题前完整备份 `D:\codex-account-manager-data`。

## 开源协议

项目基于 [MIT License](LICENSE) 开源。参与开发前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，安全问题请参考 [SECURITY.md](SECURITY.md)。
