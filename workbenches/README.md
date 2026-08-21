# workbenches —— 实验性内容样例

> **状态：实验性目录。** 这里的内容样例不进入默认产品入口或发行包。本文的包格式和生命周期描述不构成实现承诺。

这里存放用于验证内容注入和工具声明的实验性样例，不是 BlackRain Desktop 的核心产品入口。

公共产品定义以 [项目范围](../docs/project-scope.md) 和 [路线图](../docs/roadmap.md) 为准；实验样例若要进入产品，必须先提交独立设计、权限和验证说明。

## 工作台不只是 Markdown

旧的工作台骨架主要由 `AGENTS.md`、Skills 和模板组成，适合验证内容注入，但不足以复制高手电脑。

目标工作台需要能够声明：

- 面向的岗位、领域和标准任务
- Skills 和角色方法
- 插件、CLI、MCP 和专业工具
- Windows、运行时和宿主软件依赖
- 模板、样例、数据连接和项目结构
- 文件、进程、网络和凭据权限
- 安装后健康检查和领域验证
- 版本、来源、License、升级、回滚和卸载

内容关系示例：

```text
Skill + 插件 + 环境 + 资源 + 验证 → 可复用任务内容包
```

## 目标目录草案

```text
workbenches/
└── <workbench-id>/
    ├── workbench.yaml       # v1 Manifest；当前只冻结官方 Windows x64 最小 schema
    ├── README.md
    ├── AGENTS.md            # 可选：角色和工作规则
    ├── skills/
    ├── templates/
    ├── examples/
    ├── tasks/
    ├── environment/
    ├── validation/
    ├── LICENSES/
    └── provenance/
```

目录只是 008 的目标草案。未实现字段不得为追求“看起来完整”而伪造。

## 工作台与项目分离

- 工作台是可分发、可版本化的环境模板。
- 项目是用户安装工作台后创建的运行实例。
- 工作台升级和卸载默认不得删除用户项目。
- 用户凭据、Cookie、业务数据和客户文件不得进入工作台包。

## 当前状态

当前只有 `office-agent/`：

- 人设/规则和三个 Skills 已存在
- `workbench.yaml v1`、tasks/health/smoke 声明和 strict Core inspect 已存在
- OfficeCLI 插件和资源注入骨架已存在
- Windows 资源映射骨架已存在

但以下均未完成：

- install/activate/verify/uninstall 生命周期的 Windows 实机验收
- 宿主 surface 与任务执行合同的代码接线
- Windows 构建、解包、安装和首启验证
- Office 5 场景 × 10 次质量基线
- 升级、回滚、卸载和项目保留验证

因此，`office-agent` 当前是参考内容/注入骨架，不是可发布产品功能。
