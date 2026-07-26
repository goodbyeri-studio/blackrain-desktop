# Codex App 能力补齐任务

## 阶段 0：能力基线

- [ ] 建立版本化能力矩阵
- [ ] 盘点当前 `codex-rs`、Tauri 壳和拟建 Electron 宿主的能力
- [ ] 为每项能力标记所有权、依赖和验证等级
- [ ] 建立公开来源与 License 记录

## 阶段 1：in-app browser 纵向切片

- [ ] 定义 browser tool / main / renderer 类型合同
- [ ] 创建隔离、持久的 browser partition
- [ ] 实现 view 创建、导航、切换、关闭和恢复
- [ ] 实现用户接管与 agent 控制状态机
- [ ] 实现截图、CDP、下载、权限和弹窗策略
- [ ] 将标准化事件接入可见 UI 与 thread 流程

## 阶段 2：验证与产品化

- [ ] 单元测试权限、导航和控制状态机
- [ ] Playwright Electron E2E 覆盖核心流程
- [ ] Windows 真实站点登录保持与下载验证
- [ ] renderer 崩溃、daemon 重启、离线和权限拒绝恢复验证
- [ ] 记录性能和资源基线
- [ ] 安全与隐私审计

## 阶段 3：后续能力

- [ ] 根据能力矩阵选择下一批 P0/P1 差距
- [ ] 逐项建立责任层、实现 spec 和验证证据
- [ ] 保持产品文案与 `verification.md` 同步
