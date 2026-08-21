# 安全架构

安全边界按“网页不可信、renderer 低权限、main 二次校验、上游 runtime 独立”设计。

## IPC

- preload 只暴露 typed allowlist，不暴露原始 IPC 或 Node。
- main 校验 sender、窗口、schema、workspace/thread、profile 和 generation。
- 外部链接限制为 `http`、`https` 和 `mailto`；文件和命令由 main 规范化并按 allowlist 执行。

## Browser

- 页面不加载应用 preload，也不能访问 `window.blackrain`。
- 导航、弹窗、权限、下载和高影响动作默认拒绝或需要一次性授权。
- 本地 transport 使用随机 endpoint、用户边界、能力 token、client id、长度上限和断连清理。
- 页面内容、截图、下载和 console 都视为不可信输入。

## 凭据与日志

Codex auth 由标准 Codex Home/app-server 按上游语义管理；BlackRain 自有 secret 使用系统安全存储。日志和诊断应脱敏，不保存 token、密码、Cookie 或完整网页正文。

## 供应链

每个 runtime、二进制、字体、图标和依赖都要记录来源、版本、hash 和许可证。安全公告应在 [SECURITY.md](../../SECURITY.md) 的流程中处理；未审查的制品不能进入 release。
