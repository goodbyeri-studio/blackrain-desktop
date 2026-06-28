# 轻量 Living Spec

`.specs/` 用来记录跨层功能的活文档。它不是审批流程，也不是所有改动都要写的文档；它只服务一个目标：让需求、设计取舍、任务进度和真实验证结果不随聊天记录丢失。

## 什么时候必须写

满足任一条件，就为该功能建一个 spec：

- 跨越两层以上：例如 `apps/desktop` + `gateway` + `CODEX_HOME`，或前端 + Rust 后端 + app-server 协议。
- 会改变运行时边界：例如网关、内核子进程、专属 `CODEX_HOME`、插件/工作台安装、in-app browser。
- 会形成用户可感知的新流程：例如 Providers 面板、工作台入口、插件市场、审批体验。
- 需要多 PR 或多人接手。
- 存在容易漂移的关键假设：例如上游协议、国产模型能力、许可证/合规、安全边界。

这些情况可以不写：

- 文案、样式、小 bug、局部重构。
- 只补测试或只改已有 spec。
- 已有 spec 覆盖，且本次只是完成其中一个任务。

## 命名

每个功能一个目录：

```text
.specs/
  001-providers-model-gateway/
  002-accounts-credits/
  003-dual-engine-architecture/
  004-plugin-catalog/
  005-gui-redesign/
```

编号三位递增，slug 用英文小写短横线。创建时复制 `_template/`。

## 文件职责

| 文件 | 写什么 |
|---|---|
| `requirements.md` | 用户目标、非目标、成功标准、边界 |
| `design.md` | 架构、数据流、接口、失败模式、兼容策略 |
| `tasks.md` | 可执行任务清单，按阶段更新状态 |
| `decisions.md` | 关键决策、理由、日期、被推翻的方案 |
| `verification.md` | 实际跑过的命令、探针、人工验证和未验证风险 |

## 维护规则

- spec 要和代码同 PR 更新。实现改变了需求或设计，就改 spec；验证结果出来了，就写进 `verification.md`。
- `tasks.md` 只记录对交付有意义的任务，不写流水账。
- `decisions.md` 要保留被推翻的旧方案，写清为什么推翻。
- `verification.md` 只写真实跑过的结果，不写“应该可以”。
- 总体战略仍以 `README.md` 和 `docs/01`~`docs/09` 为准；单功能执行以对应 spec 为准。若两者冲突，要在同一个 PR 里修正或明确标注待决。
