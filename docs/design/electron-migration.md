# Electron 宿主设计

本文记录公开的宿主设计合同。历史迁移账本、逐项删除记录和内部验收日志不属于公共接口，也不再作为仓库入口。

## 目标拓扑

```text
React renderer
  -> typed preload
  -> Electron main
       ├─ App Server supervisor (stdio JSONL)
       ├─ 文件 / Git / 终端 / 设置 / 更新
       └─ Browser backend (WebContentsView)
```

Electron 是唯一生产宿主。迁移输入只用于理解行为，不形成永久兼容层、第二进程入口或旧 API。

## 能力迁移规则

每项能力先定义宿主无关的产品合同，再由 main/preload 实现；renderer 完成切换和测试后，删除旧调用、旧类型、旧资源与旧文档。新增能力必须明确所有者、输入 schema、错误语义、权限边界和验证命令。

## 发布边界

开发、打包和安装态使用同一 Electron 路径。Electron Forge/Vite/MSIX 负责 Windows 制品；Codex runtime、Node adapter 和许可证文件按 tracked lock 审计后才能进入包。正式签名、安装、升级、回滚和卸载仍需要目标 Windows 实机验证。

## 公开证据

代码存在、自动化通过和产品发布是不同状态。Pull Request 应链接具体测试、制品 hash 和未验证项，不以设计图或历史迁移记录代替结果。
