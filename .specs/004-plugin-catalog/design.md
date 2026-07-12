# Design

> **状态（2026-07-12）**：本文是长期插件候选目录，不是 MVP 实现说明。表中出现某个库/引擎，只表示候选供给单元，不表示已进代码、通过 License 审计或可发行。Office 是参考工作台；完整工作台包协议见 [.specs/008](../008-expert-workbench-package/)。

## 总体方案

一句话：**插件按“工具/格式/系统适配器”切，Skill 按任务方法铺，工作台把插件、Skill、环境、资源和验证组合成专家数字工作环境。** 用户按领域和岗位浏览工作台；系统按运行时与 License 管理插件制品。

## OS 心智模型(定位一切的尺子)

```text
Agent 底座 (codex / Hermes)  = 执行内核
插件                          = 可安装工具包/适配器
Skill                         = 专家操作手册与任务方法
工作台                        = 专家配置好的可复现电脑环境
项目                          = 用户基于工作台创建的运行实例
```

关键推论：**不会给每个任务做一个包。** 没人做 `apt install 把视频转竖屏`——只装 `ffmpeg` 包，再用脚本(skill)组合它。这把尺子决定了插件数量锁在 ~30 量级，而任务覆盖面靠数百 skill 配方扩展。

## 粒度铁律

> **插件 = 一个「引擎 / 格式适配器」+ 它的原生操作族 = 一个 MCP server = 一个 `@`。**
> **任务级的东西(转竖屏、改图框、出门窗表、周报看板)不是插件，是 skill 配方，住在工作台层。**

| 层 | 是什么 | 数量级 | 谁造 |
|---|---|---|---|
| 插件层 | 工具 / 格式 / 系统适配器 | ~34 候选 | 平台、工具作者、封装者 |
| Skill 层 | 任务方法、模板和辅助资源 | 数百 | 领域专家与封装者 |
| 工作台层 | 插件 + Skill + 环境 + 资源 + 验证 | 按岗位/垂类 | 专家与封装者共同完成 |

## 切分规则(终结「合并还是拆」之争)

- **打包单元按「运行时 + license」边界切；浏览分类按「领域」归。**
- **合并**：同运行时 + 同 license + 几乎总一起用 → 并一个包。
- **拆分**：不同运行时 / 不同 license / 一个无头开源一个要正版宿主 → 拆两个包，但货架上归同一类。

合并示例：ImageMagick+Pillow+EXIFTool → `image-batch`；FFmpeg+ffprobe → `media-ffmpeg`；HL7v2+FHIR → `hl7-fhir`；X12+EDIFACT → `edi`。
拆分示例：CAD = `dwg-dxf`[铺] ✂ `autocad-driver`[控]；BIM = `ifc`[铺] ✂ `revit-driver`[控]；医疗 = `hl7-fhir`(文本) ✂ `dicom`(二进制影像)。

## 两层模型

- **浏览层(货架，给用户看)= 7 大类**：A 通用底座 / B 网页与系统操作 / C 数据与报表 / D 专业软件机器门 / E 行业数据交换 / F 财务逻辑 / G 法律合规。
- **打包层(制品，实际装什么)≈ 34 单元**：`[铺]` = 无头开源，进本地胖包，全量用户可用(~28)；`[控]` = 需用户已装正版宿主软件(~6)。
- **配方层(用户眼里的功能)= 数百 skill**：广撒网撒的是这层，近零成本。

## 全量目录

### A 通用底座(7，全 [铺])

| 包 | 引擎 | 覆盖能力 | license |
|---|---|---|---|
| fs-ops | shell/pathlib | 批量改名/移动/分类/去重/目录整理/转格式 | 自写 |
| pdf-kit | pypdf/pikepdf/pdfplumber | 拆合/提取/盖章/脱敏/表单填充/目录生成 | BSD/MIT |
| office-docs | openpyxl/python-docx/python-pptx | Word/Excel/PPT 读写/模板/批改/样式 | MIT |
| image-batch | ImageMagick/Pillow/rembg/GIMP Script-Fu | 尺寸/水印/压缩/抠图/套色/批导出 | Apache/MIT |
| media-ffmpeg | FFmpeg(LGPL build)/ffprobe/exiftool | 转码/裁剪/字幕/水印/抽帧/批导出 | LGPL/Artistic |
| mail-cal | IMAP/SMTP/Graph | 附件抽取/归档/模板回复/日程 | 自写 |
| asset-fetch | 搜图/生图生视频 API/公开数据 | 食材获取(文档标注的自建缺口) | 自写 |

### B 网页与系统操作(3 [铺]，+1 工作台)

| 包 | 引擎 | 覆盖能力 | license |
|---|---|---|---|
| browser-auto | Playwright | 填表/下载/抓表/后台操作 | Apache |
| desktop-auto | Windows UIA/pywinauto | GUI-only 本地软件/键鼠/窗口/截图 | BSD |
| ocr-vision | PaddleOCR | 截图/表格/票据/界面元素识别 | Apache |

> 〔门户填报〕= `browser-auto + desktop-auto + ocr-vision` 的编排 + 站点适配配方，**是工作台不是插件**(无新运行时)。

### C 数据与报表(4，全 [铺])

| 包 | 引擎 | 覆盖能力 | license |
|---|---|---|---|
| tabular | pandas/duckdb | CSV/Excel/Parquet 清洗/合并/透视/公式/校验 | BSD/MIT |
| sql-db | SQLAlchemy + ODBC/JDBC | SQLite/MySQL/PG/SQL Server 查询生成 | MIT |
| etl-sync | requests/schedule | API 拉取/字段映射/定时同步/导入导出 | Apache |
| report-bi | matplotlib/模板引擎 | 图表/日周报/看板/PDF·Excel·PPT 报告 | 多源(查兼容) |

### D 专业软件机器门(每垂类 1 [铺] + ≤1 [控])

| 包 | 引擎 | 铺/控 | 覆盖能力 |
|---|---|---|---|
| dwg-dxf | ezdxf | [铺] | DWG/DXF 改图框/层/文字/批量导 PDF |
| autocad-driver | AutoLISP/COM/accoreconsole | [控] | 需 AutoCAD：复杂出图/原生命令 |
| ifc | IfcOpenShell | [铺] | 房间号/门窗表/材料清单/模型数据导出 |
| revit-driver | pyRevit/Dynamo | [控] | 需 Revit：族参数/明细表/实时改模 |
| geo | GeoPandas/GDAL/Shapely | [铺] | 叠加/面积/投影/缓冲/裁剪/专题图 |
| arcgis-driver | arcpy | [控] | 需 ArcGIS：原生地理处理工具链 |
| stats | statsmodels/scipy/rpy2 | [铺] | 统计流程跑数 + 出表 |
| spss-stata-gen | 生成 .sps/.do | [铺] | 给宿主软件生成可执行语法 |
| design-driver | PS/AI ExtendScript-UXP | [控] | 需 PS/AI：批量动作/原生滤镜 |
| 3d-headless | 待选宽松许可证引擎/自研适配器 | [铺·待选] | 3D 批渲染/格式转换 |
| nle-driver | Premiere/DaVinci Python API | [控] | 需 NLE：原生时间线/渲染队列 |

> Blender 为 GPL，只能放在仓库外作架构参考，不进入 BlackRain 仓库或安装包；`3d-headless` 必须另选宽松许可证引擎。FFmpeg LGPL build 仍只是候选技术路线，是否进入 Windows 安装包待链接方式、许可证义务、依赖树和最终制品审计，详见 [decisions](decisions.md)。

### E 行业数据交换(4 [铺] + 1 [控])

| 包 | 引擎 | 铺/控 | 覆盖能力 |
|---|---|---|---|
| edi | pyx12/badX12 | [铺] | X12 + EDIFACT 订单/发票/发货通知/字段映射 |
| hl7-fhir | hl7apy/fhir.resources | [铺] | HL7v2 ↔ FHIR 字段整理(文本报文) |
| dicom | pydicom | [铺] | 影像元数据/脱敏/建索引(非诊断) |
| historian-read | OPC UA/Historian client | [铺·只读] | 能耗/停机/OEE 报表；**控制端写入不做** |
| erp-connector | 用友/金蝶/SAP BAPI/QuickBooks SDK | [控] | 凭证/对账/报表/导入模板(接 ERP API) |

### F 财务逻辑(2，全 [铺])

| 包 | 引擎 | 覆盖能力 | 自检骨架 |
|---|---|---|---|
| reconcile | pandas + 勾稽规则 | 银行/台账/发票多方比对 | **账必平**断言 |
| voucher | 凭证规则引擎 | 凭证生成 | **借贷必相等**断言 |

> reconcile/voucher 把引擎自带硬规则(账平、借贷相等)写成插件内部自检断言——顺手成为验证骨架，零额外成本。

### G 法律/合规(2，全 [铺])

| 包 | 引擎 | 覆盖能力 |
|---|---|---|
| contract | python-docx + diff + ocr-vision | 合同装配/抽条款/版本比对/异常审阅清单 |
| xbrl | Arelle | XBRL/iXBRL 标注 + 校验 + 申报包生成 |

**合计**：7 浏览类 × ~34 打包单元(~28 [铺] + ~6 [控]) × 数百 skill 配方。每垂类最佳数 = 1 个 [铺] 无头(全量铺) + 至多 1 个 [控] 宿主驱动；横向底座 14 个被所有工作台共用。

## 验证脚手架(横切能力，按垂类伸缩，不是闸门)

> **验证层不决定哪个插件存在，只决定每个工作台交付时怎么自证对错，且力度随垂类验证成本伸缩。** 这是 reach-first(造哪些)与护城河(怎么让人信)的分界，见 [03 系统架构](../../docs/03-系统架构.md) ④验证层。

| 验证成本档 | 垂类 | 脚手架力度 |
|---|---|---|
| 低 | 网文/媒体/图像/文件 | 成果可视化 + 抽检即可 |
| 中 | 数据报表/CAD 几何/PDF 提取 | dry-run 预览 + diff 报告 + 抽样比对 |
| 高 | 财务/XBRL/数据汇总 | 引擎自检断言(账平/schema 校验)+ 强制人工确认节点 |

## 架构边界

> 以下是未来实现边界。当前代码状态必须回到 `verification.md` 与仓库代码核对。

- 属于 `apps/desktop` 的逻辑：插件管理界面、`@` 调用入口、工作台右侧挂载面板、验证脚手架的可视化呈现(dry-run/diff/确认节点 UI)。
- 属于 `gateway` 的逻辑：无。插件不经网关；网关只管 CODE 路径的 responses⇄chat 翻译。
- 属于 `plugins` / `workbenches` 的内容：插件是可复用工具适配器及配套资源；工作台是按 008 声明依赖、环境、任务和验证的专家环境包。
- 明确不改 `codex-upstream` 的部分：agent 循环、工具调用、沙箱、审批。插件全部走 skill/MCP/ACP 扩展机制接入。

## 数据流

```text
用户安装/激活工作台，或在任务中临时启用插件
  -> App UI / 工作台生命周期（008）
  -> 按需起 MCP/CLI 进程并注册 skill+tools
  -> Hermes(working)或 codex(coding)调插件 tool
  -> 插件驱动 [铺]无头库 / [控]宿主软件 API
  -> 结果经验证脚手架(可视化 / diff / 自检断言)
  -> 回到 UI 呈现成果(非命令行日志)
```

## 接口与配置

- Tauri command / JSON-RPC：插件激活可包含起停 MCP 进程和 `tools/list_changed`；完整工作台 inspect/install/activate/uninstall 由 008 另行实现。
- `config.toml` / `CODEX_HOME`：插件资产放进专属 `CODEX_HOME/plugins/<name>/`；不污染用户原有 `~/.codex`。
- 文件布局：插件包的最终 manifest 与资源布局需和 008 对齐；`[控]` 包必须声明宿主软件依赖、版本、权限和不可再分发边界。
- license 元数据：每包标注 license + `[铺]`/`[控]` + 依赖树扫描结果(GPL/AGPL/BSL 一律拦)。

## 失败模式

- 上游协议失败：MCP server 起不来 → UI 标「插件不可用」，不崩会话。
- 模型/网关失败：与插件无关(插件不经网关)。
- 配置损坏：插件资产缺失 → 跳过该插件 + 告警。
- 权限/沙箱失败：`[控]` 包检测不到宿主软件(未装 AutoCAD/Revit…) → 优雅降级，UI 提示「需先安装 X」，reach 受限是预期行为。
- 用户可见降级：`[铺]` 库 headless 跑不起来(平台 wheel 缺失) → 该平台胖包剔除该包并记录。
- 验证失败：脚手架自检不过(账不平/schema 不符) → **拦住交付 + 大白话提示**，不静默放行。

## 测试策略

- 单元测试：未来进入实现的每个 `[铺]` 包,首先在 Windows x64 跑核心操作 headless smoke。
- 集成测试：未来在 Windows 上验证工作台挂载 → 动态注册工具 → 拔载注销的全链路。
- 协议探针：MCP server 起停 + `tools/list_changed` 动态发现(对话中途挂/拔整个 server，见 003 待实测项)。
- 人工验证：每垂类拿真实文件抽样跑一遍，核对验证脚手架力度是否匹配该档验证成本。
