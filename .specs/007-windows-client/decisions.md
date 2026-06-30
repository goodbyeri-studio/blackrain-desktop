# Decisions

## 2026-06-30:MVP 仅发行 Windows 版,macOS 推迟到 post-MVP

- 决策:**v1 / MVP 只发行 Windows 客户端;macOS 客户端整体推迟到 post-MVP**(具体节点未定,或在 MVP 跑通后另起仓 / 独立维护通道)。本仓 `apps/desktop` 仍是单一代码库,但日常开发、CI、打包、发布、用户支持全部按 Windows-only 推进。
- 原因(2026-06-30 用户决策,工程视角复述):
  1. **国内用户大头在 Windows**——目标受众(网文写手、行政、跨境卖家、代账会计)主机几乎全是 Windows。
  2. **双平台同时维护 = 4 人团队的隐性税**——每次 PR 在两边都跑验证、CI 多一份、跨平台漂移要查、bug 在另一端静默回归。MVP 阶段把这条税砍掉,所有精力收敛到 Windows。
  3. **同代码库 ≠ 同时交付**——本仓现状是「跨平台代码 + Windows-only 交付」,macOS 相关代码(`isMacPlatform()` / `cfg(target_os = "macos")`)保留作历史资产,不引入新工作。
  4. **macOS 复活路径清晰**——若 post-MVP 决定做 macOS,要么开新仓单维护,要么在本仓重启 macOS CI/打包,代码本身随时可编(改动越大恢复越贵,所以也不主动砍 macOS 代码)。
- 替代方案:① 双平台同等首发(被推翻,见下);② 首发 Windows + macOS 跟随支持(被本决策推翻,见下);③ 立即砍掉 macOS 相关代码(不采取——保留历史资产成本极低,主动删除反而引入风险)。
- 影响范围:
  - **不再有「macOS 跟随支持」节奏**。所有 spec verification 矩阵只跑 Windows;macOS 行不再要求。
  - **dev-client.sh / doctor.sh / tauri:dev / tauri:build 等 macOS 入口保留但标 post-MVP 参考**,不再列入「常用命令」第一位。
  - **CI 即便建,只建 windows-latest**,不建 macos-latest。
  - **NSIS 是 v1 唯一交付形态**;DMG/app 打包链路暂不验证。
  - **README/AGENTS/CLAUDE 「平台」段全部从「首发 Windows + macOS 跟随」改为「MVP 仅 Windows」**。
  - **`.specs/003` 关于「Windows 全栈」的开放问题结论化**:全栈 = Windows,macOS 转 post-MVP。
- 后续复查条件:① MVP 跑通后产品决策要不要再做 macOS;② 出现真实 macOS 用户付费/反馈达到一定规模时;③ 若决定做,优先评估「另起仓库」vs「本仓恢复 macOS CI」哪个工程负担更小。

## 2026-06-30:Windows 安装包用 NSIS,不做 MSI

- 决策:`tauri.windows.conf.json` 的 `bundle.targets` 显式锁 `["nsis"]`,不打 MSI。
- 原因:
  1. **Tauri v2 NSIS 是默认主推**——产物体积小、自定义 NSI 脚本灵活、社区生态成熟。
  2. **MSI 需 WiX v3 工具链**——CI 多一道工具链依赖,失败率高,且小白用户对 MSI / NSIS 没区别感知。
  3. **企业部署需求未到**——MSI 的主要优势(Group Policy / 静默部署 / 域控分发)是 B 端企业 IT 场景,v1 不在覆盖范围。
- 替代方案:① MSI;② NSIS + MSI 双打。
- 为什么不用替代方案:① 见原因 2 + 3;② 体积翻倍 + CI 时长翻倍,无对应产品收益。
- 影响范围:`tauri.windows.conf.json` bundle 段 / NSIS 模板 / CI build 时长。
- 后续复查条件:出现「某企业客户必须 MSI 静默部署」的真实需求时,加 MSI target;签名同时落地两种格式即可。

## 2026-06-30:沿用同代码库 + 平台分叉点路线(不分库)

- 决策:不把 `apps/desktop/` 砍成 win / mac 两份 fork;同一份 React + Rust 代码 + 关键点平台分叉(`isWindowsPlatform()` / `cfg(target_os = "windows")` / Tauri `--config tauri.windows.conf.json`)。macOS 相关代码保留为历史资产。
- 原因:仓库现状已沿此路线走得很深(19 个 ts/tsx/rs 文件含平台分叉点,3 套 Tauri override 配置,2 套 doctor 脚本),共享逻辑占 90%+。砍成两份 fork = 砍掉共享层 + 双倍维护,与 4 人团队规模不匹配;主动删 macOS 代码也无收益,保留即可。
- 替代方案:① fork 两份独立仓库(win-desktop / mac-desktop);② 主动砍 macOS 相关代码。
- 为什么不用替代方案:① 共享逻辑(threads / composer / settings / git / 网关接入 / 账号 / Codex RPC 5 层链路 / DS 原语)全要双份维护;② 主动砍 macOS 代码要逐个核查 isMacPlatform() / cfg(target_os = "macos") 调用点,引入新 bug 风险且没人在 post-MVP 之前能拿到收益。
- 影响范围:整个 `apps/desktop` 结构不动;所有 Windows 适配通过新增分叉点或扩充 Tauri windows.conf override 完成;macOS 代码冻结。
- 后续复查条件:若 post-MVP 决定复活 macOS,优先评估「另起仓库」vs「本仓恢复 macOS CI」哪个工程负担更小。

## 2026-06-30:v1 Windows 不做 EV 代码签名

- 决策:v1 发行未签名 NSIS 安装包,用户首次安装需在 SmartScreen 警告页手动点「仍要运行」。
- 原因:① EV 代码签名证书价格 ~¥3000-7000/年 + 需硬件 USB key,小团队前期成本不划算;② 没有签名的 NSIS 安装包在 Windows 上仍能装、能用,只是会过 SmartScreen 警告;③ 比起签名,「Windows 上能装能用」是更紧迫的里程碑。
- 替代方案:① 立即买 EV 证书;② 用免费的 self-signed(等于没签,SmartScreen 一样警告);③ 走 Microsoft Store 上架(审核周期长,Win11 SmartScreen 仍可能拦)。
- 为什么不用替代方案:① 现金流不优先;② 没收益;③ 上架周期与 v1 节奏不匹配。
- 影响范围:NSIS 元数据预埋 publisher 字段,等将来加签名时只补 `signingIdentity` 不动其他结构。
- 后续复查条件:① 真实下载量上来后,因 SmartScreen 流失明显;② 拿到外部投资 / 商业化收入;③ 出现 B 端客户硬性要求签名。

## 被推翻的方案

### 2026-06-30:首发 Windows + macOS 跟随支持

- 原方案(2026-06-30 上午一度采纳):v1 把 Windows 作为首发主战场,macOS 改为「跟随支持」节奏,新功能优先在 Windows 跑通,Mac 不强制每个 PR 同时实测。
- 为什么推翻(2026-06-30 下午):
  1. 「跟随支持」实际操作仍是双平台维护,只是验证强度有偏倚——CI 仍要双 runner、bug 仍要查双平台、跨平台漂移仍要排。4 人团队这点税也吃不动。
  2. 国内用户几乎全在 Windows,「跟随」给 macOS 的也是占用资源、收不回收益。
  3. 「首发 + 跟随」给团队心理上的负担和「同时首发」差不多,只是程度低一点;真正能砍掉负担的是「一次只发一个平台」。
- 替代方案:**MVP 只发 Windows**,macOS 整体推迟到 post-MVP。

### 2026-06-30:双平台同等首发

- 原方案:Win/Mac 同等首发,每个 PR 在两边都跑通才合并。
- 为什么推翻:① 与目标受众错位,会把 macOS 上的精致工程优势浪费在小众平台;② 4 人小团队没能力每 PR 跑两平台验证,会拖慢整个开发节奏。
- 替代方案:见上「MVP 只发 Windows」。

