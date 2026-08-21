# Office 内容样例

> **状态：实验性内容样例。** 本目录不进入默认产品入口或发行包。本文只记录样例内容和未完成状态。

Office 是用于验证“内容如何声明、检查和复现”的样例，不代表 BlackRain 的产品定位。

> **当前状态**：本目录使用 `workbench.yaml v1`，可被 Core 只读 inspect；这只证明声明、路径和基础依赖元数据可解析。尚无完整 install/health/权限/upgrade/uninstall 生命周期或 Windows 安装验证。

## 想复制的专家环境

一位高阶 Office 用户的电脑通常包含：

- 文档、表格、PPT 和 PDF 工具
- 批处理脚本和命令
- 公司模板和标准目录
- 文件命名、格式和交付规范
- 数据核对和预览习惯
- 修改前备份和失败恢复

本工作台的长期目标是把这些内容封装成小白可以直接使用的专业环境，而不是只提供一个办公聊天机器人。

## 候选任务

- 批量整理、改名和归档文件
- 从 PDF/扫描件提取结构化数据
- 合并多份 Excel 并发现缺失、重复和异常
- 根据模板批量生成 Word / Excel / PPT
- 修正文档版式并生成交付前预览

任务入口应优先选择批量、跨文件、跨格式、多步骤的工作，避免与普通聊天产品的单文档生成正面同质化。

## 当前已有资源

- `AGENTS.md`：Office 工作规则
- `skills/generate-office-deliverable`
- `skills/fix-office-formatting`
- `skills/render-office-preview`
- `plugins/office-cli/`：配套工具内容
- OfficeCLI runtime 资源样例（不代表进入当前 Electron 产品包）

## 进入可发布状态前必须补齐

- 内容包 install/permission/activate 生命周期
- OfficeCLI 来源、License、checksum 和 NOTICE
- Windows 安装后健康检查
- 用户项目模板和任务入口
- 修改前备份、预览、diff 和恢复
- 5 个核心场景 × 10 次真实质量基线
- 升级失败回滚和卸载保留项目

当前 README 描述的是目标，不是已发布能力。
