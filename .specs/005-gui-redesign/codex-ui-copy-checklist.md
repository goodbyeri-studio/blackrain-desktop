# Codex UI 照抄清单

> **本文是 [spec 005 GUI 重做](design.md) 的附加文档**（功能级照抄清单 + 决策矩阵），2026-07-06 自 `docs/` 迁入——任务级计划文档一律住对应 spec 目录，不进 `docs/`。与 [tasks.md](tasks.md)（视觉/形态级任务）互补。
> 基于 BlackRain 产品形态（docs/04）+ codex 内核能力底账（.specs/003）+ 当前截图对比，分析 CODE 模式的前端该照抄哪些。
> 
> **核心原则：** 用户从“软件开发工作台”进入 CODE surface 后，界面尽量对齐 codex-app，只做汉化、国产模型和品牌切割。工作台货架与生命周期属于外层 Core/008，不在 CODE surface 内重造；工作室也不属于本 spec。
> **状态图例(2026-07-12)**:本文中「照抄/纳入」表示产品决策,不表示代码已完成。壳层已有 42 个 app-server 方法包装的历史验证,但 GUI 落点仍按 `tasks.md` / `verification.md` 判定;当前锁定 rust-v0.144.1 / `44918ea` 仍须重跑能力探针。MVP 只验收 Windows。

---

## 分析依据

### BlackRain 产品定位（唯一真源：docs/04）

```
软件开发工作台进入后的 CODE surface（图2 Codex 截图对应）：
- 给谁：会写代码的开发者
- 体验：照抄 codex-app 原貌
- 用词：codex 原生（skill/plugin/AGENTS.md）
- 不做：工作台货架、安装生命周期和工作室编排（由外层 Core/其他 spec 负责）
```

### codex 内核支持现状（.specs/003）

- ✅ **已复刻 ~90%** codex-app 本地半边（对话/diff/approval/plan/文件/终端/沙箱/worktree）
- ✅ **壳层包装历史记录**:spec 006 记录 42 个 app-server 方法已走完 5 层接线,cargo check/typecheck/shape 探针基线为 `cfead68`。
- ⚠️ **仍待完成**:Skills/MCP 管理、搜索、导航历史等 GUI;上游 stub/OpenAI 认证/`experimentalApi` 门控需在 UI 降级;当前锁定 `44918ea` 需重验。

---

## ✅ 可以照抄（内核支持 + 符合产品定位）

### 🔴 P0 - 必须照抄（影响核心体验）

#### 1. **搜索功能**（侧栏第二项）

**Codex 有什么：**
```
侧栏第二项：🔍 搜索
功能：全局搜索对话历史（thread/search）
```

**内核支持：** ✅ `thread/search` 协议方法已有（见 codex-capability-ledger.md）

**照抄建议：**
```typescript
// apps/desktop/src/features/sidebar/components/SidebarNav.tsx
<SidebarSection>
  <SidebarItem icon="search" label="搜索" onClick={handleOpenSearch} />
</SidebarSection>
```

**交互：** 点击弹出搜索弹层 → 输入关键词 → 列出匹配的 thread → 点击跳转

---

#### 2. **前进/后退导航**（窗口控制区）

**Codex 有什么：**
```
Codex 参考图的窗口控制区：◀️ ▶️ 按钮
功能：对话历史前进/后退（类似浏览器）
```

**内核支持：** ✅ 不依赖内核协议（纯前端状态管理）

**照抄建议：**
```typescript
// apps/desktop/src/features/layout/components/WindowControls.tsx
<NavigationControls>
  <IconButton 
    icon="arrow-left" 
    onClick={goBack} 
    disabled={!canGoBack} 
  />
  <IconButton 
    icon="arrow-right" 
    onClick={goForward} 
    disabled={!canGoForward} 
  />
</NavigationControls>
```

**实现：** 用 `useThreadHistory` hook 管理访问历史栈

---

#### 3. **三级侧栏结构**（直顶/项目/对话）

**Codex 有什么：**
```
侧栏分三个区：
1. 直顶 - 置顶的项目（可拖拽排序）
2. 项目 - 普通项目列表
3. 对话 〉 - 可折叠的全部对话区（默认折叠）
```

**内核支持：** ✅ `thread/list` + 前端状态管理（项目固定 = workspace anchored threads）

**照抄建议：**
```typescript
// apps/desktop/src/features/sidebar/components/Sidebar.tsx
<Sidebar>
  {/* 直顶区 */}
  <SidebarSection title="直顶" collapsible={false}>
    {pinnedProjects.map(project => (
      <ProjectItem key={project.id} {...project} pinned />
    ))}
  </SidebarSection>

  {/* 项目区 */}
  <SidebarSection title="项目" collapsible={false}>
    {projects.map(project => (
      <ProjectItem key={project.id} {...project} />
    ))}
  </SidebarSection>

  {/* 对话区 */}
  <SidebarSection title="对话" collapsible defaultCollapsed>
    {threads.map(thread => (
      <ThreadItem key={thread.id} {...thread} />
    ))}
  </SidebarSection>
</Sidebar>
```

**交互：**
- 项目右键菜单有「固定到直顶」选项
- 直顶区可拖拽排序
- 对话区默认折叠（点击 `〉` 展开）

---

#### 4. **模型选择器简化**（只显示档位）

**Codex 有什么：**
```
Composer 右侧：「5.5 超高 ∨ ↑」
- 5.5 = 模型档位（对应 o1）
- 超高 = reasoning_effort（推理强度）
- 不显示完整模型名（节省空间）
```

**内核支持：** ⚠️ 需网关支持（spec 001 + spec 005 已标注）
- 前端改简单（只改显示）
- 网关需透传 `reasoning_effort` 参数（当前只响应侧翻译 `reasoning_content`）

**照抄建议：**
```typescript
// apps/desktop/src/features/composer/components/ModelSelector.tsx
<ModelSelector>
  <Badge>{modelTier}</Badge>  {/* 5.5 */}
  <span>{reasoningEffort}</span>  {/* 超高 */}
  <ChevronDown />
  <IconButton icon="arrow-up" />  {/* 发送按钮 */}
</ModelSelector>
```

**两级菜单：**
```
弹层上半：推理强度（低/中/高，打勾显示当前）
弹层下半：模型族（DeepSeek V4 〉 二级飞出 Flash/Pro）
```

**依赖：** 需同步改 gateway 接收 `reasoning_effort`（归 spec 001）

---

#### 5. **权限状态显示**（当前权限 pill）

**Codex 有什么：**
```
Composer 左侧：🔔 完全访问 ∨
- 直接显示当前权限状态
- 颜色区分：完全访问 = 橙色警示，按需确认 = 中性
```

**内核支持：** ✅ 前端已有 `approvalPolicy` 状态

**照抄建议：**
```typescript
// apps/desktop/src/features/composer/components/PermissionBadge.tsx
<PermissionPill 
  status={currentApprovalPolicy}  // "on-request" | "never" | "untrusted"
  variant={currentApprovalPolicy === "never" ? "danger" : "default"}
  onClick={openPermissionMenu}
>
  {getPermissionIcon(currentApprovalPolicy)}
  {getPermissionLabel(currentApprovalPolicy)}
  <ChevronDown />
</PermissionPill>

// 映射
const labels = {
  "on-request": "按需确认",      // 手图标
  "untrusted": "替我审批",       // 终端图标
  "never": "完全访问"            // 警告图标，橙色
}
```

---

### 🟡 P1 - 应该照抄（改善体验）

#### 6. **账号入口并排**（底部更显眼）

**Codex 有什么：**
```
底部：⚙️ 设置 | 👤 帐户
- 两个按钮并排
- 账号入口更显眼（credit/套餐管理）
```

**内核支持：** ✅ 前端已有 accounts 系统（spec 002）

**照抄建议：**
```typescript
// apps/desktop/src/features/sidebar/components/SidebarFooter.tsx
<SidebarFooter>
  <FooterButton icon="settings" label="设置" onClick={openSettings} />
  <Divider orientation="vertical" />
  <FooterButton icon="user" label="帐户" onClick={openAccount} />
</SidebarFooter>
```

---

#### 7. **侧栏更紧凑**（220px 宽度）

**Codex 有什么：**
```
侧栏宽度：~220px（当前 BlackRain 是 280px）
项目间距：更小（4px vs 8px）
字体：略小（13px vs 14px）
```

**内核支持：** ✅ 纯前端 CSS

**照抄建议：**
```css
/* apps/desktop/src/styles/base.css */
:root {
  --sidebar-width: 220px;          /* 从 280px 改为 220px */
  --sidebar-item-gap: 4px;         /* 从 8px 改为 4px */
  --sidebar-font-size: 13px;       /* 从 14px 改为 13px */
}
```

---

#### 8. **背景克制化**（降低饱和度）

**Codex 有什么：**
```
背景：纯黑 / 深灰（#1a1a1a）
视觉重心：内容优先，背景不抢眼
```

**BlackRain 当前问题：**
```
背景：彩色渐变（蓝紫粉混合）
风险：文字对比度、注意力分散、不符合「复刻 codex」目标
```

**照抄建议：**
```css
/* apps/desktop/src/styles/base.css */

/* 方案 1：完全照抄 Codex（纯黑） */
.app::before {
  background: #0a0e14;  /* 纯色深灰，不要渐变 */
}

/* 方案 2：保留 BR 特色但克制化 */
.app.is-windows:not(.reduced-transparency)::before {
  background:
    radial-gradient(
      circle at 18% 12%, 
      rgba(116, 145, 170, 0.06),  /* 从 0.18 降到 0.06 */
      transparent 30%
    ),
    radial-gradient(
      circle at 82% 26%, 
      rgba(180, 190, 205, 0.04),  /* 从 0.12 降到 0.04 */
      transparent 32%
    ),
    #0a0e14;  /* 加深色底
}

/* 噪点层不变（已经很克制） */
.app.is-windows:not(.reduced-transparency)::after {
  opacity: 0.24;  /* 从 0.34 降到 0.24 */
}
```

**已决策:**保留 BlackRain 玻璃/噪点皮肤,但降饱和度、清晰优先。参考 spec 005 的硬约束:
> 皮肤硬约束：文字对比必须拉够。若某处玻璃/噪点导致文字发糊、边缘发脏，降透明度/加底色，清晰优先。

---

### 🟢 P2 - 可选照抄（锦上添花）

#### 9. **侧栏项目展开**（hover 显示会话）

**Codex 有什么：**
```
选中项目展开：
- 显示该项目最近会话（标题截断 + 相对时间 "4小时前"）
- hover 出 … 菜单 / 编辑图标
- 「展开显示」链接查看全部
```

**内核支持：** ✅ `thread/list` 可按 workspace 过滤

**照抄建议：** ⏳ **排期靠后** - spec 005 已标注「最重，非纯 CSS」
- 需接真实会话数据
- 相对时间格式化（timeago.js）
- hover 态管理
- 单列任务

---

#### 10. **全屏/分屏按钮**（右上角窗口控制）

**Codex 有什么：**
```
右上角：□ ▭ 按钮（全屏/分屏切换）
```

**内核支持：** ✅ Tauri window API

**照抄建议：** ⏳ **P2 可选** - 不影响核心体验

---

#### 11. **实验特性开关**（设置面板）

**Codex 有什么：**
```
设置 → 实验特性：
- 可开关各种 experimental feature
```

**壳层支持:** ✅ `experimentalFeature/list` 与 `experimentalFeature/enablement/set` 已在 spec 006 的 42 方法历史基线中接线。

**照抄建议:**前端尚需落管理 UI,并在当前锁定 `44918ea` 重验;RPC 包装存在不等于功能已完成。

---

## ❌ 不能照抄（内核不支持 / 产品边界外）

### 1. **已安排/待办**（如需要需自建）

**Codex 实现：** 绑定 ChatGPT 账号体系的云端提醒

**内核支持：** ❌ 开源 codex-rs 无此功能

**替代方案：** 
- 可选：前端自建 + 本地存储 + CronCreate 集成
- 或：完全不做（CODE 模式开发者可能不需要）

---

### 2. **云同步 / 跨设备**

**Codex 实现：** cloud threads（绑 OpenAI 账号）

**内核支持：** ❌ 本地 codex-rs 无云同步

**产品定位：** v1 不做云（docs/04），本地优先

---

### 3. **GitHub @codex 自动 PR 审查**

**Codex 实现：** OpenAI 云服务 + GitHub App

**内核支持：** ❌ 本地内核不支持

**产品定位：** 后期功能，v1 不做

---

### 4. **远程环境 / cloud 沙箱**

**Codex 实现：** chatgpt.com/codex 云沙箱

**内核支持：** ❌ 本地内核不支持

**产品定位：** v1 不做云

---

### 5. **Computer-use / 浏览器控制**

**Codex 实现：** 闭源 bundled 插件

**内核支持：** ❌ 开源 codex-rs 无此功能

**替代方案：** WORK 侧靠 Hermes（已有），CODE 侧暂无

---

### 6. **工作台货架 / 生命周期 / 工作室**（外层 Core）

**Codex 有没有：** ❌ codex-app 没有这个概念

**BlackRain 产品定位：** 用户从工作台进入产品；工作台货架、安装/升级/卸载和工作室编排属于外层 Core 与 spec 008。

**CODE surface：** 用户进入“软件开发工作台”后，内部不重复实现工作台 chrome，继续对齐 codex 原生体验（skill/plugin/AGENTS.md）。

---

## 📋 实施优先级汇总

### 第一批(P0,已决定纳入;非完成标记)

```
1. 搜索功能(侧栏第二项)
   - 前端：搜索弹层 + UI
   - 后端：thread/search RPC 调用

2. 前进/后退导航(窗口控制)
   - 前端：历史栈管理 + 按钮

3. 三级侧栏结构(直顶/项目/对话)
   - 前端：分区组件 + 拖拽排序

4. 模型选择器简化(只显示档位,需 spec 001 配套)
   - 前端：改显示逻辑
   - 网关：透传 reasoning_effort（归 spec 001）

5. 权限状态显示(pill 变色)
   - 前端：改 PermissionBadge 组件
```

### 第二批(P1,已决定纳入;非完成标记)

```
6. 账号入口并排
   - 前端：底部布局调整

7. 侧栏更紧凑(220px)
   - CSS：调 token 值

8. 背景克制化(已决定保留 BR 玻璃皮肤,清晰优先)
   - CSS：降低渐变饱和度
   - 决策已收口:保留特色但克制
```

### 第三批（P2，可选）

```
9. ⏳ 侧栏项目展开（hover 显示会话）
   - 工程量大，排期靠后

10. ⏳ 全屏/分屏按钮
    - 不影响核心体验

11. ⏳ 已安排/待办
    - 看产品是否需要
```

---

## 🔍 已接线能力的门控与 GUI 缺口(关联 spec 006)

- spec 006 已记录 42 个方法在 `cfead68` 基线走完 5 层包装与 shape 探针;不再把上述方法列为「待补接口」。
- 当前真缺口是:GUI 调用与交互、Windows 实机验证、以及当前锁定 `44918ea` 重跑探针。
- 已知门控:`thread/items/list` 在旧基线为上游 stub;部分远程 plugin 操作需 OpenAI 认证;实验方法需 `experimentalApi`;Windows sandbox 只有接线记录,尚未 Windows 实跑。

---

## 🎯 照抄决策矩阵

| UI 元素 | Codex 有 | 内核支持 | 产品需要 | 决策 |
|---|---|---|---|---|
| 搜索功能 | ✅ | ✅ | ✅ | ✅ **照抄** |
| 前进/后退 | ✅ | ✅ | ✅ | ✅ **照抄** |
| 三级侧栏 | ✅ | ✅ | ✅ | ✅ **照抄** |
| 模型简化 | ✅ | ⚠️ 需网关 | ✅ | ⚠️ **照抄**（需同步改网关） |
| 权限 pill | ✅ | ✅ | ✅ | ✅ **照抄** |
| 账号入口 | ✅ | ✅ | ✅ | ✅ **照抄** |
| 紧凑侧栏 | ✅ | ✅ | ✅ | ✅ **照抄** |
| 克制背景 | ✅ | ✅ | ✅ 保留 BR 品牌 | ✅ **保留克制玻璃/噪点,清晰优先** |
| 项目展开 | ✅ | ✅ | ✅ | ⏳ **靠后** |
| 已安排 | ✅ | ❌ | ⚠️ | ⏳ **可选** |
| 全屏按钮 | ✅ | ✅ | ⚠️ | ⏳ **可选** |
| 工作台货架/安装 | ❌ | N/A | ✅，但不属本 spec | ↗ **交给 Core / 008** |
| 云同步 | ✅ | ❌ | ❌ | ❌ **不做**（v1 边界外） |

---

## 📖 参考文档

- 产品形态唯一真源：`docs/04-产品形态.md`
- CODE 模式边界：`.specs/003-dual-engine-architecture/code-mode-boundary.md`
- codex 能力底账：`.specs/003-dual-engine-architecture/codex-capability-ledger.md`
- GUI 重做 spec：`.specs/005-gui-redesign/`
- 能力接线 spec：`.specs/006-code-mode-capability-wiring/`

---

## ✅ 下一步行动

1. **先重验能力基线**:在当前锁定 `44918ea` 重跑 spec 006 探针,标出 stub/认证/平台门控。
2. **P0 前端实现**:搜索、导航、三级侧栏、权限 pill、账号入口;完成状态回填 `tasks.md`。
3. **网关配套**:`reasoning_effort` 透传归 spec 001,未通前不得把模型档位菜单标为完成。
4. **Windows 实机验收**:视觉并排对比 + 真实交互 + `typecheck/test/lint/lint:ds`;不以历史工期估算代替任务状态。
