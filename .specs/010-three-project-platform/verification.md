# Verification

> 仓库创建和文档存在只证明治理动作，不证明 Cloud/Relay 服务、部署、计费或商业运营可用。

## 验证矩阵

| 日期 | 范围 | 命令/方式 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-07-12 | 名称占用与权限 | `gh auth status`; `gh repo view goodbyeri-studio/<name>` | 通过 | 当前账号有 `admin:org`/`repo`；执行前两个新仓和 Desktop 新名均不存在 |
| 2026-07-12 | 文档与 spec | 静态审阅；`jq empty apps/desktop/src-tauri/tauri.conf.json`; `git diff --check` | 通过 | 文档、010 五件套和 updater URL 存在；不代表服务实现 |
| 2026-07-12 | GitHub 仓库 | `gh repo view`; `gh api repos/goodbyeri-studio/<name>` | 通过 | Desktop/Cloud 为 private，Relay 为 public；三仓 Squash=true、merge/rebase=false、delete branch=true |
| 2026-07-12 | Desktop 远端 | `git remote -v`; `git ls-remote --symref origin HEAD` | 通过 | `origin=https://github.com/goodbyeri-studio/blackrain-desktop.git`，HEAD=`main` |
| YYYY-MM-DD | Cloud/Relay 合同 | token exchange + usage webhook integration tests | 未跑 | 尚无实现 |
| YYYY-MM-DD | 双引擎产品 E2E | Windows Desktop -> Cloud -> Relay -> 模型 | 未跑 | 发布门槛 |

## 已验证

- 三项目产品边界和目标可见性已由用户确认。
- New API 当前采用 AGPLv3，并对修改版 UI 要求保留署名与原项目链接；Relay 接受该义务。
- GitHub 已存在私有 `goodbyeri-studio/blackrain-desktop`、私有 `goodbyeri-studio/blackrain-cloud` 和公开 `goodbyeri-studio/blackrain-relay`。
- Desktop 保留原历史与 `main`；Cloud/Relay 当前为空仓，尚无初始提交、代码或服务。

## 未验证风险

- Cloud 与 Relay 是已创建的空仓目标，尚无初始提交，也未实现 broker、对账、部署、监控或备份。
- New API Responses 虽已有路由和转换代码，尚未通过 BlackRain codex app-server 严格协议探针。
- AGPL 组合、模型厂商转售条款、支付、发票、ICP备案/跨境和内容合规尚未完成正式审查。

## 失败记录

- 暂无。
