# Verification

> 本 spec 是 post-MVP 目录与粒度规则,尚无目录实现,故下表全部为「未跑」。未来落地时只写真实跑过的结果,并分开记录「代码/配置存在」、「Windows 验证通过」、「发布可分发」。当前 MVP 不验收这张全目录。

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
| — | D/3d-headless | 宽松许可证引擎选型 + headless 渲染 | 未跑 | Blender(GPL) 已按全仓红线排除，不作为候选实现 |
| — | E/edi | pyx12/badX12 转换 | 未跑 | |
| — | E/hl7-fhir | hl7apy 解析 | 未跑 | |
| — | E/dicom | pydicom 元数据/脱敏 | 未跑 | |
| — | E/historian-read | OPC UA 只读 | 未跑 | 控制端不做 |
| — | F/reconcile | 账平断言 | 未跑 | 自检骨架 |
| — | F/voucher | 借贷相等断言 | 未跑 | 自检骨架 |
| — | G/contract | docx diff + ocr | 未跑 | |
| — | G/xbrl | Arelle 校验 | 未跑 | |
| — | 全部 | 依赖树 license 扫描(pip-licenses/uv) | 未跑 | GPL/AGPL/BSL 拦截 |
| — | 协议 | 对话中途挂/拔整个 MCP server | 未跑 | 承重假设；会话接入见 011 |

## 已验证

- 当前没有可证明插件目录已接入 Session Orchestrator 的运行时证据。本目录任一候选插件均不能据此视为已实现、已安装或可发行。

## 未验证风险

- **动态挂/拔整个 MCP server**：尚未形成执行 surface 的真实接入与验证证据。
- **`[控]` 包触达率**：依赖用户是否已装正版宿主软件，无法在我方环境完整验证，需真实用户环境抽测。
- **离线模型体积**：PaddleOCR / rembg 等离线模型会推高胖包体积，大概率需要独立按需下载，不进入主包；仍待实测。
- **平台 wheel 差异**:MVP 若抽取单包使用,只验收 Windows x64;其他平台是 post-MVP 资产。
- **许可证分发合规**：GPL/AGPL/BSL/无许可证组件已按全仓红线排除；FFmpeg LGPL build 尚未完成法务与 Windows 安装包制品审计，不得视为可发行。

## 失败记录

- 暂无。
