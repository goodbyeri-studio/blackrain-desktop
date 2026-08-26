# Gateway（实验性）

Gateway 是可选的本地模型协议翻译 sidecar，用于研究 BlackRain 的多模型 Provider、Router 和 Auto 扩展。它不是默认产品依赖，也不代表这些扩展已完成。

Gateway 只能转换 provider 协议；它不修改 `codex-rs`，不拥有 thread、turn、Browser 或 UI 状态。未配置时，客户端必须使用原生 Codex 路径或给出明确的降级状态。

```sh
export DEEPSEEK_API_KEY=<local-secret>
export GW_PORT=8899
python3 gateway/gateway.py
```

不要将密钥写入仓库、命令记录或日志。产品边界见[产品定义](../docs/product.md)，架构约束见[架构](../docs/architecture.md)。
