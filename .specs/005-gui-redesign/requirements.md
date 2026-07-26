# Requirements — GUI 重做

> **范围与事实口径（2026-07-12）**：本 spec 负责用户进入“软件开发工作台”后的 CODE surface Windows 界面产品化，不负责工作台货架、安装和生命周期 UI（见 008）。不改 Agent 行为或内核协议。“42 个 RPC 已接线”不等于 GUI 已落地，实际完成度以 `verification.md` 和代码为准。

## 背景

- 这个功能为什么现在要做：老板的打法是「先把能用的 GUI 客户端掏出来给人看，再慢慢加功能」。现状壳是 CodexMonitor fork，骨架完整可用，但视觉是 CodexMonitor 自己的语言，不够商业级。**Codex 官方 app 的 GUI 是商业级标杆**，因此目标是以 Codex app 为视觉范本，把 BlackRain GUI 对齐到商业级，作为给老板演示与对外的第一张脸。
- 相关上游/文档/现有实现：
  - 首页已先行对齐 → PR #43「首页向 Codex 像素级对齐」（commit `c751242`：真实上下文环 / 自绘文件夹图标 / 触发器胶囊 / 模型菜单）。本 spec 是 #43 的**系统化延伸**，把零散对齐升级成有 token 表、有逐界面清单的工程。
  - design-system 真源：[src/features/design-system](../../apps/desktop/src/features/design-system)、token 在 [src/styles/ds-tokens.css](../../apps/desktop/src/styles/ds-tokens.css) + `themes.*.css`（light/dark/dim/system）。
  - 守卫：`npm run lint:ds`（共享 chrome/弹层必须复用 DS 原语）、`npm run codemod:ds`。
  - 红线参考：CLAUDE.md「第三方 License 红线」、memory「Codex资源复刻合规边界」「BR UI零渲染动效硬规则」。

## 用户目标

- 作为谁：BlackRain 的使用者（非开发者）+ 第一观众（老板/潜在客户）。
- 想完成什么：打开 BlackRain，看到的是一个**观感等同 Codex 商业级**的客户端，而不是一个「明显是别人开源项目改的」壳。
- 成功后看到/得到什么：首页、对话页、设置、弹层、侧栏等核心界面在布局/间距/配色/字阶/交互上达到 Codex 级的精致与一致，且是 BlackRain 自己的品牌与 DS。

## 非目标

- 本阶段明确不做：工作台货架、安装/升级/卸载、工作室和专家市场 UI；不改 Agent 行为；不在本 spec 新增 app-server 协议接线。进入 CODE surface 后的搜索、导航历史、侧栏层级等前端功能属于本 spec；缺后端能力转交 001/006。
- 不改变的架构边界：不碰 `codex-upstream` 内核；不碰 `gateway`；后端 `src/shared/*`、`lib.rs`、`rpc.rs` 不因视觉对齐而改。
- **不照搬 OpenAI 专有资源**：见「约束 / License」——这是硬边界，不是本阶段才生效。

## 成功标准

- 功能行为:对齐后所有现有界面功能不回归,`npm run test` 以当次代码实际收集的测试集为准,不把历史用例数当固定基线。
- 用户体验：核心界面与 Codex 范本并排对比，布局结构/间距节奏/色彩层级/字阶/圆角/交互态「一眼像同级产品」；遵守「无渲染动效」硬规则（组件平面固定，hover 只许变色，禁位移/抖动/入场滑入；chevron 旋转/spinner/pulse 例外）。
- 安全/合规：**零** OpenAI 专有字节进仓库（图标 path / 字体文件 / 私有 bundle 代码）；新增或替换的每个图标资源记录来源（自绘 or 开源库如 lucide）。
- 性能/稳定性：`npm run typecheck` 0 报错；`npm run lint` 0 报错；`npm run lint:ds` 0 报错。

## 约束

- Codex 内核边界：本 spec 不触碰内核与协议，纯前端。
- `CODEX_HOME` / 配置边界：不涉及（#43 那行 `model_context_window` 已落，本 spec 不再动配置）。
- License / 第三方依赖：
  - **可以**：观察 Codex app 渲染出的界面，量出设计语言（色值、字号、间距、圆角、阴影、动效时长、布局结构、交互态），在 BlackRain 自己的 DS 里重实现；自绘仿其字形风格的图标。
  - **绝不**：复制 OpenAI 的图标 SVG path 字节、字体文件、任何 private path 里的源码/bundle；不 fork、不照抄。
  - 先例：#43 末尾已因此把一个手绘仿 Codex 图标换成 `lucide folder-git-2`。本 spec 沿用「能自绘则自绘、拿不准用 permissive 开源库（lucide=ISC）」的纪律。
- 平台差异:MVP 只验收 Windows(以 Win11 实机为当前主验证环境);Mica、自绘标题栏、WebView2、缩放和系统字体都必须在 Windows 实测。macOS/iOS 只作 post-MVP/上游资产,不进当前验收矩阵。

## 开放问题

- [x] **参考像素来源**:由用户提供可合法观察的截图/录屏,agent 负责量化与独立重实现;不抓取或复制 OpenAI 专有资源。
- [x] **对齐范围与优先级**:按 `tasks.md` 阶段 2 执行;视觉/交互任务与 `codex-ui-copy-checklist.md` 的功能级清单统一排期。
- [x] **像素级 vs 神似**:已决定「骨架神似 + BlackRain 皮肤/内容」,不做逐字节或绝对像素复刻。
