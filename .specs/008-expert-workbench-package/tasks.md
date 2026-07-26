# 工作台包任务

> **状态（2026-07-26）：暂停。** 不新增或推进工作台任务，除非新的产品决策重新启用本 spec。

- [x] 定义并严格解析 Manifest v1
- [x] 校验 Windows x64 平台、依赖来源、校验和、License 和权限声明
- [x] 实现 Office 官方包的 staging、OfficeCLI 版本检查与 smoke
- [x] 实现激活记录的原子持久化、读取、列表与移除
- [x] 卸载保留用户项目
- [ ] 完成通用依赖引用计数与资源垃圾回收
- [ ] 完成升级和回滚事务
- [ ] 完成 Windows reparse point、真实 OfficeCLI、NSIS 安装/卸载实机矩阵
- [x] 建立工作台会话执行 spec 011 和验证矩阵
