# 安全政策

BlackRain Desktop 会处理本地代码、凭据、浏览器登录态和网页内容。请不要在公开 issue、讨论区或 Pull Request 中报告未修复的安全问题。

## 报告方式

优先使用 GitHub 的 [Private Vulnerability Reporting](https://github.com/goodbyeri-studio/blackrain-desktop/security/advisories/new)。如果仓库尚未开启该入口，请先联系项目维护者并等待私下确认，再发送复现细节。

报告应尽量包含：受影响版本或 commit、操作系统、最小复现步骤、影响范围、日志/截图（脱敏后）以及建议的修复方向。请移除 API key、Cookie、token、客户数据和真实网页内容。

## 响应边界

维护者会先确认收到报告，再评估影响、修复版本和公开时间。安全修复发布前不会公开利用细节。Windows 安装包、签名材料和上游 Codex runtime 的安全问题可能需要同时向对应上游项目报告。

## 使用建议

- 只在可信项目目录中运行 Agent，并对审批、下载、登录和不可逆操作保持人工确认。
- 不要把真实密钥写入仓库、日志、截图、fixture 或 issue。
- Browser profile、Cookie、模型上下文和 Codex Home 应按高敏感本地数据处理。
