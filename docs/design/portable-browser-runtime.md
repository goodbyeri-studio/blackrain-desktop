# 可移植 Browser Runtime 设计

Browser 核心的公共目标是：不依赖 BlackRain React UI、BlackRain 专用 IPC 或某个 Codex 生命周期，也能由其他宿主通过 adapter 接入。

## 中性接口

核心只使用中性的 owner、activity、surface、page、tab、route 和 generation 标识。宿主 adapter 负责把它们映射到窗口、thread、turn 和具体 transport。

## 宿主合同

宿主必须提供：

- 页面创建、挂载、隐藏、迁移和销毁；
- 导航、snapshot、locator、输入、截图、下载和权限的受控能力；
- owner/profile/generation 校验和取消；
- 崩溃、断连、用户接管和资源清理事件。

核心不启动另一个浏览器，不读取宿主凭据，不写入 Codex ThreadStore，也不假设某个 UI 框架。

## 当前状态

Electron adapter 是当前参考实现。独立 npm 包、跨宿主稳定 API 和其他 reference host 尚未承诺；公共合同变化应先更新设计文档和测试，再扩大实现范围。
