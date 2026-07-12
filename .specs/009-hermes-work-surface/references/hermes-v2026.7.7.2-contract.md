# Hermes v2026.7.7.2 HTTP/SSE contract 审计

> 本文是对 `hermes-upstream` 锁定提交 `9de9c25f620ff7f1ce0fd5457d596052d5159596`（tag `v2026.7.7.2`）的静态源码审计。它用于冻结 BlackRain adapter 的输入边界，不代表 BlackRain 已接入，也不代表 Windows 产品验证通过。

## 证据范围

主要真源：

- `gateway/platforms/api_server.py`
- `tests/gateway/test_api_server.py`
- `tests/gateway/test_api_server_runs.py`

版本化样例位于：

- `apps/desktop/src-tauri/test-fixtures/hermes/v2026.7.7.2/`

fixtures 是按锁定源码人工脱敏、稳定化后的 contract 样例，不是网络抓包，不包含真实 token、用户内容或机器路径。

## 认证与连接边界

- BlackRain 只允许连接 supervisor 分配的 `127.0.0.1:<managed-port>`。
- 除公开的 `GET /health` 外，产品使用的 API 均按 bearer 认证处理。
- `Authorization: Bearer <API_SERVER_KEY>` 为主认证头。
- `GET /v1/capabilities` 的 `auth.required` 可反映上游是否配置 key；BlackRain 正式模式必须配置非空 key，不能以 `false` 作为可接受生产状态。
- `/v1/runs` 可接受 `X-Hermes-Session-Key` 作为长期记忆/网关 session scope；它不等于 approval namespace。上游将每个 run 的 approval namespace 强制隔离为 `run_id`。

## 端点

| 方法 | 路径 | 用途 | 关键响应 |
|---|---|---|---|
| `GET` | `/health` | 无认证轻量存活检查 | `{status, platform, version}` |
| `GET` | `/v1/capabilities` | 功能协商 | capabilities object |
| `GET` | `/v1/models` | 模型和 route alias | OpenAI 风格 list |
| `POST` | `/v1/runs` | 创建结构化任务 | HTTP 202 `{run_id,status:"started"}` |
| `GET` | `/v1/runs/{run_id}` | 查询可轮询状态 | `hermes.run` |
| `GET` | `/v1/runs/{run_id}/events` | 消费结构化 SSE | `data: <JSON>\n\n` |
| `POST` | `/v1/runs/{run_id}/approval` | 响应审批 | approval response object |
| `POST` | `/v1/runs/{run_id}/stop` | 中断任务 | `{run_id,status:"stopping"}` |

capabilities 还声明 `/api/sessions`、session messages/fork/chat 等资源。它们用于后续 resume/session 接缝，不能在未接入前写成 BlackRain 已支持。

## 创建 run

BlackRain 首版实际需要的请求字段：

```json
{
  "input": "整理项目中的季度报告",
  "instructions": "只在当前项目目录工作",
  "session_id": "session_demo_001",
  "model": "hermes-agent",
  "conversation_history": [
    {"role": "user", "content": "沿用上一轮格式"},
    {"role": "assistant", "content": "好的"}
  ]
}
```

约束：

- `input` 必填，可为字符串或消息数组；空输入返回 OpenAI 风格 400。
- `conversation_history` 若存在必须是含 `role`、`content` 的对象数组。
- 显式 `conversation_history` 优先于 `previous_response_id`。
- `session_id` 是对话/记忆 scope；未提供时上游默认使用 `run_id`。
- `model` 可命中 `model_routes` alias；BlackRain 不应自行猜测 route，必须先读 models/capabilities。

## Run status

稳定字段：

```text
object = "hermes.run"
run_id
status
created_at
updated_at
session_id
model
last_event（发生事件后）
output + usage（完成后）
error（失败后）
```

源码可产生的状态至少包括：`queued`、`running`、`waiting_for_approval`、`stopping`、`completed`、`failed`、`cancelled`。BlackRain raw contract 必须保留未知状态，不能因上游新增状态反序列化失败。

## SSE framing

正常事件：

```text
data: {"event":"message.delta",...}\n\n
```

30 秒无事件时可能发送：

```text
: keepalive\n\n
```

run 结束时发送注释并关闭：

```text
: stream closed\n\n
```

### 关键恢复限制

锁定版本的事件流是进程内单队列：

- 没有 event cursor、`Last-Event-ID` 或 replay API。
- consumer 断开时 handler 会从 `_run_streams` 移除该队列。
- 已消费事件不会由上游重放。
- terminal run status 最长在内存中保留约 1 小时；未消费的 stream 约 5 分钟后清理。

因此 BlackRain 的恢复策略必须是：本地持久化已归一化事件并幂等去重；断流后查询 run status 收敛终态；若 run 仍活跃但事件流不可恢复，明确标记 `degraded/orphaned`，不得伪造丢失的工具或审批事件。fake server 必须覆盖这一语义。

## Run events

所有已知事件都包含 `event`、`run_id`、`timestamp`。raw decoder 必须保留额外字段和未知事件。

### `message.delta`

```json
{"event":"message.delta","run_id":"run_demo_001","timestamp":1783814400.1,"delta":"已完成"}
```

### `tool.started`

```json
{"event":"tool.started","run_id":"run_demo_001","timestamp":1783814400.2,"tool":"read_file","preview":"读取季度报告"}
```

锁定 API 不转发完整 `args`，只有 `tool` 和 `preview`。WORK UI 不能承诺始终能展示完整参数。

### `tool.completed`

```json
{"event":"tool.completed","run_id":"run_demo_001","timestamp":1783814400.3,"tool":"read_file","duration":0.245,"error":false}
```

锁定 API 不携带工具结果正文，结果可能只体现在后续消息或最终 output 中。

### `reasoning.available`

```json
{"event":"reasoning.available","run_id":"run_demo_001","timestamp":1783814400.4,"text":"正在检查表格结构"}
```

该字段是上游选择性暴露的 reasoning preview，不应被描述为完整思维链。

### `approval.request`

上游先复制 approval payload、对 `command` 脱敏，再补充：

```json
{
  "event":"approval.request",
  "run_id":"run_demo_001",
  "timestamp":1783814400.5,
  "command":"python generate_report.py",
  "description":"生成季度报告文件",
  "pattern_keys":["shell"],
  "choices":["once","session","always","deny"]
}
```

approval payload 的可选字段由工具侧提供，BlackRain 必须容忍字段缺失，并在 UI 中按实际数据展示来源和影响。

### `approval.responded`

```json
{"event":"approval.responded","run_id":"run_demo_001","timestamp":1783814400.6,"choice":"once","resolved":1}
```

### 终态事件

- `run.completed`：`output`、`usage.input_tokens/output_tokens/total_tokens`
- `run.failed`：脱敏后的 `error`
- `run.cancelled`：无额外必需字段

## Approval 请求与响应

请求：

```json
{"choice":"once","resolve_all":false}
```

- canonical choice：`once | session | always | deny`。
- `approve | approved | allow` 会被上游归一为 `once`，BlackRain 不应依赖这些 alias。
- `all` 或 `resolve_all` 可批量处理当前 run 的队列，不能跨 run。
- 没有 active/pending approval 时返回 409，而不是静默成功。

## 错误 contract

HTTP 错误使用 OpenAI 风格包裹：

```json
{
  "error": {
    "message": "Run not found: run_missing",
    "type": "invalid_request_error",
    "param": null,
    "code": "run_not_found"
  }
}
```

BlackRain `WorkError` 需要同时保留 HTTP status、上游 code、可展示 message、request id 和可重试性；不能只把 body 压成字符串。

## Skills external_dirs contract

锁定 commit `9de9c25` 的 `agent/skill_utils.py` 提供原生 `skills.external_dirs`：

- 从当前 `HERMES_HOME/config.yaml` 读取 `skills.external_dirs`。
- 相对路径以 `HERMES_HOME` 为根，绝对路径保持绝对；不存在的目录会跳过。
- 本地 `HERMES_HOME/skills` 始终排第一，external dirs 按配置顺序追加并去重。
- cache key 包含 config path 与 `mtime_ns`，配置原子替换后后续扫描会读取新目录。
- prompt builder、slash skill commands、skill tools 和 credential mount 都消费 `get_all_skills_dirs()`；无需修改 Agent loop。
- `/reload-skills` 会清理 skill command/prompt cache，但它不是隔离机制，也不能代替 Core 对并发 activation 的门禁。

本仓验证：

```text
hermes-upstream/.venv/bin/python -m pytest \
  hermes-upstream/tests/agent/test_external_skills.py \
  hermes-upstream/tests/agent/test_external_skills_dirs_cache.py -q
17 passed
```

BlackRain 只把 008 已验证且运行时再次检查的 roots 写入该字段；不允许工作台或前端直接提供 config 片段。

## MCP config、注册和工具变更 contract

锁定 commit `9de9c25` 的 `tools/mcp_tool.py` 原生读取 `config.yaml` 顶层 `mcp_servers`。BlackRain 首版只使用 stdio transport，受控配置字段为：

```yaml
mcp_servers:
  "com.blackrain.office-files":
    command: "C:\\...\\plugins\\installed\\...\\office-mcp.exe"
    args: ["--stdio"]
    timeout: 300
    connect_timeout: 30
    supports_parallel_tool_calls: false
```

边界：

- `register_mcp_servers()` 在 Hermes agent build 时按当前配置注册 server，并把 server tools 加入原生 registry；BlackRain 不修改 Agent loop。
- stdio `command` 支持绝对路径。BlackRain 不使用 Hermes 的 `cwd`、任意 `env`、HTTP/SSE transport 或 OAuth 配置；命令和参数只能来自 Core 的 verified plugin runtime store。
- server 自己发出 `notifications/tools/list_changed` 后，上游后台重新执行 `tools/list`，原子刷新该 server 的工具集合并移除 stale tools；不需要 BlackRain 重建或伪造 tool registry。
- `tools/list_changed` 只覆盖“已注册 server 内部的工具集合变化”，不等于新增或删除整个 server。锁定版本没有供 BlackRain HTTP surface 调用的 server unregister/reload API。
- 因此首版整体 server 注册/注销采用 idle-only config replacement + Hermes 受控 restart：有任何 active WORK run 时 fail closed；空闲时停止旧 Hermes（Windows 使用 process-tree 回收）、写入新 binding、重启并恢复 task/session metadata。Skills-only binding 变化不触发 restart。
- runtime 必须安装锁定的 `mcp` extra；否则 `tools.mcp_tool` 的 SDK import 不完整，配置存在也不能作为 MCP 可用证据。

本仓锁定上游验证：

```text
hermes-upstream/.venv/bin/python -m pytest \
  hermes-upstream/tests/tools/test_mcp_register_wakes_stale.py \
  hermes-upstream/tests/tools/test_mcp_tool.py::TestMCPServerTask::test_refresh_tools_deregisters_removed_tools \
  hermes-upstream/tests/tools/test_mcp_tool.py::TestRegisterMcpServers -q
8 passed, 1 条既有 unknown mark warning
```

该证据证明锁定 Hermes 的注册与 `list_changed` contract，不证明 BlackRain Windows runtime、真实 MCP 子进程或 Office 工具已实测。
