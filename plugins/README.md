# plugins —— 可复用工具能力

> 产品术语以 [docs/04](../docs/04-产品形态.md) 为唯一真源；长期候选目录见 [.specs/004](../.specs/004-plugin-catalog/)；工作台包与生命周期见 [.specs/008](../.specs/008-expert-workbench-package/)。本文只说明 `plugins/` 的仓库边界。

## 插件是什么

插件负责给 Agent 一只新的“手”，打开某个软件、格式、数据源或系统的机器门。

插件可以包含或声明：

- MCP Server
- CLI / 本地可执行程序
- API Connector
- 浏览器或桌面适配器
- 宿主软件桥接
- 运行时依赖
- 权限、凭据和网络数据流
- 配套 Skills、模板和验证

Skill 解决“知道怎么做”，插件解决“有能力去做”。两者是平级基础原语，不把一份 `SKILL.md` 自动视为完整插件，也不把插件自动视为工作台。

## 与工作台的关系

```text
插件（可复用工具能力）
  + Skill（专家方法）
  + 环境 / 资源 / 验证
  = 工作台（完整专家数字工作环境）
```

同一个插件可以被多个工作台引用。插件升级不得静默破坏已安装工作台，最终版本和依赖语义需与 008 对齐。

## 当前目录形态

当前 `office-cli` 使用 Claude Code 兼容内容结构：

```text
plugins/
└── office-cli/
    ├── .claude-plugin/plugin.json
    ├── skills/
    ├── README.md
    └── ...
```

这是现有资源封装方式，不代表 BlackRain 插件 Manifest、市场或生命周期已经完成。

当前已存在：

- `plugins/office-cli/` 内容资源
- OfficeCLI 第三方可执行资源
- 桌面壳中的部分资源注入和 Windows bundle mapping

当前尚未证明：

- NSIS 包内资源真实存在并能运行
- 完整工作台能从已验证激活记录加载插件
- 插件独立安装、升级、回滚和卸载
- 第三方上传、审核、签名和市场分发
- `.specs/004` 的候选插件目录已经实现

## 开发纪律

1. 插件不得修改 codex Agent 循环。
2. 插件不得直接写用户全局 `~/.codex`、系统 PATH 或未声明目录。
3. 第三方代码、二进制和数据必须记录来源、版本、License 和 checksum。
4. 商业宿主软件只做检测和驱动，不复制或分发用户无权再分发的制品。
5. 密钥和账号进入系统凭据存储，不写入仓库、Manifest、日志或模板。
6. 插件能启动不等于工作台任务可交付；真实结论写对应 `verification.md`。

MVP 只维护 Office 参考工作台需要的官方插件能力；公开专家市场属于 post-MVP。
