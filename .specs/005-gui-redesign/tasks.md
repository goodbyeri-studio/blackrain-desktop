# Tasks — GUI 重做

> 本 spec 不是「纯 CSS」项目:视觉/token 与搜索、导航、侧栏层级等前端交互都在范围内;新增内核/Gateway 能力分别归 spec 006/001。任务勾选只表示真实完成,不能因 RPC 包装已存在就勾 GUI。MVP 只验收 Windows。

## 阶段 0：确认边界

- [x] 阅读相关 `README.md` / `docs/` / `AGENTS.md`：依据 CLAUDE.md「壳内部架构」+ `apps/desktop/AGENTS.md`（DS 复用纪律）。
- [x] 确认是否涉及 `apps/desktop/AGENTS.md`：**涉及**。共享 chrome 必须复用 DS 原语 + token，禁在 feature CSS 重造 modal/toast/panel/popover，由 `lint:ds` 守。
- [x] 确认是否触碰 `codex-upstream`：**不触碰**。纯前端。
- [x] 列出需要验证的真实命令:`typecheck` / `test` / `lint` / `lint:ds`;实际执行结果只写 `verification.md`。
- [x] **3 个开放问题已拍板**（2026-06-26）：① 参考像素来源=莓莓供图，agent 量化；② 目标=**神似**（骨/皮/内容三层），保留 BR 玻璃噪点皮肤；③ 范围顺序见阶段 2。另定：权限砍到 3 档、模型菜单两级随能力显隐、玻璃皮肤清晰优先。

## 阶段 1：最小可用（量化 + 基础 token 对齐）

- [ ] 收集 Codex 范本：莓莓提供首页/对话/设置等核心界面截图或录屏。
- [ ] 量化成 token 表：色值（含 light/dark）、字号字重行高、间距刻度、圆角、阴影、边框、动效时长，落 design.md 附表。
- [ ] 对齐基础 token：把量出的值落 `ds-tokens.css` + `themes.*.css`，先不碰组件，只换 token，观察全局连锁效果。
- [ ] 跑 `typecheck` + `test` + `lint:ds`，确认换 token 未致回归。

## 阶段 2：产品化（逐界面对齐，建议顺序）

> 功能级照抄清单（P0/P1/P2 分级 + 照抄决策矩阵 + 依赖的内核接口）见 [codex-ui-copy-checklist.md](codex-ui-copy-checklist.md)（2026-07-06 自 `docs/` 迁入）；本节是视觉/形态级任务，两者互补。

### 2a. 首页视觉 + 结构对齐(含非 CSS 交互)
- [ ] 标题字号 ~40→~30px、色 `#fff`→略灰白；标题↔composer 间距收窄。
- [ ] composer：两段分离 → **一体化**（输入+控件+项目入口同框，圆角 ~16→~12px）。⚠️ 改结构非纯 CSS，碰 [composer](../../apps/desktop/src/features/composer)。
- [ ] 发送按钮 ↑：弱化细箭头 → **实心圆背景**（Codex 形态），玻璃皮肤渲染。
- [ ] 顶栏补 后退/前进箭头 + 右上窗口/面板切换控件（对齐 Codex chrome）。
- [ ] 侧栏静态项：行高 ~37→~29px、左 padding ~24→~16px、标签字号 ~15→~13.5px、列表项补 ~14px 图标。

### 2b. 四个弹层形态（骨架抄 Codex，内容/皮肤是 BR）
- [ ] **项目选择器**：搜索框+图标列表+分隔线+「新建项目」行(带 > 飞出二级：新建空白/用现有文件夹)。「新建项目」汉化。
- [ ] **两级模型菜单**：推理档区(随模型能力显隐，DeepSeek=低/中/高)×模型族飞出二级。保留 credit 倍率徽章。⚠️ **依赖网关(见 2d)，否则假菜单**。
- [ ] **权限弹层**：3 档(请求批准/替我审批/完全访问)，砍「自定义 config.toml」。pill 按档变色(完全访问=橙)。文案去 Codex 措辞。
- [ ] 弹层一律复用 DS popover 原语 + BR 玻璃皮肤，禁在 feature 重造（`lint:ds` 守）。

### 2c. 设置 / 全局弹层 / 工具调用展示
- [ ] **设置 SettingsView**：分组、表单控件、开关、选择器对齐。⚠️ 高频热点，加倍小心。
- [ ] **全局 toast / popover**：复用 DS 原语对齐。
- [ ] **对话页**：消息气泡、meta bar、上下文环、工具调用展示。

### 2d. 侧栏项目展开（★最重，非纯 CSS，排最后）
- [ ] 可展开项目节点(chevron) + hover 出 …菜单/编辑图标。
- [ ] 内联露出最近会话：标题截断 + 相对时间("4小时"/"6天") + 「展开显示」。
- [ ] 接真实会话数据 + 相对时间格式化 + hover 态。⚠️ 有状态功能，碰 `useThreadsReducer.ts` 热点，风险高，单独评审。

### 2e. 网关侧（跨 spec 001，与 2b 模型菜单配对）
- [ ] 网关请求侧接收并透传 `reasoning_effort`（现状仅响应侧翻译 `reasoning_content`）。
- [ ] 建「模型→支持档位」能力表，供前端决定档位栏显隐/档数。
- [ ] 双向标注：本任务归 [spec 001](../001-providers-model-gateway/)，完成后回此打勾。

### 通用收尾（每界面）
- [ ] 自绘或 lucide 替换图标（记来源）→ 并排对比 Codex → 收敛 → 跑守卫。

## 阶段 3：收口

- [ ] 更新文档和 spec：token 表与对比结论入 verification.md；图标来源与关键取舍入 decisions.md。
- [ ] 跑完验证:`typecheck` / `test`(当前收集到的全量用例)/ `lint` / `lint:ds` 全绿。
- [ ] 记录未解决风险:Windows 实机视觉/交互差异、未对齐的次要界面、上游方法门控/stub。「骨架神似 + BR 皮肤」已决定,不再当开放问题。

## 已知坑（随实现补）

- 主题有 4 套（light/dark/dim/system），改 token 要四套都验，别只看 light。
- `App.tsx` / `SettingsView.tsx` / `useThreadsReducer.ts` 是高频热点，碰它们加倍小心（CLAUDE.md 标注）。
- 「无渲染动效」硬规则：对齐 Codex 时若发现其有入场动画，**不照搬动效**，只取静态视觉。
