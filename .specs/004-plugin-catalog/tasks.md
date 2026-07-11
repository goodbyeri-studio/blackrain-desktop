# Tasks

> **非 MVP 任务表**:本文是 post-MVP 供给侧 backlog,不参与当前 Windows office MVP 排期。未来启动时的顺序才是**横向 [铺] → 纵向 [铺] → [控] 垫底**;每个包必须分别标记「代码/配置已存在」、「Windows 验证通过」、「发布可分发」,三者不得互相代替。

## 阶段 0：确认边界

- [x] 阅读相关 `README.md` / `docs/` / `AGENTS.md`
- [x] 确认四层能力定义对齐 [.specs/003](../003-dual-engine-architecture/decisions.md)(skill/mcp/acp → 插件 → 工作台 → 公司)
- [x] 确认不触碰 `codex-upstream`，插件全走 skill/MCP/ACP
- [ ] 列出每个 `[铺]` 包的最小 headless 探针命令(填入 verification.md)
- [ ] 逐包跑依赖树 license 扫描(GPL/AGPL/BSL 拦截)
- [ ] GPL/AGPL/BSL/无许可证组件按全仓红线排除；LGPL 候选组件通过法务 + 链接/聚合方式 + Windows 安装包制品审计后，才能进入实现队列

## 阶段 1：横向底座 [铺]（最高 ROI，每个工作台都用）

- [ ] A 类 7 包：fs-ops / pdf-kit / office-docs / image-batch / media-ffmpeg / mail-cal / asset-fetch
- [ ] B 类 3 包：browser-auto / desktop-auto / ocr-vision
- [ ] C 类 4 包：tabular / sql-db / etl-sync / report-bi
- [ ] 验证脚手架最小形态：成果可视化 + 抽检(低验证成本档)

## 阶段 2：纵向无头 [铺]（塞进胖包就能全量铺）

- [ ] D 类无头：dwg-dxf / ifc / geo / stats / spss-stata-gen / 3d-headless（先完成宽松许可证选型）
- [ ] E 类无头：edi / hl7-fhir / dicom / historian-read(只读)
- [ ] F 类：reconcile / voucher（写死自检断言：账平 / 借贷相等）
- [ ] G 类：contract / xbrl
- [ ] 验证脚手架中/高档：dry-run + diff + 自检断言 + 强制确认节点

## 阶段 3：宿主门控 [控]（只给装了正版的人）+ 收口

- [ ] D 类门控：autocad-driver / revit-driver / arcgis-driver / design-driver / nle-driver
- [ ] E 类门控：erp-connector（用友/金蝶/SAP/QuickBooks）
- [ ] 〔门户填报〕作为工作台落地(组合 B 类三包 + 站点适配配方)
- [ ] 更新文档和 spec(本 spec verification.md 填实测结果)
- [ ] 跑完每包 headless 探针
- [ ] 记录未解决风险(动态挂/拔整个 MCP server、[控] 包触达率)
