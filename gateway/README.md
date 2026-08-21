# Gateway

> BlackRain 的公开方向：**开源 Codex App + Cursor 风格的多模型 Auto。**

Gateway 是 BlackRain Desktop 的可选模型协议翻译 sidecar。它把部分 provider 的 Chat Completions 请求/响应翻译为 Codex app-server 可使用的 Responses 形状；原生支持 Responses 的 provider 不需要它。

Gateway 不拥有 thread、turn、Browser 或 UI 状态，也不修改 Codex agent loop。没有 Gateway 时，客户端仍应使用原生 Codex 路径，或显示清晰的 provider 不可用状态。

后续的模型 registry、provider 能力描述、手动选择和 Auto 路由也属于这一侧的公共开发方向。路由策略必须可配置、可测试、可解释，并通过统一诊断链路报告 fallback 和失败原因。

## 当前状态

`gateway.py` 是一个零依赖 Python 原型，用于验证协议翻译和流式事件映射。它不是默认产品依赖，也不代表所有 provider、工具调用、错误和 Windows 发布路径都已完成验证。

## 本地运行

```bash
export DEEPSEEK_API_KEY=<local-secret>
export GW_PORT=8899
python3 gateway/gateway.py
```

支持的环境变量包括：

| 变量 | 用途 |
| --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek provider 的本地密钥 |
| `BLACKRAIN_MODEL_GATEWAY_PROVIDERS` / `GW_PROVIDERS_JSON` | OpenAI-compatible provider registry JSON |
| `GW_PORT` | 监听端口，默认 `8899` |
| `STRIP_TOOLS` | 仅协议诊断时是否移除 tools |
| `GW_LOG` | 脱敏日志路径 |

不要把密钥写入仓库、命令记录或日志。Gateway 只应接收完成模型请求所需的最小数据，不应接收 Browser Cookie、密码或不必要的网页正文。

## 验证边界

原型已有 Responses/Chat 翻译、SSE 和基础工具调用的开发探针。并行工具调用、异常流、热重载、Windows 凭据存储和正式签名发布仍需单独验证。代码或配置变更时，请在 Pull Request 中记录 provider、命令、平台和未验证项。

## 设计参考

参见 [模型提供商](../docs/architecture/model-providers.md) 和 [项目范围](../docs/project-scope.md)。Gateway 的许可证和第三方来源遵循仓库根 [NOTICE](../NOTICE)。
