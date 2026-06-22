# gateway —— 模型路由 / Responses⇄Chat 翻译层

架构文档 [03](../docs/03-系统架构.md) 第 ② 层、[05 模型路由](../docs/05-模型路由.md)。把国产模型统一抽象成 OpenAI 兼容客户端，按任务路由；并解决 codex 默认走 Responses、而国产模型多是 Chat Completions 的协议落差。

## 关键约束（接国产模型的命门）

codex 默认 `wire_api="responses"`，网关必须实现 `/v1/responses` 端点 + **Responses⇄Chat 双向翻译**（SSE 语义事件 / function_call / reasoning / 消息重排）。**只翻 Chat Completions 的普通网关对 codex 无效。**

## 选型（两种集成形状，待定）

| 姿态 | 选项 | 取舍 |
|---|---|---|
| **sidecar（v1 最快）** | fork [lich0821/ccNexus](https://github.com/lich0821/ccNexus)（Go, MIT） | 现成、翻译不用自己养；代价=多一个进程 + 多一门语言 |
| **进程内（优雅终态）** | 在 `apps/desktop` 的 Rust 里写翻译线程，难活移植 [cc-switch](https://github.com/farion1231/cc-switch) 的 `transform_codex_chat`/`transform_responses`/`streaming_codex_chat` | 单一二进制单进程；代价=自己养翻译代码 |

> A 阶段可先用 `wire_api="chat"` 直连绕过翻译（见架构 03 第 56 行），但有上游废弃风险，B 阶段收敛到本层。
