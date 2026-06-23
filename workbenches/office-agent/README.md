# Office Agent 工作台

面向下沉市场的办公智能体工作台。目标不是让用户学习 Office 操作,而是让用户直接说任务,系统帮他产出真正能交付的文档。

## 典型任务

- 写一份通知、总结、方案、汇报材料
- 按模板批量生成合同、报价单、申请表
- 从 Excel 数据生成分析结论和图表
- 自动做汇报 PPT
- 对现有 Word / Excel / PPT 做修改、润色、统一格式

## 默认能力

- 内置 OfficeCLI 文档引擎
- 可与本地文件、模板、表格数据联动
- 后续可扩展 Windows COM 兜底能力

## 内置技能

- `generate-office-deliverable`: 直接产出 Word / Excel / PPT 文件
- `fix-office-formatting`: 修正文档版式和结构问题
- `render-office-preview`: 渲染预览结果并做交付前检查

## 交互原则

- 入口是任务,不是功能
- 默认给选项,不是白纸输入框
- 每一步尽量落成文件成果
