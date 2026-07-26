# 贡献与协作流程

> 4 人小团队，采用 **GitHub Flow**：一条主线 `main` + 短命功能分支。
> 目标：简洁、标准、够用，不引入 Git Flow 那套 develop/release/hotfix 的重型仪式。

## 核心规则（记住这 5 条就够）

1. **`main` 永远可用**：随时能 build、能跑。绝不直接 push 到 `main`，一切走 PR。
2. **任何工作都从 `main` 切分支**：`git switch -c <type>/<短描述>`。
3. **尽早开 PR**：哪怕还没写完，开 Draft PR 让大家看得见在做什么。
4. **合并需 1 人 Review 通过 + CI 绿**：小团队 1 个 approve 足够，不搞多层审批。
5. **用 Squash 合并**：一个 PR 在 `main` 上压成一条干净提交，历史清爽。合并后删分支。

## 分支命名

```
<type>/<短横线描述>
```

| type | 用途 | 例 |
|---|---|---|
| `feat` | 新功能 | `feat/providers-panel` |
| `fix` | 修 bug | `fix/sse-event-ordering` |
| `docs` | 只改文档 | `docs/update-roadmap` |
| `refactor` | 重构（不改行为） | `refactor/gateway-split` |
| `chore` | 杂务（依赖、脚本、配置） | `chore/bump-tauri` |
| `test` | 加/改测试 | `test/protocol-probes` |

## 提交信息（Conventional Commits，轻量版）

```
<type>: <一句话，动词开头>

（可选）补充说明：为什么这么改、影响范围
```

例：`feat: 新增 DeepSeek provider 配置面板`。type 同上表。好处：信息一致、将来可自动生成 changelog。不强求每条都完美，但 type 前缀要有。

## 日常流程（一次完整循环）

```bash
git switch main && git pull              # 1. 同步最新 main
git switch -c feat/my-thing              # 2. 切功能分支
# ... 写代码 ...
git add -p && git commit -m "feat: ..."  # 3. 小步提交
git push -u origin feat/my-thing         # 4. 推分支
gh pr create                             # 5. 开 PR（或网页开）
# 6. 等 1 个 approve + CI 绿 → Squash 合并 → 删分支
```

## PR 约定

- **小而专一**：一个 PR 只做一件事。大改拆成多个 PR，好 Review。
- **标题用 Conventional 格式**：`feat: xxx`（Squash 合并后它就是 main 上的提交信息）。
- **填 PR 模板**：改了什么、怎么测的、有无风险。
- **自测过再请人看**：本地 build/跑过，别让 Review 帮你抓低级错误。
- **跨层大功能同步 living spec**：触发条件见 [.specs/README.md](.specs/README.md)。有对应 spec 的 PR，必须同步更新 `tasks.md` / `verification.md`；关键取舍写进 `decisions.md`。
- **Windows MVP 证据写清楚**：涉及 GUI、引擎、系统凭据、Office、NSIS 或安装流程时，PR 必须说明 Windows 实机验证结果；未跑就明确写“未验证”，不能用 macOS 结果或 CI 代替。
- **第三方来源先过 License**：新增依赖、复制代码或引入上游资产时，PR 必须列出来源、许可证和 NOTICE/署名处理。
- **工作台变更同步 008**：新增或改变工作台 Manifest、依赖、权限、安装、验证、升级或卸载语义时，必须同步 `.specs/008-expert-workbench-package/`；只有内容骨架时不得写成可安装工作台。
- **提交前做密钥检查**：确认 diff、日志、截图、fixture 和文档中没有真实 key、JWT、cookie、私有 URL 或未脱敏用户数据。

## 文档约定

- 文档入口和分层见 [docs/README.md](docs/README.md)。
- 日常启动、构建、发布与通用验证命令统一写在 [docs/commands.md](docs/commands.md)，其他文档只链接。模块 README/runbook 可保留不重复的局部诊断或协议探针示例，但必须写清工作目录和适用范围。
- 新文档默认不要放仓库根。优先放 `docs/`、`.specs/` 或对应模块目录。
- 改行为就同步改文档；只改文档也按正常 PR 走。

## 本项目特有约定

- **`apps/desktop/` 是 subtree（来自 CodexMonitor）**：日常改它就是普通 commit，无需特殊操作。但**同步上游**（`git subtree pull`）是维护者动作，别随手做，约定一人负责。详见 [docs/08](docs/08-仓库结构与上游策略.md)。
- **`codex-upstream/` 内核不入库**：本地克隆、黑盒子进程，已在 `.gitignore`。目标锁定版本见 [docs/REFERENCES.md](docs/REFERENCES.md)；`scripts/fetch-references.sh` 会校验 tag 与完整 SHA，构建和验收前仍须核对 `HEAD`。
- **MVP 仅发行 Windows**：macOS / iOS 只保留为 post-MVP 或上游资产。非 Windows 开发可以做静态检查和共享逻辑测试，但发布级结论必须来自 Windows 实机矩阵。
- **密钥绝不入库**：API key 等放本地 `.env`（已 gitignore，从 `.env.example` 复制填写）或本地环境变量，永不写进会提交的文件、也不在聊天/IM 里明文发送。
- **`.scratch/` 是个人草稿区**：实验脚本、临时产物放这里，不入库、不评审。
- **工作台不是作者电脑镜像**：不得提交作者凭据、Cookie、客户数据、商业软件副本或无权再分发的工具；用声明和用户提供依赖表达。

## 不做什么（避免过度工程）

- ❌ 不设 `develop`/`release`/`hotfix` 分支——GitHub Flow 不需要。
- ❌ 不搞多层审批、CODEOWNERS 强绑——4 人团队靠默契 + 1 approve。
- ❌ 不要长命分支——分支活得越久冲突越多，几天内合掉。

## 仓库配置凭据（已配，给将来配仓库的人留底）

仓库托管在 `goodbyeri-studio/blackrain-desktop`（GitHub Free + 私有库）。已落地的配置：

| 项 | 状态 | 说明 |
|---|---|---|
| 合并策略 | ✅ 已配 | 只允许 **Squash 合并**（禁 merge commit / rebase）+ **合并后自动删分支** |
| 分支保护（强制 PR / 禁直推 main） | ⚠️ 配不了 | GitHub Free 私有库不提供分支保护，**靠本文件的口头约束**。升级 Team/Pro 后可在 Settings → Branches 启用 |
| auto-merge | ⚠️ 配不了 | 同属 Free 私有库限制，approve + 合并需手动点 |

复现合并策略配置（需仓库 admin，`gh` 已登录即可）：

```bash
gh api --method PATCH repos/goodbyeri-studio/blackrain-desktop \
  -F allow_squash_merge=true -F allow_merge_commit=false \
  -F allow_rebase_merge=false -F delete_branch_on_merge=true
```

## 密钥与本地环境

- 复制模板填自己的 key：`cp .env.example .env`，编辑 `.env` 填入真实值。
- `.env` 已 gitignore，**绝不提交**；`.env.example` 只放空占位，可提交。
- **密钥暂不进 GitHub Secrets**：当前没有 CI 用它，提前放只会多一个暴露面。将来 CI 需要调模型（如集成测试）时再加。
- 密钥只存本地 `.env` 或本地环境变量，**永不在聊天 / IM / PR 里明文出现**；一旦明文泄露，立即去对应控制台吊销重发。

## 第三方代码 License 纪律（红线，全员遵守）

本产品按**闭源商业 B2B**纪律开发，引入第三方代码必须先看许可证。本仓库或部分组件最终采用何种对外许可证仍是待决事项；在定案前按更严格的闭源分发边界执行。一条分界线记牢：

> **MIT / Apache-2.0 → 可进 Desktop/Cloud 私有仓库、可借用代码（保留 NOTICE 署名）。
> AGPL / GPL / BSL / 无许可证 → 不得进入 Desktop/Cloud 私有仓库、不得与其闭源代码混合。唯一已批准例外是独立公开的 `meimei-api`：它可以基于 New API 按 AGPLv3 公开 fork、保留署名并履行网络源码提供义务。**

为什么：Desktop/Cloud 必须保持清晰的闭源来源边界；AGPL 代码若与其形成派生或组合会产生源码提供义务。MeiMei API 本身被明确选择为公开 AGPL 产品，因此该义务在 MeiMei API 内接受并履行；这不授权把其他 AGPL/GPL 项目随意带入私有仓。无许可证仍等于默认保留全部版权，不可使用。

### 能进 vs 不能进（实例）

| 来源 | License | 能否进仓库 |
|---|---|---|
| CodexMonitor（壳，已 subtree） | MIT | ✅ |
| cdesktop 的 `provider_catalog.json`（国产 provider 清单） | Apache | ✅（保留 NOTICE 署名） |
| open-codex 的中文 UI 文案 | Apache | ✅ |
| **codexia 的代码** | **AGPL** | ❌ **永不进仓库，只作参考标杆** |
| opcode / siteboon 等 | AGPL | ❌ 同上 |
| New API | AGPLv3 + Section 7 | ✅ 仅限独立公开的 `meimei-api`；Desktop/Cloud 禁止复制源码 |

### 参考类（AGPL/GPL）项目放哪

放在**仓库之外、产品目录之外**，与闭源代码物理隔离，保证取证清白：

- 统一放 `~/Projects/refs/`（第三方参考仓专区，**不在 `goodbyeri-studio/` 产品目录内**）。
- 例：`cd ~/Projects/refs && git clone --depth 1 https://github.com/milisp/codexia.git`
- 读它、学它的架构、照着自己重写都合法；**绝不 copy-paste 其源码进我们的源文件**。
- 看一眼就够的，直接用 GitHub 网页或 `gh` 临时拉单文件，不必本地 clone。

> 一句话纪律：**私有产品继续隔离 AGPL；MeiMei API 只接纳经过明确批准、可完整履责的公开 AGPL 代码。许可证没看清，代码不落地。**
