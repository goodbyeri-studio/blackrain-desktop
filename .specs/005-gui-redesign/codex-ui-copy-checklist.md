# Codex UI 照抄清单

> **本文是 [spec 005 GUI 重做](design.md) 的附加文档**（功能级照抄清单 + 决策矩阵），2026-07-06 自 `docs/` 迁入——任务级计划文档一律住对应 spec 目录，不进 `docs/`。与 [tasks.md](tasks.md)（视觉/形态级任务）互补。
> 基于 BlackRain 产品形态（docs/04）+ codex 内核能力底账（.specs/003）+ 当前截图对比，分析 CODE 模式的前端该照抄哪些。
> 
> **核心原则：** CODE 模式 = 照抄 codex-app（docs/04 §六），只做汉化+国产模型+品牌切割。**不需要 WORK 侧专属的工作台/工作室概念。**

---

## 分析依据

### BlackRain 产品定位（唯一真源：docs/04）

```
CODE 入口（图2 Codex 截图对应的模式）：
- 给谁：会写代码的开发者
- 体验：照抄 codex-app 原貌
- 用词：codex 原生（skill/plugin/AGENTS.md）
- 不做：工作台、工作室（WORK 专属）
```

### codex 内核支持现状（.specs/003）

- ✅ **已复刻 ~90%** codex-app 本地半边（对话/diff/approval/plan/文件/终端/沙箱/worktree）
- ✅ **协议齐全** 23 个 app-server RPC 方法已接入
- ⚠️ **待补缺口** Skills/MCP 管理 UI、搜索、导航历史、Windows 沙箱 setup

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
红绿灯右侧：◀️ ▶️ 按钮
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

#### 6. **已安排 / 待办功能**（可选）

**Codex 有什么：**
```
侧栏第三项：📋 已安排
功能：定时提醒、待办事项
```

**内核支持：** ⚠️ 内核无原生支持（需前端自建 + 可选 CronCreate 集成）

**照抄建议：** ⏳ **P1 可选** - 看产品是否需要待办提醒功能
- 如果要做：前端自建数据结构 + 本地存储
- 不强依赖内核，可后补

---

### 🟡 P1 - 应该照抄（改善体验）

#### 7. **账号入口并排**（底部更显眼）

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

#### 8. **侧栏更紧凑**（220px 宽度）

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

#### 9. **背景克制化**（降低饱和度）

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

**决策点：** 参考 spec 005 的硬约束：
> 皮肤硬约束：文字对比必须拉够。若某处玻璃/噪点导致文字发糊、边缘发脏，降透明度/加底色，清晰优先。

---

### 🟢 P2 - 可选照抄（锦上添花）

#### 10. **侧栏项目展开**（hover 显示会话）

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

#### 11. **全屏/分屏按钮**（右上角窗口控制）

**Codex 有什么：**
```
右上角：□ ▭ 按钮（全屏/分屏切换）
```

**内核支持：** ✅ Tauri window API

**照抄建议：** ⏳ **P2 可选** - 不影响核心体验

---

#### 12. **实验特性开关**（设置面板）

**Codex 有什么：**
```
设置 → 实验特性：
- 可开关各种 experimental feature
```

**内核支持：** ⚠️ 协议有 `experimentalFeature/list`，但缺 `set` 方法
- 见 code-mode-boundary.md B 类缺口

**照抄建议：** ⏳ **待补内核接口** - 需先接入 `experimentalFeature/enablement/set` RPC

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

### 6. **工作台 / 工作室**（WORK 专属）

**Codex 有没有：** ❌ codex-app 没有这个概念

**BlackRain 产品定位：** 工作台/工作室是 **WORK 侧专属**（docs/04 §二）

**CODE 模式：** 不需要工作台，照抄 codex 原生体验（skill/plugin/AGENTS.md）

---

## 📋 实施优先级汇总

### 第一批（P0，必须做）

```
1. ✅ 搜索功能（侧栏第二项）
   - 前端：搜索弹层 + UI
   - 后端：thread/search RPC 调用

2. ✅ 前进/后退导航（窗口控制）
   - 前端：历史栈管理 + 按钮

3. ✅ 三级侧栏结构（直顶/项目/对话）
   - 前端：分区组件 + 拖拽排序

4. ⚠️ 模型选择器简化（只显示档位）
   - 前端：改显示逻辑
   - 网关：透传 reasoning_effort（归 spec 001）

5. ✅ 权限状态显示（pill 变色）
   - 前端：改 PermissionBadge 组件
```

### 第二批（P1，应该做）

```
6. ✅ 账号入口并排
   - 前端：底部布局调整

7. ✅ 侧栏更紧凑（220px）
   - CSS：调 token 值

8. ⚠️ 背景克制化
   - CSS：降低渐变饱和度
   - 决策：完全照抄黑色 vs 保留特色但克制
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

## 🔍 需要补的内核接口（归 spec 006）

根据 code-mode-boundary.md 的缺口分析，这些 RPC 方法需要补：

```
1. thread/search                        - 搜索对话历史
2. skills/config/write                  - Skills 管理 UI
3. skills/extraRoots/set                - Skills 路径管理
4. plugin/list                          - 插件列表
5. plugin/install/uninstall             - 插件安装
6. experimentalFeature/enablement/set   - 实验特性开关
7. windowsSandbox/setupStart            - Windows 沙箱 setup
8. windowsSandbox/readiness             - Windows 沙箱就绪检查
```

这些归 `.specs/006-code-mode-capability-wiring/` 统一跟进。

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
| 克制背景 | ✅ | ✅ | ⚠️ 品牌 | ⚠️ **协商**（黑色 vs 克制渐变） |
| 项目展开 | ✅ | ✅ | ✅ | ⏳ **靠后** |
| 已安排 | ✅ | ❌ | ⚠️ | ⏳ **可选** |
| 全屏按钮 | ✅ | ✅ | ⚠️ | ⏳ **可选** |
| 工作台 | ❌ | N/A | ❌ | ❌ **不做**（WORK 专属） |
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

1. **确认背景决策** - 完全黑色 vs 克制渐变（涉及品牌视觉）
2. **P0 前端实现** - 搜索、导航、三级侧栏、权限 pill、账号入口（~3-5 天）
3. **网关同步改** - 透传 reasoning_effort（归 spec 001，~1 天）
4. **P1 视觉调整** - 紧凑侧栏、克制背景（~1 天）
5. **补内核接口** - thread/search、skills/plugin 管理（归 spec 006，~2-3 天）

**预计总工作量：** P0+P1 约 1-2 周（1 人全职）
