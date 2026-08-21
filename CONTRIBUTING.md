# 贡献指南

感谢参与 BlackRain Desktop。项目采用 GitHub Flow：`main` 保持可用，所有改动通过短命分支和 Pull Request 合并。

## 开始之前

1. 阅读根目录 `README.md`、`AGENTS.md`、`apps/desktop/AGENTS.md` 和 [文档地图](docs/README.md)。
2. 确认改动属于 Codex-first 桌面客户端、Electron 宿主或可移植 Browser Runtime 主线。
3. 涉及产品行为、运行时边界或公共 Browser 合同时，同步对应 living spec 的 `tasks.md`、`decisions.md` 和 `verification.md`。

工作台、插件市场、Office 和 OPC 资料目前是实验性归档，不会自然扩建为产品主线。恢复这些方向前必须先更新产品决策和 spec。

## 本地开发

```powershell
git switch main
git pull --ff-only origin main
git switch -c feat/short-description

Set-Location apps/desktop
npm.cmd ci
npm.cmd run typecheck
npm.cmd run test
npm.cmd run lint
npm.cmd run check:host-boundary
```

Windows 是发布验收平台。涉及 Electron main、Browser、凭据、输入、权限、安装器或更新时，在 PR 中写明 Windows 实机验证结果；没有运行的项目必须明确标注“未验证”。

## 提交与 Pull Request

- 提交信息使用 Conventional Commits，例如 `feat: add browser recovery state`。
- 一个 PR 只解决一个可审查的问题，避免把无关重构混在一起。
- PR 描述必须包含改动范围、真实命令和结果、未验证项、风险、文档/spec 同步情况以及第三方 License 说明。
- 通过至少一次 review 和 CI 后 Squash 合并；不要直接 push `main`。
- 不提交构建输出、签名证书、密钥、Cookie、客户数据、私有 URL、账号 token 或未经授权的第三方制品。

## 架构与安全边界

- `codex-rs` / `codex app-server` 是唯一 agent runtime，不 fork agent loop，也不引入第二内核。
- Electron main 持有窗口、权限、Browser、App Server transport 和系统能力；preload 只暴露类型化 allowlist；renderer 不接触 Node.js 或原始 IPC。
- Browser 页面不得加载 App preload。`WebContentsView`、session、CDP、下载、弹窗和权限由 main 统一持有和校验。
- 不能把官方 Codex App 的闭源代码、bundle、字体、图标 path 或其他专有资源复制到仓库。
- 新增依赖、代码或资产必须先确认许可证、来源、版本和 NOTICE/署名处理。AGPL/GPL/BSL 或无许可证内容不得在没有单独法律审查的情况下引入。

## 文档与验证

文档是代码的一部分：产品形态看 `docs/04-产品形态.md`，运行时边界看 `docs/09-运行时架构与里程碑.md`，命令看 `docs/commands.md`，当前证据看对应 spec 的 `verification.md`。不要用目标拓扑、旧截图、测试计划或迁移账本代替实际验证。

## License

提交到 BlackRain 的新代码和文档默认按仓库根目录 MIT License 提供，第三方内容仍受其原许可证约束。提交即表示你有权提供该贡献，并同意项目按当前许可证分发。
