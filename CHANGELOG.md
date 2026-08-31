# Changelog

项目仍处于快速迭代阶段，当前版本不承诺稳定 API 或跨版本 Browser Runtime 兼容。

## Unreleased

- 建立公开仓库的许可证、NOTICE、安全、治理和贡献入口。
- 重定义产品为基于 `codex-rs` / `codex app-server` 的开源 Codex Desktop：先对齐官方闭源 Codex Desktop，Router、多模型 Provider、Gateway 和 Auto 后置为 BlackRain 扩展。
- 将产品发布优先级改为 macOS；托管模型和团队能力不在本仓范围。
- 将文档收敛为产品、架构、Browser、开发和上游五份真源，并保留 ADR 记录长期决策。
- 清理旧站点、生成验证产物和私有产品资料，避免它们被误当成发布内容。
- 删除已废弃旧蓝图（工作台市场、插件生态、内容平台化）的全部脚手架：`plugins/`、`workbenches/`、`src/features/workbenches/`，以及无宿主 API 的 `workbench*` / `office*` 导出。
- 将许可证改回 MIT（ADR 0005 取代 0004），删除 `COMMERCIAL-LICENSE.md`。

正式版本说明会在 GitHub Releases 中记录，并附上 commit、Codex runtime 锁、macOS 制品哈希和验证范围。
