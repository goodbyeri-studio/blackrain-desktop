# 路线图

路线图只记录公开的技术目标，不是承诺日期，也不包含内部资源或商业计划。每个目标只有在代码、自动化和必要的 Windows 验证都有证据时，才会在发布说明中标记完成。

## 当前重点

1. 让 Electron main、preload、renderer 和 app-server 的职责保持单一且可测试。
2. 完善 thread/turn、审批、停止、恢复和标准 Codex Home 的桌面闭环。
3. 完善 main-owned Browser 的权限、下载、用户接管、崩溃恢复和多页面生命周期。
4. 降低 Codex 上游版本升级的协议探针、依赖审计和回归成本。
5. 建立可复现的 Windows 打包、签名、安装、升级、回滚和卸载验证。

## 多模型主线

这是 BlackRain 最容易被社区理解和参与的公开方向：**Codex App + Cursor 风格的多模型 Auto。** 当前按以下顺序推进：

1. 统一 provider、模型能力、价格/延迟和可用性描述；
2. 提供可靠的手动模型选择和配置校验；
3. 建立可解释、可测试、可替换的 Auto 路由策略；
4. 补充 fallback、路由评测、用户接管和诊断体验。

其中 Gateway 目前仍是协议翻译原型。第一批可认领任务见 [多模型 Auto RFC #95](https://github.com/goodbyeri-studio/blackrain-desktop/issues/95)。每一项只有在代码、测试和必要的平台验证都有证据后，才会标记为完成。

## 后续技术方向

- 把 Browser Runtime 的中性接口与 Electron/Codex adapter 解耦，方便其他宿主复用。
- 扩展 app-server 事件和模型 provider 的兼容测试。
- 补充性能、可观测性、无障碍和跨平台开发文档。
- 根据真实用户反馈调整默认权限和恢复策略。

## 暂不承诺

路线图不承诺云端账号服务、托管模型、插件市场、工作台平台、移动端发行或任何商业服务。未来若需要这些能力，必须先提交独立的公开设计、许可证审查和安全模型。
