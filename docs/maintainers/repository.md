# 仓库维护

## 目录职责

```text
apps/desktop/   Electron 应用
gateway/        可选模型协议翻译 sidecar
plugins/        实验性适配器与资源
workbenches/    实验性内容样例
docs/           公开架构、开发和维护文档
```

`apps/desktop/` 是当前产品主线；实验性目录不会自动成为发布依赖。生成的 runtime、签名材料、账号数据、Cookie 和测试输出保持 gitignored。

## 上游策略

- `codex-upstream/` 只读、只用于锁版本和协议比较。
- 上游代码不在本仓库 fork 或修改；BlackRain 通过 app-server 和公开协议接入。
- 上游升级先更新 runtime lock、许可证/NOTICE 和协议 fixture，再运行桌面与 Windows 检查。

## 变更边界

跨 main/preload/renderer、Browser、app-server 或发布资源的改动必须在同一个 Pull Request 中更新相关设计文档、测试和许可证记录。不要把生成文件或本机账号状态提交到仓库。
