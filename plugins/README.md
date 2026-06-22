# plugins —— 能力封装层：插件 / 工作台

架构文档 [03](../docs/03-系统架构.md) 第 ③ 层、[04 工作台与插件](../docs/04-工作台与插件.md)。

两个核心概念一对一落地到 Codex 的扩展机制（纯 Markdown，零编译）：

| 产品概念 | 技术构成 |
|---|---|
| **插件**（单一能力积木） | 一个 skill / 一个 MCP server / 一个 connector |
| **工作台**（布置好的房间） | 预置 AGENTS.md + 一组 skills + 若干 MCP 数据源 + 模板 + 脚手架好的工作目录 |

## 插件单位标准

抄 Claude Code 插件格式（已验证成熟、且有 agentskills.io 跨工具标准背书，不锁死 Anthropic）：

- 插件 = 目录 + `.claude-plugin/plugin.json` + `skills/`（每个 `SKILL.md`）/ `commands/` / `agents/` / `hooks/` / `mcpServers`
- 市场 = git 仓库根 `marketplace.json`，commit 即版本，source 支持 path/github/url/git-subdir/npm

## 目录约定（待落地）

```
plugins/
  <plugin-name>/
    .claude-plugin/plugin.json
    skills/<skill>/SKILL.md
workbenches/   ← 已存在于仓库根，工作台模板
```

> 本目录 v1 先放手搓的第一个垂类插件（Spike 0：验证「AI 带小白用+改」体验），跑通再考虑沙盒/市场基建。
