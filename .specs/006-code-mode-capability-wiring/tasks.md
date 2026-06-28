# Tasks

> 每簇完成判据:`cd apps/desktop/src-tauri && cargo check` 通过 + `cd apps/desktop && npm run typecheck` 通过。

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
- [ ] Thread 高级:`thread/search`、`goal/{set,get,clear}`、`memoryMode/set`+`memory/reset`、`metadata/update`、`settings/update`、`unarchive`、`loaded/list`、`shellCommand`、`backgroundTerminals/clean`、`approveGuardianDeniedAction`
- [ ] `modelProvider/capabilities/read`、`experimentalFeature/enablement/set`、`permissionProfile/list`、`account/logout`
- [ ] MCP 深度:`mcpServer/oauth/login`、`mcpServer/resource/read`、`mcpServer/tool/call`
- [ ] Windows 沙箱:`windowsSandbox/setupStart`、`windowsSandbox/readiness`
- [ ] 外部迁移:`externalAgentConfig/detect`、`import`、`import/readHistories`、`import/progress`

## 收尾
- [ ] 用户 `tauri dev` 冒烟测试(字段级兼容 + GUI 接得上)
- [ ] verification.md 记录实测命令与结果
