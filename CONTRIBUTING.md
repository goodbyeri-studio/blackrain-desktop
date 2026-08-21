# 贡献指南

感谢参与 BlackRain Desktop。项目采用 GitHub Flow：`main` 保持可用，所有改动通过短命分支和 Pull Request 合并。

## 现在最值得参与的工作

项目目前主要由一名维护者推进，欢迎把一个清晰的小问题变成可合并的 PR。最需要社区协作的方向是：

- provider 适配、模型 registry 和能力描述；
- Auto 路由策略、fallback 和可复现评测；
- 模型选择 UI、Codex App 工作流回归和可观测性；
- Browser 安全测试、Windows 安装与发布验证；
- 面向新贡献者的文档、测试 fixture 和故障复现。

不确定从哪里开始时，可以先看 [开放 issues](https://github.com/goodbyeri-studio/blackrain-desktop/issues)、[Discussions](https://github.com/goodbyeri-studio/blackrain-desktop/discussions) 或提交一个小的文档/测试改进；先讨论范围通常比直接实现大功能更快。

## 开始之前

1. 阅读根目录 `README.md`、`AGENTS.md`、`apps/desktop/AGENTS.md` 和 [文档地图](docs/README.md)。
2. 确认改动属于 Codex-first 桌面客户端、Electron 宿主或 Browser Runtime 公共合同。
3. 涉及产品行为、运行时边界或公共 Browser 合同时，同步对应的 `docs/design/`、`docs/architecture/` 或 ADR，并写出可复现的验证命令。

`plugins/` 与 `workbenches/` 是实验性资源。除非改动确实需要它们，否则不要把它们加入产品入口或默认发布依赖。

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

文档是代码的一部分：产品范围看 `docs/project-scope.md`，运行时边界看 `docs/architecture/`，命令看 `docs/development/commands.md`，设计合同看 `docs/design/` 和 `docs/adr/`。不要用目标拓扑、旧截图或测试计划代替实际验证。

修改 Markdown 后运行 `node scripts/check-doc-links.mjs`；CI 会拒绝指向不存在本地文件的相对链接。

## License

提交到 BlackRain 的新代码和文档默认按仓库根目录 MIT License 提供，第三方内容仍受其原许可证约束。提交即表示你有权提供该贡献，并同意项目按当前许可证分发。
