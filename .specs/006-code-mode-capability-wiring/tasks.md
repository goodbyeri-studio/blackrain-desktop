# Tasks

> 历史批次勾选表示「5 层包装 + 当时基线编译/shape 验证」,不表示当前 rust-v0.144.5 / `87db9bc` 已重验或 GUI 已落地。MVP 只接受 Windows 冒烟结果。

## 第 1 批:A 类 bdd282f 新增(验证 pattern)✅ 完成 2026-06-28
- [x] `thread/delete` 全 5 层(clone archive)— **验证 pattern 样板,cargo check + typecheck 双绿**
- [x] `thread/deleted` 通知 — **确认免代码**:app_server.rs:1025 `else if has_method` 泛化自动转发到前端,GUI 监听即可
- [x] `thread/items/list`(experimentalApi;带 turnId/cursor/limit 可选参数;会话历史浏览新入口)
- [x] `thread/backgroundTerminals/list`(experimentalApi;带 cursor/limit)
- [x] `thread/backgroundTerminals/terminate`(experimentalApi;带 processId)
- [x] `environment/info`(带 environmentId)

## 第 2 批:Skills/Plugin/Marketplace 管理(决策 #3 头号目标)✅ 完成 2026-06-28
- [x] `skills/config/write`、`skills/extraRoots/set`、`hooks/list`
- [x] `plugin/list`、`plugin/installed`、`plugin/read`、`plugin/install`、`plugin/uninstall`、`plugin/skill/read`
- [x] `marketplace/add`、`marketplace/remove`、`marketplace/upgrade`
- 全 5 层接通,cargo check 6.28s 零错误、12 方法零 unused 警告;typecheck 通过

## 第 3 批:B 类其余
### 3a Thread 高级 ✅ 完成 2026-06-28
- [x] `thread/search`、`goal/{set,get,clear}`、`memoryMode/set`+`memory/reset`、`metadata/update`、`settings/update`、`unarchive`、`loaded/list`、`shellCommand`、`backgroundTerminals/clean`、`approveGuardianDeniedAction`
- 13 方法全 5 层;9 typed + 4 Value-透传;cargo check 6.93s 零错误;shape 探针 13/13 OK(guardian 假阳性已复测排除)

### 3b 其余 ✅ 完成 2026-06-28
- [x] `modelProvider/capabilities/read`、`experimentalFeature/enablement/set`、`permissionProfile/list`、`account/logout`
- [x] MCP 深度:`mcpServer/oauth/login`、`mcpServer/resource/read`、`mcpServer/tool/call`
- [x] Windows 沙箱:`windowsSandbox/setupStart`、`windowsSandbox/readiness`
- [x] 外部迁移:`externalAgentConfig/detect`、`import`、`import/readHistories`
- 12 方法全 5 层(10 typed + 2 Value);cargo check 6.37s 零错误;shape 探针 12/12 OK

## 收尾
- [x] `verification.md` 已记录 `bdd282f`→`cfead68` 的编译/typecheck/shape 实测结果
- [ ] 对当前锁定 `87db9bc` 重跑全量 capability shape 探针,刷新 stub/认证/实验门控结论
- [ ] Windows `npm run tauri:dev:win` 冒烟(IPC→command→daemon→app-server 粘合 + GUI 能调用/能降级)
- [ ] spec 005 逐项落地 GUI;不因 `@services/tauri.ts` 导出函数存在就勾选
