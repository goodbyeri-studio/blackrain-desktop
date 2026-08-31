# 上游与来源

## 可作为产品依赖

| 项目 | 用途 | 边界 |
| --- | --- | --- |
| [openai/codex](https://github.com/openai/codex) | `codex-rs` / `codex app-server` | Apache-2.0；以锁定、未修改的 runtime 调用 |
| [Electron](https://www.electronjs.org/docs/latest/tutorial/security) | 桌面宿主与安全模型 | 依赖其公开 API 和文档 |

`codex app-server` 是唯一 agent runtime。上游版本、hash 和许可证以 `apps/desktop/resources/**/runtime-lock.json` 与相邻 manifest 为准，不以本文版本号为准。

## 只可参考的对象

官方 Codex Desktop 是闭源 Electron 产品。可以参考其公开文档与可观察行为，不能复制、反编译、提取或再分发其 UI、Browser backend、Computer Use backend、私有 bundle、字体、图标、服务或其他专有资源。

Paseo、Computer Use 类项目和其他开源桌面项目仅提供工程研究素材；它们不会成为 BlackRain 的 runtime、产品上游或默认依赖。

CodexMonitor 是现有仓库部分 Electron/React 文件的历史来源，正在逐域退役，不能被描述为当前产品基础。只要这些文件或其衍生部分仍在分发，MIT 归属必须保留，详见根目录 [NOTICE](../NOTICE)。

## 许可证规则

BlackRain 自有代码按 [MIT](../LICENSE) 分发。第三方代码、二进制、字体、图标和资源继续遵循各自许可证，不能被本仓重新授权。新增内容必须记录来源、版本、许可证和必要的 hash/NOTICE；AGPL/GPL/BSL 或无许可证内容须经单独法律审查后才能进入发行物——MIT 分发物一旦混入 copyleft 依赖，整个发行边界都要重新评估。

BlackRain 与 OpenAI、官方 Codex Desktop、ChatGPT、Paseo、Cursor 和 CodexMonitor 维护者均无官方隶属关系。
