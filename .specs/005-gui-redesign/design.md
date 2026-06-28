# Design — GUI 重做

## 总体方案

**不靠一张张截图临场抠细节，而是先把 Codex 的设计语言量化成一张「token + 组件规格表」，再照表逐界面在 BlackRain 自己的 DS 里重建。** 一次量清，后续照表改，且每条都可追溯。复刻的是设计语言（布局/间距/配色/字阶/交互），不是 OpenAI 的资源字节。

## 灵魂总纲：骨 / 皮 / 内容三层（一切对齐决策的总尺子）

GUI 拆三层，每层对 Codex 的态度不同——**「神似」和「保留 BR 风格」不矛盾：模仿的是结构形态，保留的是材质和内容**：

| 层 | 是什么 | 对 Codex 的态度 | 例子 |
|---|---|---|---|
| **骨架** | 布局、间距节奏、字阶、组件形态、信息架构、交互模式（弹层/嵌套飞出/两级选择器/可展开侧栏） | **尽力模仿（神似）** | composer 一体化；弹层=搜索+列表+右侧飞出子菜单；侧栏可展开项目露出会话；权限弹层结构 |
| **皮肤** | 毛玻璃、半透明、**全息噪点**质感 | **保留 BR 独有，不抄 Codex 纯色** | 所有面板/弹层/composer 用 BR 玻璃材质渲染，而非 Codex 的不透明 `#1e1e1e` |
| **内容** | 导航项、品牌、模型名、项目列表、权限文案 | **保留 BR 身份** | 「插件/模型广场/智能体市场」、DeepSeek V4、credit 倍率徽章 |

> **目标 = 神似，不是逐像素一致。** Codex 的「商业级」来自**结构的克制**（间距规整、层级清晰、不花哨），不是来自纯黑——克制可以用玻璃皮肤照样实现。故保留壁纸/玻璃/噪点是有意决策（见 decisions.md）。
>
> **皮肤硬约束**：玻璃半透明 + 噪点必须**克制**，文字对比必须拉够。皮肤服务于清晰，绝不盖过清晰——若某处玻璃/噪点导致文字发糊、边缘发脏，降透明度/加底色，清晰优先。

## 架构边界

- 属于 `apps/desktop` 的逻辑：**绝大部分**。改动集中在 `src/styles/ds-tokens.css` + `themes.*.css`（token 层）、`src/features/design-system/*`（共享原语）、各 feature 的 `components/*.tsx` 与 `src/styles/*.css`（界面层）。
- 属于 `gateway` 的逻辑：**有一处依赖**。两级模型菜单的「推理档」要真生效，网关须接收并透传 `reasoning_effort` 请求参数（现状仅响应侧翻译 `reasoning_content`，请求侧不读不转）。此为跨 spec 依赖，归 [spec 001](../001-providers-model-gateway/)，在本 spec 双向标注，见下「两级模型菜单」。
- 属于 `plugins` / `workbenches` 的内容：无。
- 明确不改 `codex-upstream` 的部分：全部内核与协议；后端 `src/shared/*`、`lib.rs`、`rpc.rs` 不因视觉对齐而改（除非对齐暴露了纯前端拿不到的状态，那种情况单独评审）。

## 弹层与交互形态（抄 Codex 的「骨」，填 BR 的「内容」）

四个核心弹层的**形态**照搬 Codex，**内容/皮肤**是 BR 的：

### 1. 项目选择器（图1）
- 形态：`搜索框 + 带图标的项目列表 + 分隔线 + "新建项目"行(带 > 飞出) → 右侧二级飞出(新建空白项目 / 使用现有文件夹)`。
- BR 内容：项目是 BR 真实工作区；触发器汉化「进入项目工作」；「新建项目」**汉化**（Codex 此处 "New project" 未汉化，BR 更完整）。

### 2. 两级模型菜单（图2）★含网关依赖
- 形态：**两级**——上半「推理」档位区（当前项打勾）；下面模型族行带 `>` 飞出二级「模型」列表。
- **档位轴 = 各模型官方真实档位，不照搬 Codex 的「超高」**：
  - DeepSeek 官方 `reasoning_effort` = **低/中/高（3 档）**（已核：[DeepSeek thinking_mode](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode)）。
  - **某模型若无推理档 → 整个二级「推理」栏不显示**（不留「暂时不可用」死格子）。档位栏的有无与档数，由该模型能力动态决定。
- BR 内容：模型是 BR 自己的（DeepSeek V4 Flash/Pro、GLM、Qwen、Kimi…）；保留 credit 倍率徽章（0.5x/1.5x，Codex 无，BR 商业身份）。
- **网关依赖（归 spec 001）**：① 网关请求侧接收 `reasoning_effort` 并透传给 provider；② 一张「模型→支持档位」能力表，供前端决定档位栏显隐与档数。**只做前端不做网关 = 假菜单（点了不生效）。**

### 3. 侧栏项目展开（图3）★最重，非纯 CSS
- 形态：`选中项目(可折叠 chevron + hover 出 …菜单/编辑图标) → 内联露出最近会话(标题截断 + 相对时间 "4小时"/"6天") → "展开显示" → 兄弟项目折叠态 → "对话"分区`。
- 风险：要接**真实会话数据 + 相对时间格式化 + hover 态 + 截断**，是有状态的功能，scope 远大于改样式。**排期靠后，单列任务**。
- BR 现状：侧栏仅占位「添加工作区以开始」，距此形态差距大。

### 4. 权限弹层（图4）→ 砍到 3 档
- 形态：`pill 触发器(图标+chevron，按档变色) → 弹层头"应如何批准操作?" + 了解更多 → 每行 图标+标题+描述，当前项打勾`。
- **3 档（砍掉第 4 个「自定义 config.toml」——开发者逃生口，与"面向非开发者"冲突；砍的是 UI 选项不是能力，底层 CODEX_HOME/config.toml 照旧）**：
  - 请求批准（手图标）— 编辑外部文件/上网时始终问
  - 替我审批（终端图标）— 仅对检测到的风险操作请求批准
  - 完全访问（警告图标）— 不受限
- **pill 按档变色**：完全访问 = 橙色警示（抄 Codex 的安全语义，BR 现为中性灰白，缺这个信号）。文案去「Codex」改 BR 措辞。

## 数据流

本 spec 不改数据流，只改渲染层。对齐动作的「数据流」是工程流程：

```text
Codex 范本(你提供的截图/录屏)
  -> 量化:色值/字号/间距/圆角/阴影/动效时长/布局结构/交互态
  -> 写入 token 表(design.md 附表)
  -> 落地 ds-tokens.css + themes.*.css(基础 token)
  -> 落地 design-system 原语(button/modal/popover/toast/panel...)
  -> 逐界面套用(Home/Composer/Settings/...)
  -> 对比验证(并排截图 + lint:ds + typecheck + test)
```

## 接口与配置

- Tauri command / JSON-RPC：不涉及。
- `config.toml` / `CODEX_HOME`：不涉及。
- 环境变量：不涉及。
- 文件布局（改动面）：
  - token 真源：`src/styles/ds-tokens.css`、`src/styles/themes.{light,dark,dim,system}.css`
  - 共享原语：`src/features/design-system/**`
  - 界面层：`src/features/{home,composer,layout,settings,...}/components/**` + 对应 `src/styles/*.css`
  - 图标：自绘 SVG 组件（如已有 `FolderIcons.tsx`）或 lucide。每个新增图标在 decisions.md 记来源。

## 失败模式

- 上游协议失败：不适用（不碰协议）。
- 模型/网关失败：不适用。
- 配置损坏：不适用。
- 权限/沙箱失败：不适用。
- 用户可见降级：视觉对齐**不得**牺牲功能——若某对齐改动导致交互回归（如弹层失焦、键盘导航断、主题切换错乱），回退该改动，对齐让位于可用。
- 合规失败（本 spec 特有）：若误引入疑似 OpenAI 专有资源字节，立即移除并在 decisions.md 记录，按 #43 先例改自绘或开源库。

## 测试策略

- 单元测试：`npm run test`（基线 1061 通过）；改组件后跑相关 `*.test.tsx`，不得回归。
- 集成测试：不涉及后端集成。
- 协议探针：不涉及。
- DS 守卫：`npm run lint:ds`（每次碰共享 chrome/弹层后必跑）。
- 人工验证：每个对齐界面，BlackRain 截图与 Codex 范本**并排对比**；记录 diff 点直至收敛。verification.md 存对比结论与 token 表。
