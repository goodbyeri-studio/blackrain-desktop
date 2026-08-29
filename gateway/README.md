# Gateway（实验性）

Gateway 是可选的本地模型协议翻译 sidecar，用于研究 BlackRain 的多模型 Provider、Router 和 Auto 扩展。它不是默认产品依赖，也不代表这些扩展已完成。

Gateway 只能转换 provider 协议；它不修改 `codex-rs`，不拥有 thread、turn、Browser 或 UI 状态。未配置时，客户端必须使用原生 Codex 路径或给出明确的降级状态。

```sh
export DEEPSEEK_API_KEY=<local-secret>
export GW_PORT=8899
python3 gateway/gateway.py
```

不要将密钥写入仓库、命令记录或日志。产品边界见[产品定义](../docs/product.md)，架构约束见[架构](../docs/architecture.md)。

## Provider registry 校验

`BLACKRAIN_MODEL_GATEWAY_PROVIDERS`（兼容名 `GW_PROVIDERS_JSON`）必须是 JSON 数组。每个 provider 需要小写 `id`、非空 `name`、绝对 HTTP(S) `base_url` 和 `models` 数组；启用的 provider 至少需要一个模型。Provider id 和同一 provider 内的模型 id 不得重复，禁用的 provider 可以使用空模型列表。

校验错误只报告 `providers[N]` / `models[N]` 位置和规则，不回显 URL、密钥、token 或其他用户值。无效的环境 registry 会被整体忽略并记录脱敏错误，内置 provider 保持可用。离线 fixture 和测试不访问真实 provider：

```sh
python3 -m unittest discover -s gateway -p "test_*.py"
```
