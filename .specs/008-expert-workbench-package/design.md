# Design

> 本文描述目标方案，不证明任何接口或目录已经实现。当前状态见 [verification](verification.md)。

## 总体方案

BlackRain Core 读取声明式工作台包，先生成可审阅安装计划，再在 App data 的版本化目录中安装受控资源。安装后执行健康检查，通过后才激活给 Hermes/codex。用户项目与工作台资源严格分离。

## 目标目录

```text
workbench-package/
├── workbench.yaml
├── README.md
├── LICENSES/
├── provenance/
│   ├── sources.yaml
│   └── checksums.txt
├── skills/
├── plugins/
├── environment/
│   ├── dependencies.yaml
│   ├── install/
│   └── uninstall/
├── templates/
├── examples/
├── tasks/
│   └── tasks.yaml
└── validation/
    ├── health.yaml
    ├── smoke/
    └── assertions/
```

目录是目标草案。第一版实现可以少于这些文件，但不能把缺失能力写成已完成。

## Manifest 草案

```yaml
schema_version: 1

id: com.blackrain.office
name: Office 办公工作台
version: 0.1.0
publisher: blackrain-official

target:
  domains: [office]
  roles: [office-generalist]
  platforms:
    - os: windows
      arch: x86_64
  blackrain: ">=0.1.0"

engine:
  preferred: work
  allowed: [work]

skills:
  - path: skills/generate-office-deliverable

plugins:
  - id: com.blackrain.office-cli
    version: ">=0.1.0 <1.0.0"

dependencies:
  - id: officecli
    kind: bundled
    version: 0.1.0
    checksum: sha256:...
    license: Apache-2.0

permissions:
  files:
    mode: user-selected-folders
  network:
    domains: []
  processes:
    spawn: [officecli.exe]

tasks:
  source: tasks/tasks.yaml

validation:
  health: validation/health.yaml
  smoke: validation/smoke/basic.yaml

uninstall:
  preserve_user_projects: true
```

字段和命名尚未冻结，实现前需用 JSON Schema 或等价测试锁定。

## 生命周期

```text
发现包
  → 校验 schema / 来源 / checksum / 签名
  → 解析依赖与冲突
  → 生成安装计划
  → 用户审批权限、下载和系统变化
  → 安装到 staging 版本目录
  → 执行健康检查和 smoke
  → 原子激活
  → 创建/绑定用户项目
  → 运行与持续诊断
```

升级：

```text
下载新版本 → staging 安装 → 验证 → 迁移检查
  → 成功：切换 active version
  → 失败：保留旧版本并报告原因
```

卸载：

```text
停用 → 停止受控进程 → 解除引擎注册
  → 删除独占受控资源 → 更新共享依赖引用
  → 保留用户项目 → 报告残留
```

## 本地路径草案

```text
%APPDATA%/BlackRain/
├── workbenches/
│   └── com.blackrain.office/
│       ├── versions/0.1.0/
│       ├── active.json
│       └── state.json
├── plugins/
├── runtimes/
├── cache/
└── logs/

用户选择目录/
└── 某个项目/
    ├── .blackrain/project.yaml
    └── 用户文件...
```

最终 Windows 路径必须使用 Tauri App data API，不在文档中硬编码猜测。

## 架构边界

### 属于 `apps/desktop`

- 包解析和 schema 校验
- 安装计划与审批 UI
- 生命周期状态机
- 受控路径、下载、checksum 和签名
- 依赖引用计数
- 引擎激活适配
- 健康检查、诊断、升级、回滚和卸载

跨 App/Daemon 的领域逻辑先落 `src/shared/*`，两端只做薄适配。

### 属于 `plugins/`

- 可复用工具适配器
- MCP/CLI/API connector
- 插件自身的运行时和 License 声明
- 配套 Skills 和验证

### 属于 `workbenches/`

- 工作台 Manifest
- 工作台直接拥有的 Skills、模板、样例和任务入口
- 对插件和环境的声明式依赖
- 领域验证和文档

### 明确不改

- 不修改 codex/Hermes Agent 循环。
- 不让工作台直接写用户 `~/.codex`。
- 不让安装脚本绕过 App 审批和受控目录。

## 依赖解析

每个依赖解析为安装动作或用户动作：

| kind | Core 行为 |
|---|---|
| bundled | 校验包内 checksum 和 License 后安装到受控目录 |
| managed | 从 allowlist 来源下载、校验后安装 |
| system | 检测本机，不存在时引导用户官方安装 |
| user-provided | 创建配置槽位，由用户提供账号、密钥、文件或 License |

首版不设计通用包管理器。只实现 Office 参考工作台需要的最小依赖集合，再用真实第二垂类检验抽象。

## 引擎激活

Core 根据 `engine.preferred` 选择 surface：

- `work`：把 Skills、MCP、环境和项目路径映射给 Hermes。
- `code`：把 Skills、插件和项目映射给 codex 专属环境。
- 未来如允许 `allowed: [work, code]`，也必须由 Core 在任务边界选择，不在单轮会话中热切。

工作台只是声明者，Core 仍是唯一配置写入者。

## 权限模型

Manifest 声明最大权限，用户安装时确认，运行时可以进一步收紧。

权限类别：

- 文件：用户选择目录、只读/读写、模板目录
- 网络：域名 allowlist、用途、是否传输用户内容
- 进程：允许启动的二进制
- 系统：注册表、Shell、管理员权限
- 凭据：需要哪些 secret 槽位
- 宿主软件：需要控制哪些已安装应用

首版遇到未声明行为应失败并解释，不自动扩大权限。

## 验证模型

验证分三层：

1. **包验证**：schema、签名、checksum、License、路径安全。
2. **环境验证**：依赖、版本、可执行性、网络和账号连接。
3. **领域验证**：标准任务、输出断言、人工抽检和已知风险。

验证结果记录工作台版本、Windows 版本、模型、插件版本和日期，避免旧证据冒充当前兼容。

## 失败模式

- schema 不兼容：拒绝安装并提示所需 Core 版本。
- 下载或 checksum 失败：清理 staging，不改变 active version。
- 系统依赖缺失：停在可恢复等待状态，引导用户处理。
- 健康检查失败：不激活新版本。
- 升级迁移失败：回滚旧版本，保留诊断。
- 工作台进程残留：强制回收受控进程并报告。
- 卸载遇到共享依赖：仅减少引用，不删除仍在使用的资源。
- 用户项目被修改：不自动删除或覆盖。

## 测试策略

- schema 单元测试
- 路径穿越、checksum、权限和恶意包测试
- 生命周期状态机测试
- Office 参考工作台 Windows 安装/升级/卸载集成测试
- 干净 VM 的 NSIS → 工作台 → 项目 → 任务 E2E
- 失败注入：断网、磁盘满、依赖冲突、健康检查失败、进程残留
- License/NOTICE 制品检查
