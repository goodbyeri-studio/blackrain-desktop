# Verification

> 本 spec 是目录与粒度规则的活文档，尚无实现，故下表全部为「未跑」。撒网落地时(见 [tasks.md](tasks.md))逐包填实测结果，只写真实跑过的，不写「应该可以」。每个 `[铺]` 包的最低门槛 = **能 headless 跑通**(无 GUI、无宿主软件依赖)。

## 验证矩阵

| 日期 | 范围 | 命令/方式 | 结果 | 备注 |
|---|---|---|---|---|
| — | A/fs-ops | headless smoke | 未跑 | |
| — | A/pdf-kit | pypdf 拆合 + pdfplumber 提取 | 未跑 | |
| — | A/office-docs | openpyxl/python-docx 读写 | 未跑 | |
| — | A/image-batch | ImageMagick + Pillow 批处理 | 未跑 | rembg 模型体积待测 |
| — | A/media-ffmpeg | FFmpeg(LGPL build)转码 | 未跑 | 确认 LGPL build 可用 |
| — | A/mail-cal | IMAP/SMTP 收发 | 未跑 | |
| — | A/asset-fetch | 搜图/生图 API 联通 | 未跑 | |
| — | B/browser-auto | Playwright headless | 未跑 | |
| — | B/desktop-auto | pywinauto(Win) | 未跑 | 仅 Windows |
| — | B/ocr-vision | PaddleOCR 离线 | 未跑 | 模型体积待测 |
| — | C/tabular | pandas/duckdb | 未跑 | |
| — | C/sql-db | SQLAlchemy 多库连通 | 未跑 | |
| — | C/etl-sync | API 拉取 + 字段映射 | 未跑 | |
| — | C/report-bi | 图表 + 报告生成 | 未跑 | matplotlib license 已确认 |
| — | D/dwg-dxf | ezdxf 改图框 + 导出 | 未跑 | |
| — | D/ifc | IfcOpenShell 读模型 | 未跑 | |
| — | D/geo | GeoPandas/GDAL | 未跑 | |
| — | D/stats | statsmodels | 未跑 | |
| — | D/spss-stata-gen | 生成 .sps/.do | 未跑 | |
| — | D/blender | bpy headless 渲染 | 未跑 | 独立进程聚合，GPL 合规待确认 |
| — | E/edi | pyx12/badX12 转换 | 未跑 | |
| — | E/hl7-fhir | hl7apy 解析 | 未跑 | |
| — | E/dicom | pydicom 元数据/脱敏 | 未跑 | |
| — | E/historian-read | OPC UA 只读 | 未跑 | 控制端不做 |
| — | F/reconcile | 账平断言 | 未跑 | 自检骨架 |
| — | F/voucher | 借贷相等断言 | 未跑 | 自检骨架 |
| — | G/contract | docx diff + ocr | 未跑 | |
| — | G/xbrl | Arelle 校验 | 未跑 | |
| — | 全部 | 依赖树 license 扫描(pip-licenses/uv) | 未跑 | GPL/AGPL/BSL 拦截 |
| — | 协议 | 对话中途挂/拔整个 MCP server | 未跑 | 承重假设，见 003 |

## 已验证

- 暂无(本 spec 无实现)。

## 未验证风险

- **动态挂/拔整个 MCP server**：Hermes 原生支持 `tools/list_changed`(已挂载工作台中途变工具已部分验证，见 [003 verification](../003-dual-engine-architecture/verification.md))，但「对话中途新挂/拔掉整个 server」仍待实测。
- **`[控]` 包触达率**：依赖用户是否已装正版宿主软件，无法在我方环境完整验证，需真实用户环境抽测。
- **离线模型体积**：PaddleOCR / rembg 等离线模型会推高胖包体积，与 [003](../003-dual-engine-architecture/decisions.md) 的 230-250MB 基础包目标的冲突待测(大概率独立按需下载，不进主包)。
- **平台 wheel 差异**：cryptography/PIL/pydicom 等原生 wheel 需 Win/Mac/Linux 各构建。

## 失败记录

- 暂无。
