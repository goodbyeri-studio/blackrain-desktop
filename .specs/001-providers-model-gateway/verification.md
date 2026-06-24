# Verification

## 验证矩阵

| 日期 | 范围 | 命令/方式 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-06-24 | spec 创建 | 文档落地 | 通过 | 尚未改实现代码 |
| 2026-06-24 | Gateway Python 语法 | `python3 -m py_compile gateway/gateway.py` | 通过 | registry 改造后执行 |
| 2026-06-24 | Gateway `/v1/models` smoke | `DEEPSEEK_API_KEY=dummy GW_PORT=8898 python3 gateway/gateway.py` + `curl -s http://127.0.0.1:8898/v1/models` | 通过 | 返回 DeepSeek 模型和 provider 元数据；未调用真实模型 |
| 2026-06-24 | Gateway `/v1/models` smoke | `GW_PORT=8898 DEEPSEEK_API_KEY=sk-test-secret-123456789 GW_LOG=/tmp/blackrain-gateway-smoke.log python3 gateway/gateway.py` + `curl -s http://127.0.0.1:8898/v1/models` | 通过 | 返回 DeepSeek 模型和 provider 元数据；未调用真实模型 |
| 2026-06-24 | Gateway 未知路径 smoke | `curl -s http://127.0.0.1:8898/v1/unknown` | 通过 | 返回 JSON 404 错误 |
| 2026-06-24 | 前端类型检查 | `cd apps/desktop && npm run typecheck` | 通过 | `tsc --noEmit` |
| 2026-06-24 | 前端 lint | `cd apps/desktop && npm run lint` | 通过 | 0 errors；保留仓库既有 5 个 hook dependency warnings |
| 2026-06-24 | Design-system guard | `cd apps/desktop && npm run lint:ds` | 通过 | 0 errors；同上 5 个既有 warnings |
| 2026-06-24 | 模型列表测试 | `cd apps/desktop && npm run test -- src/features/models/hooks/useModels.test.tsx src/features/models/utils/modelListResponse.test.ts` | 通过 | 2 files / 9 tests |
| 2026-06-24 | 设置页测试 | `cd apps/desktop && npm run test -- src/features/settings/components/SettingsView.test.tsx src/features/settings/hooks/useAppSettings.test.ts` | 通过 | 2 files / 48 tests；保留既有 act warning |
| 2026-06-24 | 设置页 + 模型列表 targeted 测试 | `cd apps/desktop && npm run test -- src/features/settings/components/SettingsView.test.tsx src/features/models/hooks/useModels.test.tsx src/features/models/utils/modelListResponse.test.ts` | 通过 | 3 files / 52 tests；保留既有 act warning |
| 2026-06-24 | 前端全量测试 | `cd apps/desktop && npm run test` | 通过 | 140 files / 1032 tests；保留既有 act warning 和一处预期错误日志 |
| 2026-06-24 | Rust 后端检查 | `cd apps/desktop/src-tauri && cargo check` | 通过 | 仅仓库既有 dead_code/unused_unsafe warnings |
| 2026-06-24 | 模型网关 shared core 单测 | `cd apps/desktop/src-tauri && cargo test model_gateway_core` | 通过 | lib + daemon 编译目标均通过 |
| 2026-06-24 | 模型网关 shared core 单测 | `cd apps/desktop/src-tauri && cargo test model_gateway_core` | 通过 | 4 tests；新增 registry env、config 写入测试 |
| 2026-06-24 | App sidecar + 前端 targeted 测试 | `cd apps/desktop && npm run test -- src/services/tauri.test.ts src/features/settings/components/SettingsView.test.tsx src/features/models/hooks/useModels.test.tsx src/features/models/utils/modelListResponse.test.ts` | 通过 | 4 files / 116 tests；保留既有 act warning |
| 2026-06-24 | 公开 MVP hardening 类型检查 | `cd apps/desktop && npm run typecheck` | 通过 | API key 安全存储设置页接入后执行 |
| 2026-06-24 | 公开 MVP hardening lint | `cd apps/desktop && npm run lint` | 通过 | 0 errors；保留仓库既有 5 个 hook dependency warnings |
| 2026-06-24 | 公开 MVP hardening Rust 检查 | `cd apps/desktop/src-tauri && cargo check` | 通过 | 新增 `keyring` 依赖和密钥命令后执行；仅仓库既有 warnings |
| 2026-06-24 | 模型网关 + 密钥模块单测 | `cd apps/desktop/src-tauri && cargo test model_gateway` | 通过 | 6 tests；lib + daemon 目标均通过；同时命中 bundle resource 过滤测试 |
| 2026-06-24 | Tauri bundle resource 测试 | `cd apps/desktop/src-tauri && cargo test bundle_resources_include_model_gateway_sidecar` | 通过 | 断言 base/windows config 均打包 `gateway/gateway.py` |
| 2026-06-24 | 公开 MVP hardening 前端 targeted 测试 | `cd apps/desktop && npm run test -- src/services/tauri.test.ts src/features/settings/components/SettingsView.test.tsx src/features/models/hooks/useModels.test.tsx src/features/models/utils/modelListResponse.test.ts` | 通过 | 4 files / 116 tests；保留既有 act warning |
| 2026-06-24 | 协议四探针 | `python3 .scratch/m0_protocol_probe.py "$PWD/codex-upstream/codex-rs/target/debug/codex-app-server" "$PWD/.scratch/m1_5-codex-home" "$PWD/.scratch/m1_5-workspace"` | 通过 | `blackrain_gateway` 配置下 initialize/model-list/thread-start/turn-start 均 PASS |
| 2026-06-24 | 真实 DeepSeek 工具调用 | `BLACKRAIN_GATEWAY_API_KEY=local-test-gateway python3 .scratch/m0_tool_driver.py "$PWD/codex-upstream/codex-rs/target/debug/codex-app-server" "$PWD/.scratch/m1_5-codex-home" "$PWD/.scratch/m1_5-workspace"` + `STRIP_TOOLS=0` Gateway | 通过 | 看到 `commandExecution`，生成 `.scratch/m1_5-workspace/hello.txt`，内容为 `2049` |
| 2026-06-24 | 设置页 readiness / empty state targeted 测试 | `cd apps/desktop && npm run test -- src/features/settings/components/SettingsView.test.tsx src/services/tauri.test.ts` | 通过 | 2 files / 109 tests；验证缺 key、缺模型时禁用 Gateway 启动 |
| 2026-06-24 | 真实 macOS Keychain smoke | `cd apps/desktop/src-tauri && BLACKRAIN_KEYCHAIN_SMOKE=1 cargo test real_system_credential_store_smoke_when_enabled -- --nocapture` | 通过 | lib + daemon 目标均完成真实写入、读取、状态查询、清理 |
| 2026-06-24 | 无签名 macOS app/dmg 打包 | `cd apps/desktop && npx tauri build --bundles app,dmg --config '{"bundle":{"createUpdaterArtifacts":false}}' --no-sign` | 通过 | 产出 `BlackRain2049.app` 和 `BlackRain2049_0.7.68_aarch64.dmg` |
| 2026-06-24 | `.app` 资源 smoke | `plutil -p .../BlackRain2049.app/Contents/Info.plist` + `test -f .../Resources/gateway/gateway.py` + `ast.parse(...)` | 通过 | 包内 `CFBundleDisplayName` / `CFBundleName` 均为 `BlackRain2049`，gateway 脚本存在且语法正常 |
| 2026-06-24 | dmg 挂载资源 smoke | `hdiutil attach ...BlackRain2049_0.7.68_aarch64.dmg -readonly` 后检查 `BlackRain2049.app/Contents/Resources/gateway/gateway.py` | 通过 | 从 dmg 视角确认 gateway 资源存在、语法正常、包名正确 |
| 2026-06-24 | 包内二进制短启动 smoke | `HOME=.scratch/package-smoke-home .../BlackRain2049.app/Contents/MacOS/codex-monitor` | 通过 | 8 秒内保持运行；退出后无残留 `gateway.py` 进程 |
| 2026-06-24 | diff whitespace | `git diff --check` | 通过 | 无 whitespace error |
| 2026-06-25 | 网关语法 | `python3 -m py_compile gateway/gateway.py` | 通过 | bearer 校验 + 去 CORS 改造后执行 |
| 2026-06-25 | 网关鉴权/去 CORS smoke | `GW_PORT=8897 BLACKRAIN_GATEWAY_API_KEY=… python3 gateway/gateway.py` + `curl` | 通过 | `/health` 免鉴权 200；`/models` 无/错 token 401、正确 token 200；响应无 `Access-Control-*` 头 |
| 2026-06-25 | 模型网关 Rust 测试 | `cd apps/desktop/src-tauri && cargo test model_gateway` | 通过 | 6 + 1 tests；密钥来源下沉 shared core 后执行 |
| 2026-06-25 | Rust 后端检查 | `cd apps/desktop/src-tauri && cargo check` | 通过 | 仅仓库既有 dead_code 告警 |

## 已知历史验证

- 2026-06-23：仓库文档记录 M0 已跑通壳前端、内核编译、协议四探针。
- 2026-06-23：`gateway/README.md` 记录最小 `gateway.py` 已让 DeepSeek 经翻译驱动 Codex 多轮工具调用。

这些历史验证说明方向可行，但本 spec 实现后必须重新跑验证矩阵，不能只引用历史结果。

## 已验证

- spec 目录和五个文档已创建。
- M1 边界已明确：配置第三方 API、模型网关设置页、模型选择器适配 Gateway registry。
- `gateway/gateway.py` 已从 DeepSeek 专用脚本改成 provider/model registry，支持内置 DeepSeek + 环境变量追加 OpenAI-compatible provider。
- `scripts/dev-client.sh` 已改为 Codex 只连接 `blackrain_gateway`，第三方 provider 不进入 Codex config。
- Settings 已新增“模型网关”页面，可新增 provider、启停 provider、删除 provider、手动录入模型、测试连接、刷新 `/models`、设置默认模型。
- Settings 已新增 Gateway 启动 readiness：缺 provider、缺 key、缺模型时禁用启动并展示明确 empty/error 状态。
- App Tauri command 和 Daemon RPC 均已接入 provider 测试连接、模型列表刷新，并复用同一个 shared core。
- App 已托管 Gateway sidecar：启动、停止、状态、健康检查、端口、日志路径；启动时写入 `blackrain_gateway` Codex config。
- 缺省 `CODEX_HOME` 已指向 App data 下的专属 `codex-home`，避免默认写用户 `~/.codex`。
- Settings 已接入 provider API key 输入、保存、清除和状态展示；真实 key 走系统凭据存储，settings/Codex config 不落明文。
- macOS Keychain 真实写入、读取、状态查询和清理 smoke 已通过。
- Provider 测试连接、刷新模型和 Gateway sidecar registry 会优先读取系统凭据中的 key，缺失时再回退环境变量。
- Tauri base/windows 打包配置已纳入 `gateway/gateway.py` resource，并用 cargo test 守护。
- macOS 无签名 app/dmg 已完成真实打包、dmg 挂载资源检查和包内二进制短启动 smoke。
- 普通对话模型选择器已合并 Gateway/App registry，新增 provider 能进入 selector。
- Gateway 日志已加入 API key / token / secret 基础脱敏。
- 真实 DeepSeek 单工具多轮调用已通过：Gateway `STRIP_TOOLS=0` 时能触发内核 `commandExecution` 并完成收尾。
- 网关已强制 bearer 校验并移除 CORS：`/models`、`/responses` 需正确 `BLACKRAIN_GATEWAY_API_KEY`，`/health` 免鉴权；App spawn 时注入的 token 与内核继承的 token 由 `ensure_gateway_token()` 保证一致。
- provider 测试连接/刷新模型的密钥来源已下沉 shared core（内联 → 系统凭据 → 环境变量），App 命令与 Daemon RPC 行为一致。

## 未验证风险

- 正式公开分发仍缺签名、公证、updater 私钥配置验证；当前只完成 `--no-sign` app/dmg 打包与短启动 smoke。
- 多 provider registry 的模型 ID 别名策略只做了本地前端测试和 DeepSeek 兼容验证，尚未跑真实第二 provider。
- 系统凭据仅完成 macOS Keychain smoke；Windows Credential Manager / Linux Secret Service 尚未实机验证。
- Gateway provider 热重载仍通过重启进程完成，未做运行时 reload。
- 并行多工具、3+ 轮深循环、namespace 工具仍未验证。

## 失败记录

- 2026-06-24：真实工具调用第一次失败，原因是 app-server 环境缺 `BLACKRAIN_GATEWAY_API_KEY`；补本地 gateway token 后继续验证。
- 2026-06-24：真实工具调用第二次只返回文本，没有触发工具，原因是 Gateway 默认 `STRIP_TOOLS=1`；改为 `STRIP_TOOLS=0` 后真实 `commandExecution` 通过。
- 2026-06-24：`cd apps/desktop && npm run tauri:build` 已生成 app/dmg/updater tar.gz，但最终因缺 `TAURI_SIGNING_PRIVATE_KEY` 失败；改用 `--no-sign` 且关闭 updater artifact 后完成 app/dmg MVP smoke。这是发布签名配置缺口，不是 model gateway 资源打包缺口。
