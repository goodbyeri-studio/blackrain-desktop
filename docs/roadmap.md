# 路线图

路线图记录公开技术方向，不承诺日期。完成状态必须同时有代码、自动化和必要的平台验证。

## 当前重点

1. 完成 Windows 签名、安装、升级、回滚和卸载验证。
2. 稳定 Electron main、preload、renderer 与 app-server 的职责边界。
3. 完善 thread/turn、审批、停止、恢复和标准 Codex Home 闭环。
4. 完善 main-owned Browser 的权限、下载、用户接管和崩溃恢复。

## 多模型主线

多模型与 Auto 按以下顺序推进：

1. 统一 provider、模型能力、价格/延迟和可用性描述；
2. 提供可靠的手动模型选择和配置校验；
3. 建立可解释、可测试、可替换的 Auto 路由策略；
4. 补充 fallback、路由评测、用户接管和诊断体验。

当前 Gateway 是协议翻译原型；Auto 仍在开发中，相关任务见 [Issue #95](https://github.com/goodbyeri-studio/blackrain-desktop/issues/95)。

## 后续技术方向

- 把 Browser Runtime 的中性接口与 Electron/Codex adapter 解耦，方便其他宿主复用。
- 扩展 app-server 事件和模型 provider 的兼容测试。
- 补充性能、可观测性、无障碍和跨平台开发文档。
- 根据真实用户反馈调整默认权限和恢复策略。

## 暂不承诺

云端账号服务、托管模型、插件市场、工作台平台、移动端发行和商业服务不属于当前承诺范围。
